"""Post-process a narration to match the reference narrator's delivery (pitch, intonation range, dynamics).

Measured on refs 1/3/5 (same narrator): F0 median ≈ 190 Hz, intonation range p5–p95 ≈ 18–21 semitones
(std ≈ 5 st), very even loudness (speech level std ≈ 1.7 dB). Kokoro's raw output: ≈ 172 Hz, 12 st, 3 dB.
WORLD vocoder: keep timing (word timings stay valid), scale F0 deviations around the median by `range`
and shift the median to `target_hz`; then gentle compression + presence EQ.

python3 audio/prosody.py in.wav out.wav [--target-hz 190] [--range 1.6]
"""
import argparse, subprocess, tempfile, os
import numpy as np


def world_reshape(x, sr, target_hz=190.0, rng=1.6):
    import pyworld as pw
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=70, f0_ceil=500, frame_period=5.0)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    v = f0 > 0
    if v.sum() < 10:
        return x.astype(np.float32)
    lf = np.log2(f0[v])
    med = np.median(lf)
    new = np.zeros_like(f0)
    new[v] = 2 ** (np.log2(target_hz) + (lf - med) * rng)
    new[v] = np.clip(new[v], 75, 520)
    y = pw.synthesize(new, sp, ap, sr, frame_period=5.0)
    y = y[: len(x)]
    peak = np.abs(y).max() + 1e-9
    return (y / peak * 0.95).astype(np.float32)


def master(inp, out):
    """Even dynamics like the reference (std ≈ 1.7 dB) + a little presence."""
    af = ("highpass=f=90,acompressor=threshold=-24dB:ratio=4:attack=5:release=80:makeup=6dB,"
          "equalizer=f=3500:t=q:w=1.2:g=2.5,alimiter=limit=0.95")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", inp, "-af", af, out], check=True)


def process(inp, out, target_hz=190.0, rng=1.6):
    import soundfile as sf
    x, sr = sf.read(inp)
    if x.ndim > 1:
        x = x.mean(axis=1)
    y = world_reshape(x, sr, target_hz, rng)
    tmp = tempfile.mktemp(suffix=".wav")
    sf.write(tmp, y, sr)
    master(tmp, out)
    os.remove(tmp)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--target-hz", type=float, default=190.0)
    ap.add_argument("--range", type=float, default=1.6)
    a = ap.parse_args()
    process(a.inp, a.out, a.target_hz, a.range)
