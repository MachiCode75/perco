"""Small audio helpers shared by the audio module (numpy/scipy only, plus soxr/pyloudnorm if present)."""
from __future__ import annotations

import subprocess
import wave

import numpy as np

OUT_SR = 44100


# ---------------------------------------------------------------- I/O

def write_wav(path, audio, sr=OUT_SR):
    """Write float audio ([-1,1], shape (n,) or (n, ch)) as 16-bit PCM WAV with TPDF dither."""
    a = np.asarray(audio, dtype=np.float64)
    if a.ndim == 1:
        a = a[:, None]
    rng = np.random.default_rng(0)
    dither = (rng.random(a.shape) - rng.random(a.shape)) / 32768.0
    pcm = np.clip(np.round((a + dither) * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(a.shape[1])
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())


def read_audio(path, sr=OUT_SR, channels=1):
    """Decode any audio file with ffmpeg → float32 array (n,) or (n, channels) at `sr`."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
           "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(channels), "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype="<f4").copy()
    return a if channels == 1 else a.reshape(-1, channels)


def decode_bytes(data: bytes, sr=OUT_SR, channels=1):
    """Decode compressed audio bytes (mp3, …) with ffmpeg."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
           "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(channels), "-ar", str(sr), "pipe:1"]
    raw = subprocess.run(cmd, check=True, input=data, capture_output=True).stdout
    a = np.frombuffer(raw, dtype="<f4").copy()
    return a if channels == 1 else a.reshape(-1, channels)


# ---------------------------------------------------------------- resampling

def resample(audio, sr_in, sr_out):
    """High quality resampling; accepts non-integer rates (used for the pitch/tempo trick)."""
    if abs(sr_in - sr_out) < 1e-6:
        return np.asarray(audio, dtype=np.float32)
    try:
        import soxr
        return soxr.resample(np.asarray(audio, dtype=np.float32), sr_in, sr_out, "VHQ").astype(np.float32)
    except ImportError:  # pragma: no cover - fallback
        from fractions import Fraction
        from scipy.signal import resample_poly
        f = Fraction(sr_out / sr_in).limit_denominator(2000)
        return resample_poly(audio, f.numerator, f.denominator).astype(np.float32)


# ---------------------------------------------------------------- levels

def db(x):
    return 20.0 * np.log10(np.maximum(x, 1e-12))


def envelope(audio, sr, win=0.005):
    """RMS envelope with a centered window (same length as audio)."""
    n = max(1, int(win * sr))
    a2 = np.asarray(audio, dtype=np.float64) ** 2
    c = np.cumsum(np.concatenate([[0.0], a2]))
    half = n // 2
    idx = np.arange(len(a2))
    lo = np.clip(idx - half, 0, len(a2))
    hi = np.clip(idx - half + n, 0, len(a2))
    return np.sqrt((c[hi] - c[lo]) / np.maximum(hi - lo, 1))


def loudness_lufs(audio, sr):
    """Integrated loudness (ITU-R BS.1770) via pyloudnorm; None if unavailable/too short."""
    try:
        import pyloudnorm
    except ImportError:
        return None
    a = np.asarray(audio, dtype=np.float64)
    if len(a) < int(0.5 * sr):
        return None
    return float(pyloudnorm.Meter(sr).integrated_loudness(a))


def true_peak_db(audio, sr):
    """Approximate true peak (4x oversampled) in dBFS."""
    from scipy.signal import resample_poly
    a = np.asarray(audio, dtype=np.float64)
    if a.ndim == 1:
        a = a[:, None]
    peak = max(np.max(np.abs(resample_poly(a[:, c], 4, 1))) for c in range(a.shape[1]))
    return float(db(peak))


def limit(audio, sr, ceiling_db=-1.5, hold=0.008):
    """Transparent-ish lookahead peak limiter (vectorised): gain = moving average of a min-filtered
    gain curve, which can never exceed the gain each sample needs, so sample peaks <= ceiling."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.asarray(audio, dtype=np.float64)
    mono = np.abs(a) if a.ndim == 1 else np.abs(a).max(axis=1)
    c = 10 ** (ceiling_db / 20.0)
    g = np.minimum(1.0, c / np.maximum(mono, 1e-12))
    if g.min() >= 1.0:
        return a.astype(np.float32)
    n = max(1, int(hold * sr))
    g = uniform_filter1d(minimum_filter1d(g, 2 * n + 1, mode="nearest"), 2 * n + 1, mode="nearest")
    g = np.minimum(g, c / np.maximum(mono, 1e-12))  # numerical safety
    return (a * (g if a.ndim == 1 else g[:, None])).astype(np.float32)


def normalize(audio, sr, target_lufs=-16.0, peak_ceiling_db=-1.0):
    """Gain to `target_lufs`, then a lookahead limiter keeps the true peak under `peak_ceiling_db`."""
    a = np.asarray(audio, dtype=np.float64)
    total = 0.0
    for _ in range(4):
        lufs = loudness_lufs(a, sr)
        gain_db = (target_lufs - lufs) if lufs is not None and np.isfinite(lufs) else 0.0
        a = a * 10 ** (gain_db / 20.0)
        total += gain_db
        a = limit(a, sr, peak_ceiling_db - 0.5)
        tp = true_peak_db(a, sr)
        if tp > peak_ceiling_db:
            a = a * 10 ** ((peak_ceiling_db - tp - 0.05) / 20.0)
        if abs(gain_db) < 0.2:
            break
    gain_db = total
    return a.astype(np.float32), gain_db


def fade(audio, sr, fade_in=0.0, fade_out=0.0):
    a = np.array(audio, dtype=np.float32, copy=True)
    n_in, n_out = int(fade_in * sr), int(fade_out * sr)
    if n_in > 1:
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n_in))
        a[:n_in] = (a[:n_in].T * ramp).T
    if n_out > 1:
        ramp = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n_out))
        a[-n_out:] = (a[-n_out:].T * ramp).T
    return a


def highpass(audio, sr, hz=60.0, order=2):
    from scipy.signal import butter, sosfiltfilt
    sos = butter(order, hz, btype="high", fs=sr, output="sos")
    return sosfiltfilt(sos, audio, axis=0).astype(np.float32)
