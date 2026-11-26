"""Pick the most *lively* cloning prompts (excited storyteller delivery) from the analysed reels.

python3 audio/experiments/voice_study/lively_prompts.py --analysis build/voice_study/analysis [--n 3]

The zero-shot engines copy the prompt's prosody, so the prompt decides the intonation. select_prompts.py
picks a typical, clean window; this one ranks ≈9–10 s windows by liveliness instead: F0 movement
(velocity, turns, spread), dynamics (loudness swings), speech rate and pitch range, each as a z-score
over all sentences, with a cleanliness floor (ASR confidence, music residue, speaker similarity).
Writes prompts/P_X1..P_Xn.wav|txt (one per reel, never overlapping a held-out sentence) and
lively.json (scores). Same cutting, fades and −20 dBFS gain as select_prompts.py.
"""
import argparse, json, os, sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_prompts as sp  # noqa: E402

FEATS = {  # name: (getter, weight)
    "velocity": (lambda s: s["contour"]["abs_velocity_st_s"], 1.0),
    "turns": (lambda s: s["contour"]["turns_per_s"], 0.5),
    "f0_sd": (lambda s: s["f0"]["sd_st"], 1.0),
    "range": (lambda s: s["f0"]["range_st_p10_p90"], 0.75),
    "dyn": (lambda s: s["dyn"]["rms_db_sd"], 0.75),
    "rate": (lambda s: s["syl_per_s_speech"], 1.0),
    "f0_up": (lambda s: s["f0"]["median"], 0.5),  # an excited kid sits a little higher
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--n", type=int, default=3)
    a = ap.parse_args()
    A = a.analysis
    S = [s for s in json.load(open(os.path.join(A, "sentences.json"))) if s.get("f0") and s.get("contour") and s.get("dyn")]
    sims = [s["sim_centroid"]["mean"] for s in S if s.get("sim_centroid")]
    smr = [s.get("smr_db", 0) for s in S]
    g = {"sim_floor": float(np.percentile(sims, 25)), "smr_floor": float(np.percentile(smr, 30))}
    stats = {}
    for k, (f, _) in FEATS.items():
        v = np.array([f(s) for s in S], float)
        stats[k] = (float(np.median(v)), float(np.std(v) + 1e-9))
    held = json.load(open(os.path.join(A, "heldout.json")))
    avoid = {}
    for h in held:
        avoid.setdefault(h["reel"], []).append((h["t0"], h["t1"]))

    def live(s):
        return sum(w * np.clip((f(s) - stats[k][0]) / stats[k][1], -2.5, 2.5) for k, (f, w) in FEATS.items())

    cands = []
    for r in sorted(set(s["reel"] for s in S)):
        for W in sp.windows(S, r, 8.8, 10.4):
            if sp.overlaps(W[0]["t0"], W[-1]["t1"], avoid.get(r, [])):
                continue
            if not all(s.get("asr_conf", 0) >= 0.6 and s.get("smr_db", 0) >= g["smr_floor"]
                       and s.get("sim_centroid", {}).get("mean", 0) >= g["sim_floor"] for s in W):
                continue
            edge = (0 if (W[0].get("gap_before") is None or W[0]["gap_before"] >= 0.06) else -0.6) + \
                   (0 if (W[-1].get("gap_after") is None or W[-1]["gap_after"] >= 0.06) else -0.6)
            wts = np.array([s["speech_s"] for s in W])
            sc = float(np.average([live(s) for s in W], weights=wts)) + edge
            cands.append((sc, r, W))
    cands.sort(key=lambda c: -c[0])
    V, out, used = {}, [], set()
    for sc, r, W in cands:
        if r in used:
            continue
        used.add(r)
        if r not in V:
            x, sr = sf.read(os.path.join(A, "vocals", r + ".wav"), dtype="float32", always_2d=True)
            V[r] = (x.mean(axis=1), sr)
        x, sr = V[r]
        i0, i1 = sp.cut_bounds(W, x, sr)
        y = sp.finish(x[i0:i1], sr)
        pid = f"P_X{len(out) + 1}"
        sf.write(os.path.join(A, "prompts", pid + ".wav"), y, sr)
        txt = sp.text_of(W)
        open(os.path.join(A, "prompts", pid + ".txt"), "w").write(txt + "\n")
        out.append({"id": pid, "reel": r, "t0": i0 / sr, "t1": i1 / sr, "dur": round(len(y) / sr, 2), "liveliness": round(sc, 2),
                    "text": txt, "feats": {k: round(float(np.median([f(s) for s in W])), 2) for k, (f, _) in FEATS.items()}})
        print(pid, r, f"{i0 / sr:.1f}-{i1 / sr:.1f}", f"live {sc:.2f}", out[-1]["feats"], txt[:90])
        if len(out) >= a.n:
            break
    json.dump({"stats": stats, "prompts": out}, open(os.path.join(A, "lively.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
