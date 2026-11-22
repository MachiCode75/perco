"""Offline transcription with word timestamps (sherpa-onnx NeMo CTC, English).

python3 tools/transcribe.py <audio_or_video> <out.json>
→ {"text": "...", "words": [{"w": "word", "t": start_s}, ...], "duration": s}
Chunks of 20 s (cut at the quietest point near the boundary) to keep the CTC model accurate.
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASR = os.path.join(ROOT, "models", "eval", "sherpa-onnx-nemo-ctc-en-conformer-small")
SR = 16000


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def main(src, out):
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=os.path.join(ASR, "model.int8.onnx"),
                                                      tokens=os.path.join(ASR, "tokens.txt"), num_threads=2)
    x = load(src)
    hop = int(0.02 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode="same"))
    words, start = [], 0
    while start < len(x):
        end = min(len(x), start + 20 * SR)
        if end < len(x):  # cut at the quietest 20 ms within ±2 s
            lo, hi = end - 2 * SR, min(len(x), end + 2 * SR)
            end = lo + int(np.argmin(env[lo:hi]))
        if end - start < int(0.3 * SR):
            break
        st = rec.create_stream(); st.accept_waveform(SR, x[start:end]); rec.decode_stream(st)
        r = st.result
        for tok, ts in zip(r.tokens, r.timestamps):
            if tok.startswith(("▁", " ")) or not words or words[-1].get("_chunk") != start:
                words.append({"w": tok.lstrip("▁ "), "t": round(start / SR + ts, 3), "_chunk": start})
            else:
                words[-1]["w"] += tok
        start = end
    words = [{"w": w["w"], "t": w["t"]} for w in words if w["w"]]
    res = {"duration": round(len(x) / SR, 2), "text": " ".join(w["w"] for w in words), "words": words}
    json.dump(res, open(out, "w"), indent=0)
    print(f"{len(words)} words, {len(words) / (res['duration'] / 60):.0f} wpm overall")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
