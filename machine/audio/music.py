#!/usr/bin/env python3
"""Procedural ambient music bed (numpy/scipy only) or user-file looping.

python3 audio/music.py --duration 172 --mood calm_to_eerie --seed 1 --out build/<slug>/audio/music.wav
python3 audio/music.py --duration 172 --file user.mp3 --out music.wav

Beatless warm pad (detuned wavetable voices on a slow chord progression), a low drone, an airy
noise top, sparse soft celesta / music-box / piano notes, generated-IR convolution reverb, slow
evolution, fade-in/out. 44.1 kHz stereo WAV normalised to −20 LUFS (true peak ≤ −1 dBTP); the post
module sets the final level under the voice (see audio/README.md).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import audiolib as al  # noqa: E402

SR = al.OUT_SR
PAD_SR = SR // 2           # pad/drone content is < 3 kHz: render at half rate, upsample once
TABLE = 4096
LUFS = -20.0

# chord shapes, intervals in semitones above the bass note (already spread / voiced)
SHAPES = {
    "m9": [0, 7, 15, 22, 26], "m7": [0, 7, 15, 19, 22], "madd9": [0, 7, 14, 15, 19], "m6": [0, 7, 15, 21, 24],
    "mM7": [0, 7, 15, 23, 26], "maj7": [0, 7, 16, 23, 26], "add9": [0, 7, 14, 16, 19], "6": [0, 7, 16, 21, 26],
    "sus2": [0, 7, 14, 19, 24], "7sus4": [0, 7, 17, 22, 24], "m": [0, 7, 12, 15, 19], "dim": [0, 6, 12, 15, 21],
    "aug": [0, 8, 16, 20, 24], "maj7#11": [0, 7, 16, 23, 30], "phryg": [0, 1, 7, 15, 19],
}
NOTE = {"C": 36, "C#": 37, "Db": 37, "D": 38, "Eb": 39, "E": 40, "F": 41, "F#": 42, "Gb": 42,
        "G": 43, "Ab": 44, "A": 45, "Bb": 46, "B": 47}

# mood → parameters. prog = [(bass note, shape)], chord = seconds per chord.
MOODS = {
    "calm": dict(prog=[("E", "m9"), ("C", "maj7"), ("G", "6"), ("D", "sus2")], chord=9.0, drone="E",
                 bell="celesta", bell_gap=3.2, detune=6, bright=650, air=1.0, rt60=4.0),
    "mystery": dict(prog=[("E", "madd9"), ("C", "maj7#11"), ("A", "m6"), ("B", "7sus4")], chord=10.0, drone="E",
                    bell="musicbox", bell_gap=3.6, detune=9, bright=560, air=0.9, rt60=4.5),
    "sad": dict(prog=[("A", "m9"), ("F", "maj7"), ("C", "add9"), ("E", "m7")], chord=10.0, drone="A",
                bell="piano", bell_gap=3.4, detune=5, bright=560, air=0.7, rt60=3.8),
    "hopeful": dict(prog=[("C", "add9"), ("A", "m7"), ("F", "maj7"), ("G", "6")], chord=8.0, drone="C",
                    bell="celesta", bell_gap=2.4, detune=5, bright=800, air=1.1, rt60=3.6),
    "tense": dict(prog=[("D", "m"), ("Bb", "maj7#11"), ("D", "phryg"), ("A", "7sus4")], chord=11.0, drone="D",
                  bell="musicbox", bell_gap=5.0, detune=14, bright=480, air=0.8, rt60=4.2, throb=0.55),
    # dark section used by calm_to_eerie (last ~35 %)
    "eerie": dict(prog=[("E", "mM7"), ("C", "aug"), ("F", "phryg"), ("E", "dim")], chord=11.0, drone="E",
                  bell="musicbox", bell_gap=4.2, detune=16, bright=450, air=0.8, rt60=5.0, tritone=True),
}
MOOD_NAMES = ["calm", "calm_to_eerie", "tense", "sad", "hopeful", "mystery"]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


# ---------------------------------------------------------------- building blocks

_tables = {}


def table_for(freq, bright, sr):
    """Band-limited warm wavetable (saw-like spectrum with gaussian roll-off at `bright` Hz)."""
    key = (round(freq, 1), bright, sr)
    if key not in _tables:
        kmax = max(1, int(min(sr / 2.2, 6000) / freq))
        k = np.arange(1, kmax + 1)
        amp = k ** -1.4 * np.exp(-((k * freq) / bright) ** 2)
        ph = np.arange(TABLE) / TABLE
        w = (amp[:, None] * np.sin(2 * np.pi * k[:, None] * ph[None, :] + 0.3 * k[:, None])).sum(0)
        _tables[key] = (w / np.max(np.abs(w))).astype(np.float32)
    return _tables[key]


def osc(table, freq, n, sr, phase0):
    """Wavetable oscillator; `freq` scalar or per-sample array."""
    inc = np.broadcast_to(np.asarray(freq, np.float64) / sr, (n,))
    phase = (phase0 + np.cumsum(inc)) % 1.0
    x = phase * TABLE
    i = x.astype(np.int64)
    f = (x - i).astype(np.float32)
    return table[i % TABLE] * (1 - f) + table[(i + 1) % TABLE] * f


def raised(n_total, n_fade_in, n_fade_out):
    e = np.ones(n_total, np.float32)
    if n_fade_in > 1:
        e[:n_fade_in] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n_fade_in))
    if n_fade_out > 1:
        e[-n_fade_out:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n_fade_out))
    return e


def lfo(n, sr, rate, rng, depth=1.0):
    t = np.arange(n) / sr
    return (np.sin(2 * np.pi * rate * t + rng.uniform(0, 2 * np.pi)) * depth).astype(np.float32)


# ---------------------------------------------------------------- layers

def pad_layer(sections, total, rng):
    """Detuned, slowly breathing pad + drone. sections = [(t0, t1, mood_params)] → (n, 2) at PAD_SR."""
    n = int(total * PAD_SR)
    out = np.zeros((n, 2), np.float32)
    xf = 3.5  # chord crossfade seconds
    for t0, t1, p in sections:
        prog, cd = p["prog"], p["chord"]
        t = t0
        ci = 0
        while t < t1:
            c0, c1 = max(0.0, t - xf / 2), min(total, t + cd + xf / 2)
            if c1 <= c0:
                break
            a, b = int(c0 * PAD_SR), int(c1 * PAD_SR)
            m = b - a
            env = raised(m, int(xf * PAD_SR) if c0 > 0 else int(2.0 * PAD_SR), int(xf * PAD_SR))
            root, shape = prog[ci % len(prog)]
            notes = [NOTE[root] + iv for iv in SHAPES[shape]]
            for j, note in enumerate(notes):
                f = mtof(note)
                gain = (0.9 if j == 0 else 0.55) * (1.0 - 0.06 * j)
                tab = table_for(f, p["bright"], PAD_SR)
                amp = env * gain * (0.8 + 0.2 * lfo(m, PAD_SR, rng.uniform(0.04, 0.12), rng))
                if p.get("throb"):
                    amp = amp * (1 - 0.22 * (0.5 + 0.5 * lfo(m, PAD_SR, p["throb"], rng)))
                for ch in range(2):
                    for d in (-1, 1):
                        cents = d * p["detune"] * rng.uniform(0.6, 1.0) + (ch - 0.5) * 2
                        wob = 1 + (p["detune"] / 1200.0) * 0.3 * lfo(m, PAD_SR, rng.uniform(0.1, 0.3), rng)
                        out[a:b, ch] += 0.5 * amp * osc(tab, f * 2 ** (cents / 1200) * wob, m, PAD_SR, rng.random())
            t += cd
            ci += 1
        # drone (sub + octave), constant across the section, plus optional tritone for eerie
        a, b = int(t0 * PAD_SR), int(t1 * PAD_SR)
        m = b - a
        env = raised(m, int(4 * PAD_SR), int(4 * PAD_SR) if t1 < total else 1)
        dn = [(NOTE[p["drone"]] - 12, 0.8), (NOTE[p["drone"]], 0.6)]
        if p.get("tritone"):
            dn.append((NOTE[p["drone"]] - 6, 0.22))
        for note, g in dn:
            f = mtof(note)
            tab = table_for(f, 300, PAD_SR)
            for ch in range(2):
                out[a:b, ch] += g * env * osc(tab, f * (1 + 0.0007 * (ch - 0.5)), m, PAD_SR, rng.random())
    # gentle low-pass for warmth
    # warmth: gentle −6 dB/oct tilt above ~550 Hz + low-pass (reference bed: energy mostly < 300 Hz)
    out = sosfilt(butter(1, 550, btype="low", fs=PAD_SR, output="sos"), out, axis=0) * 2.0
    return sosfilt(butter(2, 2200, btype="low", fs=PAD_SR, output="sos"), out, axis=0).astype(np.float32)


def bell_note(kind, f, sr, rng):
    """One soft struck note (celesta / music box / piano-ish), smooth 6 ms attack (no clicks)."""
    if kind == "piano":
        dur, partials = 4.0, [(1, 1.0, 1.6), (2, 0.45, 1.0), (3, 0.2, 0.7), (4, 0.1, 0.5), (5.02, 0.05, 0.4)]
    elif kind == "musicbox":
        dur, partials = 3.0, [(1, 1.0, 1.1), (3.01, 0.32, 0.35), (5.4, 0.12, 0.2), (2.0, 0.15, 0.6)]
    else:  # celesta
        dur, partials = 3.5, [(1, 1.0, 1.4), (2.0, 0.25, 0.6), (4.0, 0.1, 0.3), (2.76, 0.06, 0.3)]
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = np.zeros(n, np.float32)
    for mult, amp, dec in partials:
        if f * mult > sr / 2.3:
            continue
        x += (amp * np.exp(-t / dec) * np.sin(2 * np.pi * f * mult * t + rng.random() * 6.28)).astype(np.float32)
    att = int(0.006 * sr)
    x[:att] *= np.linspace(0, 1, att)
    x[-int(0.2 * sr):] *= np.linspace(1, 0, int(0.2 * sr))
    return x


def bell_layer(sections, total, rng):
    n = int(total * SR)
    out = np.zeros((n, 2), np.float32)
    for t0, t1, p in sections:
        prog, cd = p["prog"], p["chord"]
        t = t0 + rng.uniform(1.0, 2.5)
        while t < min(t1, total - 4.0):
            ci = int((t - t0) // cd)
            root, shape = prog[ci % len(prog)]
            pcs = sorted({(NOTE[root] + iv) % 12 for iv in SHAPES[shape]})
            # a short figure of 1–3 notes, chord tones in E4–C6
            for k in range(rng.choice([1, 1, 2, 3])):
                pc = rng.choice(pcs)
                m = 64 + ((pc - 64) % 12) + 12 * rng.choice([0, 0, 1])
                if m > 84:
                    m -= 12
                f = mtof(m)
                if p.get("tritone") and rng.random() < 0.25:
                    f *= 2 ** (1 / 12)  # a dissonant minor second in the eerie section
                x = bell_note(p["bell"], f, SR, rng) * rng.uniform(0.5, 0.9)
                s = int((t + k * rng.uniform(0.28, 0.5)) * SR)
                e = min(n, s + len(x))
                pan = rng.uniform(-0.6, 0.6)
                out[s:e, 0] += x[: e - s] * np.sqrt(0.5 * (1 - pan))
                out[s:e, 1] += x[: e - s] * np.sqrt(0.5 * (1 + pan))
            t += p["bell_gap"] * rng.uniform(0.6, 1.5)
    sos = butter(2, 4500, btype="low", fs=SR, output="sos")
    return sosfilt(sos, out, axis=0).astype(np.float32)


def air_layer(sections, total, rng):
    """Airy top: band-passed noise with slow swells."""
    n = int(total * SR)
    noise = rng.standard_normal((n, 2)).astype(np.float32)
    sos = butter(2, [2500, 9000], btype="band", fs=SR, output="sos")
    x = sosfilt(sos, noise, axis=0).astype(np.float32)
    lvl = np.zeros(n, np.float32)
    for t0, t1, p in sections:
        a, b = int(t0 * SR), int(min(t1, total) * SR)
        lvl[a:b] = p["air"]
    lvl = np.convolve(lvl, np.ones(SR) / SR, mode="same").astype(np.float32)  # smooth section changes
    swell = 0.55 + 0.45 * (0.5 + 0.5 * lfo(n, SR, 0.045, rng)) * (0.6 + 0.4 * lfo(n, SR, 0.017, rng))
    return x * (lvl * swell)[:, None]


def reverb_ir(rt60, rng, sr=SR):
    n = int(min(6.0, rt60 * 1.2) * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-6.9 * t / rt60)[:, None]
    lo = butter(1, 5000, btype="low", fs=sr, output="sos")
    ir = sosfilt(lo, ir, axis=0)
    # darker tail: blend in a lowpassed copy as time goes on
    dark = sosfilt(butter(1, 1500, btype="low", fs=sr, output="sos"), ir, axis=0)
    w = np.clip(t / rt60, 0, 1)[:, None]
    ir = (1 - w) * ir + w * dark
    ir[: int(0.02 * sr)] = 0  # pre-delay
    return (ir / np.sqrt(np.sum(ir ** 2) / 2)).astype(np.float32)


# ---------------------------------------------------------------- main

def plan_sections(mood, duration):
    if mood == "calm_to_eerie":
        cut = duration * 0.65
        return [(0.0, cut, MOODS["calm"]), (cut, duration, MOODS["eerie"])]
    return [(0.0, duration, MOODS[mood])]


def generate(duration, mood="calm", seed=1):
    if mood not in MOOD_NAMES:
        raise SystemExit(f"unknown mood {mood}; choose from {MOOD_NAMES}")
    rng = np.random.default_rng(seed)
    total = duration + 0.5
    sections = plan_sections(mood, total)
    pad = al.resample(pad_layer(sections, total, rng), PAD_SR, SR)
    n = int(total * SR)
    pad = np.pad(pad, ((0, max(0, n - len(pad))), (0, 0)))[:n]
    bells = bell_layer(sections, total, rng)
    air = air_layer(sections, total, rng)
    pad /= np.sqrt(np.mean(pad ** 2)) + 1e-9
    bells /= np.sqrt(np.mean(bells ** 2)) + 1e-9
    air /= np.sqrt(np.mean(air ** 2)) + 1e-9
    dry = 1.0 * pad + 0.14 * bells + 0.05 * air
    send = 0.30 * pad + 0.40 * bells + 0.04 * air
    rt = float(np.mean([p["rt60"] for _, _, p in sections]))
    ir = reverb_ir(rt, rng)
    wet = np.stack([fftconvolve(send[:, c], ir[:, c])[:n] for c in range(2)], axis=1).astype(np.float32)
    mix = dry + 0.6 * wet
    mix = al.highpass(mix, SR, 30.0)
    mix = mix[: int(duration * SR)]
    mix = al.fade(mix, SR, fade_in=2.5, fade_out=min(5.0, duration * 0.15))
    mix, _ = al.normalize(mix, SR, LUFS, -1.0)
    return mix


def from_file(path, duration, xfade=2.0):
    """Loop (with crossfade) / trim / fade a user file to `duration`."""
    x = al.read_audio(path, SR, channels=2)
    n = int(duration * SR)
    if len(x) >= n:
        out = x[:n]
    else:
        xf = int(min(xfade, len(x) / SR / 4) * SR)
        out = x.copy()
        ramp = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
        while len(out) < n:
            head = out[:-xf] if xf else out
            joint = out[-xf:] * (1 - ramp) + x[:xf] * ramp if xf else np.zeros((0, 2), np.float32)
            out = np.concatenate([head, joint, x[xf:]])
        out = out[:n]
    out = al.fade(out, SR, fade_in=1.0, fade_out=min(3.0, duration * 0.1))
    out, _ = al.normalize(out, SR, LUFS, -1.0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--mood", default="calm_to_eerie", choices=MOOD_NAMES)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--file", help="user music file: loop/trim/fade it instead of generating")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    mix = from_file(a.file, a.duration) if a.file else generate(a.duration, a.mood, a.seed)
    al.write_wav(a.out, mix, SR)
    print(f"[music] {a.out}: {len(mix) / SR:.2f}s {'file' if a.file else a.mood} "
          f"LUFS {al.loudness_lufs(mix, SR):.1f} TP {al.true_peak_db(mix, SR):.1f} dBTP", file=sys.stderr)


if __name__ == "__main__":
    main()
