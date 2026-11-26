"""Transcribe + word-time the isolated reference speech with faster-whisper (local CPU, int8).

python3 audio/experiments/voice_study/transcribe.py --model small.en --out words.json in1.wav [in2.wav ...]

Whisper gives punctuation (needed to split sentences and tell statements / questions /
exclamations apart) and word timestamps (cross-attention DTW, ~±50 ms). The JSON maps
<stem> → {"segments": [{"start","end","text"}], "words": [{"w","start","end","p"}]}.
"""
import argparse, json, os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--prompt", default="In this town,")
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    m = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=a.threads)
    res = json.load(open(a.out)) if os.path.exists(a.out) else {}
    for p in a.inputs:
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem in res:
            continue
        import soundfile as sf, librosa
        x, sr = sf.read(p, dtype="float32", always_2d=True)
        x = x.mean(axis=1)
        if sr != 16000:
            x = librosa.resample(x, orig_sr=sr, target_sr=16000)
        segs, info = m.transcribe(x, language="en", beam_size=5, word_timestamps=True, vad_filter=False,
                                  condition_on_previous_text=True, initial_prompt=a.prompt)
        S, W = [], []
        for s in segs:
            S.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
            for w in s.words or []:
                W.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3),
                          "p": round(w.probability, 3)})
        res[stem] = {"segments": S, "words": W}
        json.dump(res, open(a.out, "w"), indent=1)
        print(stem, len(S), "segments", len(W), "words", flush=True)
    open(a.out + ".DONE", "w").write("ok\n")


if __name__ == "__main__":
    main()
