"""Build the voice-tuner pack (MP3 grid + manifest.json) from scored candidates.

python3 audio/experiments/voice_study/build_pack.py --cands cbx_pa cbx_pa_e10 f5_pa vc_f5_pa cbx_old [--baseline cbx_old]

For every candidate: pre_fx grid (formant shift × pitch-range factor, Praat "Change gender", pitch median kept,
exact bypass at 1.0/1.0) → sentences concatenated (H1..H4, T1..T7, 0.25 s apart) → mono 24 kHz MP3 64 kbps.
Also computes "auto" settings (pitch, tempo, formant, range, gap, EQ) that bring each candidate closest to the
reference profile through the tuner's chain (pre_fx → asetrate pitch [moves formants too] → atempo → EQ).
"""
import argparse, glob, json, math, os, subprocess, sys

import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VS = os.path.join(M, "build", "voice_study")
A = os.path.join(VS, "analysis")
PACK = os.path.join(VS, "pack")
SR = 24000
FORMANTS = [0.94, 0.97, 1.0, 1.03, 1.06]
RANGES = [0.85, 1.0, 1.2]
ORDER = ["H1", "H2", "H3", "H4", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]
PAD = 0.25


def load(path):
    x = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True).stdout
    return np.frombuffer(x, dtype=np.float32).copy()


def pre_fx(x, formant=1.0, rng=1.0):
    """Static formant shift (pitch median kept) + pitch-range scaling. Exact bypass at 1.0/1.0."""
    if formant == 1.0 and rng == 1.0:
        return x
    s = parselmouth.Sound(x.astype(np.float64), SR)
    y = call(s, "Change gender", 100, 600, formant, 0, rng, 1.0)
    y = call(y, "Resample", SR, 50) if y.sampling_frequency != SR else y
    out = y.values[0].astype(np.float32)
    return out[:len(x)] if len(out) >= len(x) else np.pad(out, (0, len(x) - len(out)))


def mp3(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-c:a", "libmp3lame", "-b:a", "64k", path], input=x.astype(np.float32).tobytes(), check=True)


def feats(x):
    """F0 median (Hz), F0 range p10–p90 (st), formant F1–F3 medians, syllable-free speech rate proxy, LTAS bands."""
    s = parselmouth.Sound(x.astype(np.float64), SR)
    f0 = s.to_pitch_ac(time_step=0.01, pitch_floor=100, pitch_ceiling=600).selected_array["frequency"]
    st = 12 * np.log2(np.where(f0 > 0, f0, np.nan) / 100.0)
    dv = np.abs(np.diff(st)) / 0.01
    dv = dv[np.isfinite(dv) & (dv < 400)]  # voiced-to-voiced steps only, octave jumps dropped
    f0 = f0[f0 > 0]
    fm = s.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=6000)
    ts = [t for t in np.arange(0.02, s.duration - 0.02, 0.01)]
    pt = s.to_pitch_ac(time_step=0.01, pitch_floor=100, pitch_ceiling=600)
    F = {k: [] for k in (1, 2, 3)}
    for t in ts:
        if pt.get_value_at_time(t) and not math.isnan(pt.get_value_at_time(t)):
            for k in (1, 2, 3):
                v = fm.get_value_at_time(k, t)
                if v and not math.isnan(v):
                    F[k].append(v)
    spec = np.abs(np.fft.rfft(x[: len(x) // 2048 * 2048].reshape(-1, 2048) * np.hanning(2048), axis=1)) ** 2
    act = spec.sum(1) > np.percentile(spec.sum(1), 40)
    ltas = spec[act].mean(0) + 1e-12
    fr = np.fft.rfftfreq(2048, 1 / SR)
    return {"f0": float(np.median(f0)), "f0_range": float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))),
            "F": [float(np.median(F[k])) for k in (1, 2, 3)], "ltas": ltas, "freqs": fr,
            "vel": float(np.mean(dv)) if len(dv) else 0.0}


def band_db(ltas, fr, lo, hi, scale=1.0):
    f = fr / scale  # spectrum after a frequency scaling by `scale`
    m = (fr >= lo) & (fr < hi)
    vals = np.interp(fr[m], fr * scale, ltas)
    tot = np.interp(fr[(fr >= 100) & (fr < 8000)], fr * scale, ltas).mean()
    return 10 * np.log10(vals.mean() / tot)


def syl(text):
    import re
    return sum(max(1, len(re.findall(r"[aeiouy]+", w.lower()))) for w in re.findall(r"[A-Za-z']+|\d+", text))


def speech_rate(segs, texts):
    """Syllables per second of speech (pauses ≥ 100 ms removed, energy based)."""
    dur = 0.0
    for x in segs:
        e = np.sqrt(np.convolve(x ** 2, np.ones(240) / 240, "same"))
        on = e > max(1e-4, 0.05 * e.max())
        # fill gaps shorter than 100 ms
        idx = np.flatnonzero(on)
        if len(idx):
            gaps = np.diff(idx)
            dur += (len(idx) + sum(g - 1 for g in gaps if g - 1 < 0.1 * SR)) / SR
    return sum(syl(t) for t in texts) / max(dur, 1e-3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cands", nargs="+", required=True)
    ap.add_argument("--baseline", default="cbx_old")
    ap.add_argument("--recommended", default=None)
    a = ap.parse_args()
    held = json.load(open(os.path.join(A, "heldout.json")))
    texts = {h["key"]: h["text"] for h in held}
    prof = json.load(open(os.path.join(A, "profile.json"))) if os.path.exists(os.path.join(A, "profile.json")) else {}

    # reference: held-out sentences + montage
    ref_segs = [load(h["wav"] if os.path.isabs(h["wav"]) else os.path.join(M, h["wav"])) for h in held]
    mont = load(os.path.join(A, "ref_montage.wav"))
    R = feats(np.concatenate(ref_segs + [mont]))
    mjson = os.path.join(A, "ref_montage.json")
    mtexts = [s.get("text", "") for s in json.load(open(mjson))] if os.path.exists(mjson) else []
    R_rate = speech_rate(ref_segs, [h["text"] for h in held])
    gap_ms = 250
    try:
        g = prof.get("global", prof)
        for k in ("pauses", "pause"):
            if k in g and g[k].get("inter_median_s"):
                gap_ms = int(round(g[k]["inter_median_s"] * 1000))
    except Exception:
        pass
    for h, x in zip(held, ref_segs):
        mp3(x, os.path.join(PACK, "ref", h["key"] + ".mp3"))
    mp3(mont, os.path.join(PACK, "ref", "montage.mp3"))

    cands = []
    for cid in a.cands:
        d = os.path.join(VS, "cands", cid)
        if not os.path.exists(os.path.join(d, "manifest.json")):
            print("skip (missing)", cid); continue
        man = json.load(open(os.path.join(d, "manifest.json")))
        by = {s["key"]: s for s in man["sentences"]}
        if not all(k in by for k in ORDER):
            print("skip (incomplete)", cid); continue
        for k in ORDER:
            texts.setdefault(k, by[k]["text"])
        segs = [load(os.path.join(d, by[k]["file"])) for k in ORDER]
        C = feats(np.concatenate(segs))
        c_rate = speech_rate(segs[:4], [by[k]["text"] for k in ORDER[:4]])
        # auto settings
        p = R["f0"] / C["f0"]
        pitch_st = float(np.clip(12 * np.log2(p), -3, 3)); p = 2 ** (pitch_st / 12)
        fr_target = float(np.exp(np.mean(np.log(np.array(R["F"][1:]) / np.array(C["F"][1:]))))) / p
        fi = int(np.argmin([abs(math.log(f / fr_target)) for f in FORMANTS]))
        ri = int(np.argmin([abs(math.log(r / (R["f0_range"] / C["f0_range"]))) for r in RANGES]))
        tempo = float(np.clip(R_rate / c_rate, 0.8, 1.4))
        sc = FORMANTS[fi] * p
        bands = {"body": (60, 300), "presence": (1500, 3200), "bright": (3200, 8000), "air": (8000, 11500)}
        diff = {k: band_db(R["ltas"], R["freqs"], *v) - band_db(C["ltas"], C["freqs"], *v, scale=sc) for k, v in bands.items()}
        eq = {"body": diff["body"], "presence": diff["presence"], "bright": diff["bright"], "air": diff["air"] - diff["bright"]}
        eq = {k: float(np.clip(round(v * 2) / 2, -10, 10)) for k, v in eq.items()}
        files = {}
        for i, fm in enumerate(FORMANTS):
            for j, rg in enumerate(RANGES):
                parts, segm, t = [np.zeros(int(PAD * SR), np.float32)], [], PAD
                for x in segs:
                    y = pre_fx(x, fm, rg)
                    segm.append([round(t, 4), round(t + len(y) / SR, 4)])
                    parts += [y, np.zeros(int(PAD * SR), np.float32)]
                    t += len(y) / SR + PAD
                rel = f"cands/{cid}/f{i}_r{j}.mp3"
                mp3(np.concatenate(parts), os.path.join(PACK, rel))
                files[f"f{i}_r{j}"] = {"file": rel, "segments": segm}
        sj = json.load(open(os.path.join(d, "score.json"))) if os.path.exists(os.path.join(d, "score.json")) else {}
        ag = sj.get("agg", sj)
        def pick(*names):
            for nm in names:
                for src in (sj, ag):
                    v = src.get(nm) if isinstance(src, dict) else None
                    if isinstance(v, dict):
                        v = v.get("score", v.get("mean"))
                    if isinstance(v, (int, float)):
                        return float(v)
            return None
        pr = man.get("params", {}).get("prompt")
        prompt_rel = None
        if pr:
            prp = pr if os.path.isabs(pr) else os.path.join(M, pr)
            if os.path.exists(prp):
                prompt_rel = "prompts/" + os.path.splitext(os.path.basename(prp))[0] + ".mp3"
                mp3(load(prp), os.path.join(PACK, prompt_rel))
        sim = pick("speaker_sim", "spk_sim", "sim_wespeaker", "wespeaker", "speaker_sim_mean")
        cands.append({"id": cid, "label": man.get("label", cid), "engine": man.get("engine", "?"), "license": man.get("license", ""),
                      "desc": man.get("desc", ""), "is_baseline": cid == a.baseline, "gen_params": man.get("params", {}),
                      "scores": {"fidelity": pick("fidelity"), "speaker_sim": sim, "rate_ratio": c_rate / R_rate,
                                 "f0_diff_st": 12 * math.log2(C["f0"] / R["f0"]), "wer": pick("wer"),
                                 "ending_fall_pct": pick("ending_fall_pct", "falling_pct"),
                                 "melody_ratio": C["vel"] / max(R["vel"], 1e-6)},
                      "prompt_audio": prompt_rel,
                      "auto": {"pitch_st": round(pitch_st, 2), "tempo": round(tempo, 2), "formant_idx": fi, "range_idx": ri,
                               "gap_ms": gap_ms, "eq": eq},
                      "files": files})
        print("ok", cid, cands[-1]["scores"], cands[-1]["auto"], flush=True)
    base = [c for c in cands if c["is_baseline"]]
    rest = sorted([c for c in cands if not c["is_baseline"]], key=lambda c: -(c["scores"]["fidelity"] or 0))
    out = {"version": 2,
           "sentences": [{"key": k, "text": texts[k], "group": "heldout" if k.startswith("H") else "passage"} for k in ORDER],
           "formant_levels": FORMANTS, "range_levels": RANGES,
           "ref": {"montage": "ref/montage.mp3", "heldout": {h["key"]: f"ref/{h['key']}.mp3" for h in held}},
           "reference_profile": {"f0_median_hz": round(R["f0"]), "f0_range_st": round(R["f0_range"], 1), "rate_sps": round(R_rate, 1),
                                 "gap_ms": gap_ms, "ending_fall_pct": None,
                                 "description": "Voix de ton narrateur isolée de tes 6 vidéos (musique retirée)."},
           "candidates": rest + base,
           "recommended": a.recommended or (rest[0]["id"] if rest else (base[0]["id"] if base else None))}
    json.dump(out, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    print("pack ok", len(cands), "candidates")


if __name__ == "__main__":
    main()
