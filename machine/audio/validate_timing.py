#!/usr/bin/env python3
"""Measure the accuracy of words.json against the audio, two independent ways.

  A. onsets  : for every word that follows >= 120 ms of silence, compare its `start` with the
               energy onset detected in narration.wav (exact ground truth for those words).
  B. asr     : run an independent CTC speech recognizer (sherpa-onnx NeMo conformer, from GitHub
               releases → models/eval/) and compare word starts for all words it recognises.
               CTC spikes have their own small bias, so we report the signed median and the
               median absolute error both raw and after removing that constant bias.

python3 audio/validate_timing.py --dir build/<slug>/audio [--asr]
"""
from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import audiolib as al  # noqa: E402
from pipeline.text import norm  # noqa: E402

ASR_DIR = HERE.parent / "models" / "eval" / "sherpa-onnx-nemo-ctc-en-conformer-small"
ASR_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
           "sherpa-onnx-nemo-ctc-en-conformer-small.tar.bz2")


def onset_errors(wav, sr, words, min_sil=0.12, rel_db=-35):
    env = al.envelope(wav, sr, 0.005)
    thr = np.percentile(env[env > 0], 99) * 10 ** (rel_db / 20)
    loud = env > thr
    errs = []
    for k, w in enumerate(words):
        s = int(w["start"] * sr)
        lo, hi = max(0, s - int(0.25 * sr)), min(len(wav), s + int(0.25 * sr))
        if k:  # the onset must belong to this word, not to the previous one
            lo = max(lo, int((words[k - 1]["start"] + w["start"]) / 2 * sr))
        if k + 1 < len(words):
            hi = min(hi, int((words[k + 1]["start"] + w["start"]) / 2 * sr))
        idx = np.flatnonzero(loud[lo:hi])
        # onset = first loud sample after a quiet run of >= min_sil inside the ±250 ms window
        prev, onset = lo - 1, None
        for i in idx + lo:
            if (i - prev) / sr >= min_sil and i > lo:
                onset = i
                break
            prev = i
        if onset is None and idx.size and idx[0] > 0 and lo > 0:
            # check silence before window start
            pre = loud[max(0, lo - int(min_sil * sr)):lo + idx[0]]
            if not pre.any():
                onset = lo + idx[0]
        if onset is not None and abs(onset / sr - w["start"]) < 0.25:
            errs.append(w["start"] - onset / sr)
    return np.array(errs)


def asr_errors(wav, sr, words, threads=2):
    import sherpa_onnx
    if not ASR_DIR.exists():
        import io
        import tarfile
        import urllib.request
        print("[validate] downloading ASR model…", file=sys.stderr)
        ASR_DIR.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(ASR_URL) as r:
            tarfile.open(fileobj=io.BytesIO(r.read()), mode="r:bz2").extractall(ASR_DIR.parent)
    rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
        model=str(ASR_DIR / "model.int8.onnx"), tokens=str(ASR_DIR / "tokens.txt"), num_threads=threads)
    y = al.resample(wav, sr, 16000)
    st = rec.create_stream()
    st.accept_waveform(16000, y)
    rec.decode_stream(st)
    r = st.result
    hyp = []  # (word, start)
    for tok, ts in zip(r.tokens, r.timestamps):
        if tok.startswith(("▁", " ")) or not hyp:
            hyp.append([tok.lstrip("▁ "), ts])
        else:
            hyp[-1][0] += tok
    ref = [norm(w["text"]) for w in words]
    hw = [norm(h[0]) for h in hyp]
    sm = difflib.SequenceMatcher(None, ref, hw, autojunk=False)
    errs = []
    for a, b, n in sm.get_matching_blocks():
        for d in range(n):
            errs.append(words[a + d]["start"] - hyp[b + d][1])
    return np.array(errs), len(ref), r.text


def summarize(name, e):
    if not len(e):
        return f"{name}: no samples"
    return (f"{name}: n={len(e)}  median|err|={np.median(np.abs(e)) * 1000:.0f} ms  "
            f"p90|err|={np.percentile(np.abs(e), 90) * 1000:.0f} ms  signed median={np.median(e) * 1000:+.0f} ms")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder with narration.wav + words.json")
    ap.add_argument("--asr", action="store_true")
    a = ap.parse_args()
    d = Path(a.dir)
    words = json.loads((d / "words.json").read_text())["words"]
    wav = al.read_audio(d / "narration.wav", al.OUT_SR)
    out = {}
    e = onset_errors(wav, al.OUT_SR, words)
    print(summarize("A onsets-after-silence (start - onset)", e))
    out["onset"] = e.tolist()
    if a.asr:
        e2, n, text = asr_errors(wav, al.OUT_SR, words)
        print(f"   ASR matched {len(e2)}/{n} words")
        print(summarize("B CTC-ASR word starts (start - asr)", e2))
        if len(e2):
            print(summarize("B bias-removed", e2 - np.median(e2)))
        out["asr"] = e2.tolist()
    (d / "timing_validation.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()
