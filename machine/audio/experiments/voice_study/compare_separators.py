"""Compare vocal separators on mixture excerpts (residual music vs speech damage).

python3 audio/experiments/voice_study/compare_separators.py <sep_test_dir> method1 method2 ...

<sep_test_dir>/mix/<x>.wav are the mixture excerpts, <sep_test_dir>/<method>/<x>.wav the vocals.
Pauses come from faster-whisper word timings on the mixture (independent of every separator):
inter-word gaps ≥ 0.25 s, shrunk by 60 ms on each side.

Metrics (per method, averaged over excerpts):
  pause_resid_db   level in pauses relative to the speech level (lower = less music residue)
  pause_flatness   spectral flatness in pauses (music residue is tonal/broadband; silence → n/a)
  lowband_db       energy < 120 Hz relative to 120–8000 Hz during speech (bass / kick leakage)
  hiband_db        energy 10–16 kHz relative to 120–8000 Hz during speech (cymbal / hi-hat leakage)
  retention_db     300–3400 Hz energy of vocals / mixture during speech (speech damage if very low)
  emb_consistency  mean pairwise cosine of 3-s chunk speaker embeddings (wespeaker+titanet)
  hnr_db           mean HNR during speech (musical noise lowers it)
"""
import json, os, sys

import numpy as np
import librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfeat  # noqa: E402

SR = 44100


def words(mix_path, model):
    x = vfeat.load(mix_path, 16000)
    segs, _ = model.transcribe(x, language="en", beam_size=5, word_timestamps=True)
    return [(w.start, w.end) for s in segs for w in (s.words or [])]


def main():
    d = sys.argv[1]; methods = sys.argv[2:]
    from faster_whisper import WhisperModel
    wm = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=2)
    emb = vfeat.Embedder()
    xs = sorted(f[:-4] for f in os.listdir(os.path.join(d, "mix")) if f.endswith(".wav"))
    res = {m: [] for m in methods}
    for x in xs:
        mixp = os.path.join(d, "mix", x + ".wav")
        if not all(os.path.exists(os.path.join(d, m, x + ".wav")) for m in methods):
            print("skip", x); continue
        W = words(mixp, wm)
        mix = vfeat.load(mixp, SR)
        n = len(mix)
        sp = np.zeros(n, bool)
        for a, b in W:
            sp[int(a * SR):int(b * SR)] = True
        pz = np.zeros(n, bool)
        for (a0, b0), (a1, b1) in zip(W[:-1], W[1:]):
            if a1 - b0 >= 0.25:
                pz[int((b0 + 0.06) * SR):int((a1 - 0.06) * SR)] = True
        for m in methods:
            v = vfeat.load(os.path.join(d, m, x + ".wav"), SR)
            v = np.pad(v, (0, max(0, n - len(v))))[:n]
            S = np.abs(librosa.stft(v, n_fft=4096, hop_length=1024)) ** 2
            M = np.abs(librosa.stft(mix, n_fft=4096, hop_length=1024)) ** 2
            fr = librosa.fft_frequencies(sr=SR, n_fft=4096)
            fi = np.minimum(np.arange(S.shape[1]) * 1024, n - 1)
            fsp, fpz = sp[fi], pz[fi]
            band = lambda P, lo, hi, cols: P[(fr >= lo) & (fr < hi)][:, cols].sum() + 1e-12
            lev = lambda cols: 10 * np.log10(S[:, cols].sum(axis=0).mean() + 1e-12)
            r = {"pause_resid_db": float(lev(fpz) - lev(fsp)) if fpz.any() else None,
                 "pause_flatness": float(np.mean(librosa.feature.spectral_flatness(S=np.sqrt(S[:, fpz])))) if fpz.any() else None,
                 "lowband_db": float(10 * np.log10(band(S, 20, 120, fsp) / band(S, 120, 8000, fsp))),
                 "hiband_db": float(10 * np.log10(band(S, 10000, 16000, fsp) / band(S, 120, 8000, fsp))),
                 "retention_db": float(10 * np.log10(band(S, 300, 3400, fsp) / band(M, 300, 3400, fsp)))}
            v16 = vfeat.resample(v, SR, 16000)
            ch = [v16[i:i + 48000] for i in range(0, len(v16) - 48000, 48000)]
            E = [emb.embed(c, 16000) for c in ch]
            cs = [np.mean([vfeat.cosine(E[i][k], E[j][k]) for k in E[i]]) for i in range(len(E)) for j in range(i + 1, len(E))]
            r["emb_consistency"] = float(np.mean(cs)) if cs else None
            vq = vfeat.voice_quality(vfeat.resample(v, SR, 24000), 24000)
            r["hnr_db"] = vq["hnr_db"]
            res[m].append(dict(r, excerpt=x))
            print(x, m, {k: (round(val, 3) if isinstance(val, float) else val) for k, val in r.items()}, flush=True)
    summary = {m: {k: float(np.mean([r[k] for r in rs if r[k] is not None])) for k in rs[0] if k != "excerpt"}
               for m, rs in res.items() if rs}
    json.dump({"per_excerpt": res, "summary": summary}, open(os.path.join(d, "comparison.json"), "w"), indent=1)
    for m, s in summary.items():
        print(m, {k: round(v, 3) for k, v in s.items()})


if __name__ == "__main__":
    main()
