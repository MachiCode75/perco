"""Vocal isolation of the reference reels with a strong separator (audio-separator).

Runs inside the Chatterbox venv (it already has torch 2.6 CPU) with the separator package
installed into an isolated --target dir, so the production venv is never modified:

    models/cbx/bin/python -m pip install --target models/sepx --no-deps audio-separator \
        onnx2torch onnxruntime julius diffq ml_collections absl-py resampy beartype \
        rotary-embedding-torch samplerate six torchvision==0.21.0
    PYTHONPATH=models/sepx OMP_NUM_THREADS=2 models/cbx/bin/python \
        audio/experiments/voice_study/separate.py --model vocals_mel_band_roformer.ckpt \
        --out build/voice_study/analysis/sep/kim in1.wav in2.wav ...

Models are downloaded (GitHub releases / HuggingFace) into models/sepmodels/.
Writes <out>/<stem>.wav = vocals stem, stereo 44.1 kHz (convert/mono-ise afterwards).
A DONE file is written in <out> when every input is processed.
"""
import argparse, os, shutil, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--model", default="vocals_mel_band_roformer.ckpt")
    ap.add_argument("--out", required=True)
    ap.add_argument("--overlap", type=int, default=None, help="MDXC/RoFormer overlapping windows (model default if unset)")
    ap.add_argument("--threads", type=int, default=2)
    a = ap.parse_args()
    import torch
    torch.set_num_threads(a.threads)
    from audio_separator.separator import Separator
    os.makedirs(a.out, exist_ok=True)
    tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)
    mdxc = {"segment_size": 256, "override_model_segment_size": False, "batch_size": 1, "pitch_shift": 0}
    if a.overlap:
        mdxc["overlap"] = a.overlap
    sep = Separator(model_file_dir=os.path.join(ROOT, "models", "sepmodels"), output_dir=tmp, output_format="WAV",
                    output_single_stem="Vocals", mdxc_params=mdxc)
    sep.load_model(model_filename=a.model)
    for p in a.inputs:
        stem = os.path.splitext(os.path.basename(p))[0]
        dst = os.path.join(a.out, stem + ".wav")
        if os.path.exists(dst):
            continue
        t = time.time()
        files = sep.separate(p)
        src = files[0] if os.path.isabs(files[0]) else os.path.join(tmp, files[0])
        shutil.move(src, dst)
        print(f"{stem}: {time.time() - t:.0f}s", flush=True)
    shutil.rmtree(tmp, ignore_errors=True)
    open(os.path.join(a.out, "DONE"), "w").write("ok\n")


if __name__ == "__main__":
    sys.exit(main())
