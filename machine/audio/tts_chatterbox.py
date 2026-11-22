"""Chatterbox provider (expressive open-source TTS) with the user-approved preset `narrator_c2`.

Flow: narration tokens → sentence groups (≤ group_words) → chatterbox_worker.py in the models/cbx venv
→ played faster by `speedup` (pitch rises with speed, like the reference narrator; no time-stretch
artifacts) → word timings by offline ASR (sherpa-onnx CTC) aligned to the known tokens → narration.wav
(44.1 kHz mono, −16 LUFS) + words.json (ARCHITECTURE §9).
First use installs the venv and the model (audio/install_chatterbox.sh, ~3.5 GB, needs HuggingFace hosts).
"""
from __future__ import annotations

import difflib, json, os, re, subprocess, sys, time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(ROOT / "pipeline"))
import audiolib as al  # noqa: E402
import text as T  # noqa: E402

VENV_PY = ROOT / "models" / "cbx" / "bin" / "python"
ASR_DIR = ROOT / "models" / "eval" / "sherpa-onnx-nemo-ctc-en-conformer-small"
ASR_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
           "sherpa-onnx-nemo-ctc-en-conformer-small.tar.bz2")


def preset(name):
    presets = json.loads((HERE / "voices.json").read_text())
    if name not in presets:
        raise SystemExit(f"unknown chatterbox voice preset '{name}' (known: {', '.join(presets)})")
    return presets[name]


def ensure_installed():
    ok = VENV_PY.exists() and subprocess.run([str(VENV_PY), "-c", "import chatterbox"], capture_output=True).returncode == 0
    if not ok:
        print("[tts] installing Chatterbox (first use, several minutes)…", file=sys.stderr)
        subprocess.run(["bash", str(HERE / "install_chatterbox.sh")], check=True)


def ensure_asr():
    if ASR_DIR.exists():
        return
    import io, tarfile, urllib.request
    print("[tts] downloading the ASR model for word timings…", file=sys.stderr)
    ASR_DIR.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(ASR_URL) as r:
        tarfile.open(fileobj=io.BytesIO(r.read()), mode="r:bz2").extractall(ASR_DIR.parent)


def make_groups(toks, max_words):
    """Token index ranges: whole sentences, packed up to max_words (a long sentence stays whole)."""
    sents, cur = [], []
    for i, w in enumerate(toks):
        cur.append(i)
        if re.search(r"[.!?][\"”')]*$", w):
            sents.append(cur); cur = []
    if cur:
        sents.append(cur)
    groups, g = [], []
    for s in sents:
        if g and len(g) + len(s) > max_words:
            groups.append(g); g = []
        g = g + s
    if g:
        groups.append(g)
    return groups


def asr_words(wav16):
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=str(ASR_DIR / "model.int8.onnx"),
                                                      tokens=str(ASR_DIR / "tokens.txt"), num_threads=2)
    sr, out, start = 16000, [], 0
    hop = int(0.02 * sr)
    env = np.sqrt(np.convolve(wav16 ** 2, np.ones(hop) / hop, mode="same"))
    while start < len(wav16):
        end = min(len(wav16), start + 20 * sr)
        if end < len(wav16):
            lo, hi = end - 2 * sr, min(len(wav16), end + 2 * sr)
            end = lo + int(np.argmin(env[lo:hi]))
        if end - start < int(0.3 * sr):
            break
        st = rec.create_stream(); st.accept_waveform(sr, wav16[start:end]); rec.decode_stream(st)
        r = st.result
        first = True
        for tok, ts in zip(r.tokens, r.timestamps):
            if tok.startswith(("▁", " ")) or first:
                out.append([tok.lstrip("▁ "), start / sr + ts]); first = False
            else:
                out[-1][0] += tok
        start = end
    return [(w, t) for w, t in out if w]


def align(toks, groups, gtimes, hyp, duration):
    """Start time per token: ASR matches, group starts as anchors, char-proportional interpolation."""
    n = len(toks)
    start = [None] * n
    ref = [T.norm(w) for w in toks]
    sm = difflib.SequenceMatcher(None, ref, [T.norm(w) for w, _ in hyp], autojunk=False)
    for a, b, k in sm.get_matching_blocks():
        for d in range(k):
            start[a + d] = max(0.0, hyp[b + d][1] - 0.02)
    for g, (gs, ge) in zip(groups, gtimes):
        i0 = g[0]
        if start[i0] is None or abs(start[i0] - gs) > 0.35:
            start[i0] = gs
        for i in g:  # matches outside their group window are wrong
            if start[i] is not None and not (gs - 0.2 <= start[i] <= ge + 0.1):
                start[i] = None
        start[i0] = start[i0] if start[i0] is not None else gs
    # interpolate gaps inside each group by character length
    for g, (gs, ge) in zip(groups, gtimes):
        known = [i for i in g if start[i] is not None]
        bounds = known + [None]
        for k, i in enumerate(known):
            j = bounds[k + 1]
            seg = list(range(i + 1, j if j is not None else g[-1] + 1))
            if not seg:
                continue
            t0, t1 = start[i], (start[j] if j is not None else ge - 0.15)
            w = [len(toks[x]) + 1 for x in [i] + seg]
            acc = np.cumsum(w) / sum(w)
            for x, frac in zip(seg, acc[:-1]):
                start[x] = t0 + (t1 - t0) * frac
    # monotone
    for i in range(1, n):
        start[i] = max(start[i], start[i - 1] + 0.03)
    res = []
    for i in range(n):
        e = start[i + 1] - 0.01 if i + 1 < n else min(duration, start[i] + 0.6)
        res.append({"i": i, "text": toks[i], "start": round(start[i], 3), "end": round(max(e, start[i] + 0.02), 3)})
    return res


def synthesize(episode, out_dir, voice="narrator_c2", threads=4):
    t0 = time.time()
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    P = preset(voice)
    ensure_installed(); ensure_asr()
    toks = T.words(T.narration(episode))
    groups = make_groups(toks, P.get("group_words", 22))
    job = {"groups": [" ".join(toks[i] for i in g) for g in groups], "prompt": str(ROOT / P["prompt"]),
           "exaggeration": P["exaggeration"], "cfg_weight": P["cfg_weight"], "temperature": P["temperature"],
           "seed": P.get("seed", 7), "gap": P.get("gap", 0.05), "threads": threads,
           "out": str(out_dir / "chatterbox_raw.wav")}
    (out_dir / "chatterbox_job.json").write_text(json.dumps(job, indent=1))
    env = dict(os.environ, HF_HUB_OFFLINE="1")
    subprocess.run([str(VENV_PY), str(HERE / "chatterbox_worker.py"), str(out_dir / "chatterbox_job.json")], check=True, env=env)
    meta = json.loads((out_dir / "chatterbox_raw.json").read_text())
    k, sr0 = float(P.get("speedup", 1.0)), meta["sr"]
    fast = out_dir / "chatterbox_fast.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", job["out"], "-af",
                    f"asetrate={sr0}*{k},aresample={al.OUT_SR},highpass=f=80", "-ac", "1", str(fast)], check=True)
    wav = al.read_audio(str(fast), al.OUT_SR, 1)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    lead = 0.12
    wav = np.concatenate([np.zeros(int(lead * al.OUT_SR), np.float32), wav.astype(np.float32),
                          np.zeros(int(0.3 * al.OUT_SR), np.float32)])
    gtimes = [(lead + g["start"] / k, lead + g["end"] / k) for g in meta["groups"]]
    wav, _ = al.normalize(wav, al.OUT_SR, -16.0, -1.0)
    duration = len(wav) / al.OUT_SR
    from scipy.signal import resample_poly
    wav16 = resample_poly(wav, 160, 441).astype(np.float32)
    words = align(toks, groups, gtimes, asr_words(wav16), duration)
    al.write_wav(out_dir / "narration.wav", wav, al.OUT_SR)
    (out_dir / "words.json").write_text(json.dumps({"duration": round(duration, 3), "words": words}, ensure_ascii=False, indent=1))
    span = words[-1]["end"] - words[0]["start"]
    info = {"provider": "chatterbox", "voice": voice, "words": len(toks), "groups": len(groups),
            "duration": round(duration, 3), "wpm": round(len(toks) / span * 60, 1),
            "synth_seconds": meta.get("seconds"), "seconds": round(time.time() - t0, 1)}
    (out_dir / "tts_info.json").write_text(json.dumps(info, indent=1))
    print(f"[tts] {info}", file=sys.stderr)
    return info
