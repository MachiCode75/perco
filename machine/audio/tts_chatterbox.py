"""Chatterbox provider (expressive open-source TTS). Default preset `narrator_ref` (user-tuned, see audio/voices.json); `narrator_c2` = previous voice.

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


def token_tags(episode, n):
    """global token index → set of intonation tags (screenplay `{tag}` → shot.prosody)."""
    out, off = {}, 0
    for sh in episode["shots"]:
        k = len(T.words(sh.get("say", "")))
        for p in sh.get("prosody", []) or []:
            i = min(n - 1, off + int(p.get("at", 0)))
            out.setdefault(i, set()).add(p["tag"])
        off += k
    return out


def group_plan(P, words, tags):
    """Generation overrides + finishing for one sentence group.
    Default (preset end_fall_st, e.g. -1.5): a declarative sentence ('.') ends with a gentle pitch fall —
    the user's reference narrator ends sentences low, the clone tends to end high."""
    ex = float(P.get("exaggeration", 1.0)); gen, fin = {}, {"fall": 0.0, "fall_len": 0.45, "gain_db": 0.0, "tempo": 1.0, "pause": 0.0}
    last = words[-1] if words else ""
    end = re.sub(r"[\"”')\]]+$", "", last)[-1:] if last else ""
    base_fall = float(P.get("end_fall_st", 0.0))
    if end == "." or end == "…":
        fin["fall"] = base_fall
    elif end == "!":
        fin["fall"] = base_fall * 0.4
    if "surprise" in tags or "excited" in tags:
        gen = {"exaggeration": round(min(1.4, ex + 0.35), 2), "cfg_weight": 0.4}; fin["fall"] = 0.0 if "surprise" in tags else fin["fall"]
    if "low" in tags:
        gen = {"exaggeration": round(max(0.3, ex - 0.25), 2)}; fin["gain_db"] = -2.5
    if "whisper" in tags:
        gen = {"exaggeration": round(max(0.25, ex - 0.35), 2)}; fin["gain_db"] = -7.0
    if "down" in tags:
        fin["fall"] = min(fin["fall"], base_fall) + float(P.get("down_fall_st", -2.0)); fin["fall_len"] = 0.7
    if "up" in tags or "flat" in tags:
        fin["fall"] = 0.0
    if "slow" in tags:
        fin["tempo"] = 0.88
    if "fast" in tags:
        fin["tempo"] = 1.12
    if "pause" in tags:
        fin["pause"] = 0.35
    return {"gen": gen, "fin": fin}


def _fall(x, sr, st, length, tmp):
    """Glide the final vowel to `st` semitones relative to the sentence median (rubberband R3, formants kept)."""
    import soundfile as sf
    # voiced end = last frame the pitch tracker calls voiced (not the breath / final "s" or "t")
    import librosa
    f0, vflag, vprob = librosa.pyin(x, fmin=80, fmax=450, sr=sr, frame_length=1024, hop_length=256)
    vmask = (vprob > 0.5) & ~np.isnan(f0)
    vi = np.nonzero(vmask)[0]
    if len(vi) < 10:
        return x
    # end of the last sustained voiced run (≥ 4 frames), ignoring a final creak
    runs, k0 = [], vi[0]
    for a_, b_ in zip(vi[:-1], vi[1:]):
        if b_ != a_ + 1:
            runs.append((k0, a_)); k0 = b_
    runs.append((k0, vi[-1]))
    last = next((r for r in reversed(runs) if r[1] - r[0] >= 3), runs[-1])
    endv = min(len(x), (int(last[1]) + 1) * 256); start = max(0, endv - int(length * sr))
    # adaptive: bring the final vowel to `st` semitones relative to the sentence's median pitch (never raise)
    med = float(np.median(f0[vmask])); endf = float(np.median(f0[last[0]:last[1] + 1][-6:]))
    st = max(-5.0, min(0.0, st + 12 * np.log2(med / endf)))
    if st > -0.2:
        return x
    lines = ["0 0"]
    for j in range(start, len(x), int(0.01 * sr)):
        u = min(1.0, (j - start) / max(1, endv - start))
        lines.append(f"{j} {st * u ** 0.8:.3f}")
    pad = int(0.5 * sr)  # realtime pitch-map mode has latency: pad, then re-align on the unshifted start
    for j in range(len(x), len(x) + pad, int(0.01 * sr)):
        lines.append(f"{j} {st:.3f}")
    Path(tmp + ".map").write_text("\n".join(lines) + "\n")
    sf.write(tmp + ".in.wav", np.concatenate([x, np.zeros(pad, np.float32)]), sr)
    r = subprocess.run(["rubberband", "-3", "-F", "-q", "--pitchmap", tmp + ".map", tmp + ".in.wav", tmp + ".out.wav"], capture_output=True)
    if r.returncode != 0:
        return x
    y, _ = sf.read(tmp + ".out.wav", dtype="float32")
    y = y if y.ndim == 1 else y.mean(axis=1)
    n = min(len(x), int(0.6 * sr), max(1, start)); best, off = -1e9, 0
    for o in range(0, min(int(0.3 * sr), len(y) - n), 24):
        c = float(np.dot(x[:n], y[o:o + n]))
        if c > best:
            best, off = c, o
    y = y[off:off + len(x)]
    return np.pad(y, (0, len(x) - len(y))) if len(y) < len(x) else y


def finish_groups(out_dir, job, meta, plan, P):
    """Apply per-group finishing to chatterbox_raw.wav and rewrite it with new group offsets."""
    import soundfile as sf
    if not any(pl["fin"]["fall"] or pl["fin"]["gain_db"] or pl["fin"]["tempo"] != 1.0 or pl["fin"]["pause"] for pl in plan):
        return meta
    x, sr = sf.read(job["out"], dtype="float32")
    x = x if x.ndim == 1 else x.mean(axis=1)
    gap = float(job.get("gap", 0.05)); parts, groups, cur = [], [], 0
    tmp = str(out_dir / "_fin")
    for g, pl in zip(meta["groups"], plan):
        y = x[int(g["start"] * sr):int(g["end"] * sr)].copy(); f = pl["fin"]
        if f["tempo"] != 1.0:
            sf.write(tmp + ".t.wav", y, sr)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp + ".t.wav", "-af", f"atempo={f['tempo']}", "-c:a", "pcm_f32le", tmp + ".t2.wav"], check=True)
            y, _ = sf.read(tmp + ".t2.wav", dtype="float32")
        if f["fall"]:
            y = _fall(y, sr, f["fall"], f["fall_len"], tmp)
        if f["gain_db"]:
            y = y * (10 ** (f["gain_db"] / 20))
        groups.append({"text": g["text"], "start": cur / sr, "end": (cur + len(y)) / sr})
        pad = np.zeros(int((gap + f["pause"]) * sr), np.float32)
        parts += [y.astype(np.float32), pad]; cur += len(y) + len(pad)
    sf.write(job["out"], np.concatenate(parts), sr)
    meta = dict(meta, groups=groups)
    (out_dir / "chatterbox_raw.json").write_text(json.dumps(meta, indent=1))
    return meta


def synthesize(episode, out_dir, voice="narrator_ref", threads=4):
    t0 = time.time()
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    P = preset(voice)
    ensure_installed(); ensure_asr()
    toks = T.words(T.narration(episode))
    groups = make_groups(toks, P.get("group_words", 22))
    speak = episode.get("speak") or {}
    tags = token_tags(episode, len(toks))
    plan = [group_plan(P, [toks[i] for i in g], set().union(*[tags.get(i, set()) for i in g])) for g in groups]
    job = {"groups": [dict(text=T.spoken_text([toks[i] for i in g], speak), **pl["gen"]) for g, pl in zip(groups, plan)],
           "prompt": str(ROOT / P["prompt"]),
           "exaggeration": P["exaggeration"], "cfg_weight": P["cfg_weight"], "temperature": P["temperature"],
           "seed": P.get("seed", 7), "gap": P.get("gap", 0.05), "threads": threads,
           "out": str(out_dir / "chatterbox_raw.wav")}
    (out_dir / "chatterbox_job.json").write_text(json.dumps(job, indent=1))
    env = dict(os.environ, HF_HUB_OFFLINE="1")
    subprocess.run([str(VENV_PY), str(HERE / "chatterbox_worker.py"), str(out_dir / "chatterbox_job.json")], check=True, env=env)
    meta = json.loads((out_dir / "chatterbox_raw.json").read_text())
    meta = finish_groups(out_dir, job, meta, plan, P)  # intonation finishing (falls, whisper, tempo, pauses)
    sr0 = meta["sr"]
    fast = out_dir / "chatterbox_fast.wav"
    if "tempo" in P or "pitch_semitones" in P:
        # user-tuned chain (voice tuner): pitch shift without tempo change, then tempo (WSOLA), then shelving EQ
        p = 2 ** (float(P.get("pitch_semitones", 0)) / 12); t = float(P.get("tempo", 1.0)); k = t
        af = f"asetrate={sr0}*{p:.5f},aresample={al.OUT_SR},atempo={t / p:.5f}"
    else:  # legacy: play faster (pitch rises with speed)
        k = float(P.get("speedup", 1.0)); af = f"asetrate={sr0}*{k},aresample={al.OUT_SR}"
    eq = []
    if P.get("body_db") or P.get("brightness_db"):
        eq.append("volume=-10dB")
        if P.get("body_db"):
            eq.append(f"bass=g={P['body_db']}:f=220:t=s:w=1")
        if P.get("brightness_db"):
            eq.append(f"treble=g={P['brightness_db']}:f=3200:t=s:w=1")
    af = ",".join([af] + eq + ["highpass=f=80"])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", job["out"], "-af", af, "-ac", "1", "-c:a", "pcm_f32le", str(fast)], check=True)
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
