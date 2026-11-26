"""Spleeter 2-stem vocal isolation with sherpa-onnx (the baseline separator).

python3 audio/experiments/voice_study/spleeter_sep.py <out_dir> in1.wav [in2.wav ...]
→ <out_dir>/<stem>.wav (vocals, stereo, 44.1 kHz).
"""
import os, sys
import numpy as np, soundfile as sf, librosa
import sherpa_onnx as so

M = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "models", "sep",
                 "sherpa-onnx-spleeter-2stems-fp16")


def separator(threads=2):
    cfg = so.OfflineSourceSeparationConfig(model=so.OfflineSourceSeparationModelConfig(
        spleeter=so.OfflineSourceSeparationSpleeterModelConfig(vocals=os.path.join(M, "vocals.fp16.onnx"),
                                                               accompaniment=os.path.join(M, "accompaniment.fp16.onnx")),
        num_threads=threads))
    return so.OfflineSourceSeparation(cfg)


def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    sp = separator()
    for p in sys.argv[2:]:
        x, sr = sf.read(p, dtype="float32", always_2d=True)
        if sr != 44100:
            x = librosa.resample(x.T, orig_sr=sr, target_sr=44100).T; sr = 44100
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1)
        r = sp.process(sample_rate=sr, samples=np.ascontiguousarray(x.T))
        v = np.array(r.stems[0].data)  # stems[0] = vocals
        sf.write(os.path.join(out, os.path.basename(p)), v.T, r.sample_rate)
        print(os.path.basename(p), v.shape, r.sample_rate)


if __name__ == "__main__":
    main()
