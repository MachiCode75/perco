"""Find the free Edge (Microsoft neural) voice closest to a reference narrator.

python3 audio/voice_match.py --ref <video_or_wav> --out build/voice_match [--locale en-] [--top 6]

1. reference: speaker embedding (wespeaker + titanet, via sherpa-onnx) averaged over speech chunks,
   + median pitch and speaking rate (from data/reference_words.json if given);
2. pass 1: every voice of the locale at a fast rate → similarity;
3. pass 2: best voices × pitch/rate grid → similarity + pitch distance;
4. writes ranking.json and MP3 samples of the best candidates (same sample text) for listening.
"""
import argparse, asyncio, json, os, subprocess, sys, tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVAL = os.path.join(ROOT, "models", "eval")
SR = 16000
SAMPLE_TEXT = ("Every night, the whole town turns off the lights at the same time. Nobody knows why. "
               "My little brother says it's so the houses can sleep. Grandpa says it's so they can't see us. "
               "Last night, one house stayed lit. Ours.")


def load_audio(path, start=None, dur=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(start)] if start is not None else []) + ["-i", path]
    cmd += (["-t", str(dur)] if dur else []) + ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


class Embedder:
    def __init__(self):
        import sherpa_onnx as so
        self.ex = []
        for f in ("wespeaker_en_voxceleb_resnet34.onnx", "nemo_en_titanet_small.onnx"):
            p = os.path.join(EVAL, f)
            if os.path.exists(p):
                cfg = so.SpeakerEmbeddingExtractorConfig(model=p, num_threads=2)
                self.ex.append(so.SpeakerEmbeddingExtractor(cfg))
        if not self.ex:
            raise SystemExit("no speaker model in models/eval (run the audio module validation once)")

    def embed(self, x):
        out = []
        for e in self.ex:
            s = e.create_stream(); s.accept_waveform(SR, x.tolist()); s.input_finished()
            v = np.array(e.compute(s)); out.append(v / (np.linalg.norm(v) + 1e-9))
        return out


def f0_median(x):
    import librosa
    f0, vf, _ = librosa.pyin(x, fmin=70, fmax=450, sr=SR, frame_length=1024)
    f = f0[vf]
    return float(np.median(f)) if len(f) else 0.0


def cos(a, b):
    return float(np.mean([np.dot(x, y) for x, y in zip(a, b)]))


def edge():
    """edge_tts through the session proxy (it pins certifi's CA bundle → point it at the proxy CA)."""
    import certifi
    ca = os.environ.get("SSL_CERT_FILE")
    if ca and os.path.exists(ca):
        certifi.where = lambda: ca
    import edge_tts
    return edge_tts


async def synth(voice, text, rate, pitch, path):
    edge_tts = edge()
    c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, proxy=os.environ.get("HTTPS_PROXY"))
    await c.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--ref-start", type=float, default=2.0)
    ap.add_argument("--ref-dur", type=float, default=150.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--locale", default="en-")
    ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--text", default=SAMPLE_TEXT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    edge_tts = edge()
    emb = Embedder()

    ref = load_audio(a.ref, a.ref_start, a.ref_dur)
    chunks = [ref[i:i + 8 * SR] for i in range(0, len(ref) - 8 * SR, 8 * SR)]
    E = [emb.embed(c) for c in chunks]
    ref_emb = [np.mean([e[k] for e in E], axis=0) for k in range(len(emb.ex))]
    ref_emb = [v / np.linalg.norm(v) for v in ref_emb]
    ref_f0 = f0_median(ref[: 30 * SR])
    print(f"reference: {len(chunks)} chunks, median F0 {ref_f0:.0f} Hz")

    voices = [v["ShortName"] for v in asyncio.run(edge_tts.list_voices()) if v["Locale"].startswith(a.locale)]
    tmp = tempfile.mkdtemp()

    def score(voice, rate, pitch):
        p = os.path.join(tmp, f"{voice}_{rate}_{pitch}.mp3")
        if not os.path.exists(p):
            asyncio.run(synth(voice, a.text, rate, pitch, p))
        x = load_audio(p)
        s = cos(emb.embed(x), ref_emb)
        return {"voice": voice, "rate": rate, "pitch": pitch, "sim": round(s, 4), "f0": round(f0_median(x)),
                "dur": round(len(x) / SR, 2), "file": p}

    res1 = []
    for v in voices:
        try:
            r = score(v, "+30%", "+0Hz"); res1.append(r); print(f"  {v:34s} sim {r['sim']:.3f}  f0 {r['f0']}")
        except Exception as e:
            print(f"  {v}: failed ({e})")
    res1.sort(key=lambda r: -r["sim"])
    best = [r["voice"] for r in res1[:8]]
    res2 = []
    for v in best:
        for pitch in ("+0Hz", "+15Hz", "+30Hz", "+45Hz"):
            for rate in ("+25%", "+40%"):
                try:
                    r = score(v, rate, pitch)
                    r["score"] = round(r["sim"] - 0.0015 * abs(r["f0"] - ref_f0), 4)  # small penalty for pitch mismatch
                    res2.append(r)
                except Exception as e:
                    print(f"  {v} {rate} {pitch}: failed ({e})")
    res2.sort(key=lambda r: -r["score"])
    picks, seen = [], set()
    for r in res2:
        if r["voice"] in seen:
            continue
        seen.add(r["voice"]); picks.append(r)
        if len(picks) >= a.top:
            break
    for i, r in enumerate(picks, 1):
        dst = os.path.join(a.out, f"{i:02d}_{r['voice']}_{r['rate'].replace('%', 'pc')}_{r['pitch']}.mp3")
        subprocess.run(["cp", r["file"], dst], check=True); r["sample"] = dst
    json.dump({"ref_f0": ref_f0, "pass1": res1, "pass2": res2, "picks": picks}, open(os.path.join(a.out, "ranking.json"), "w"), indent=1)
    print("\nTOP picks:")
    for r in picks:
        print(f"  {r['voice']:34s} rate {r['rate']:5s} pitch {r['pitch']:6s} sim {r['sim']:.3f} f0 {r['f0']} → {os.path.basename(r['sample'])}")


if __name__ == "__main__":
    main()
