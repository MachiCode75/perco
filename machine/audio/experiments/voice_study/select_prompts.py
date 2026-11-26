"""Pick cloning prompts, held-out test sentences and a reference montage from the analysed reels.

python3 audio/experiments/voice_study/select_prompts.py --analysis build/voice_study/analysis [--old-prompt REEL:T0:T1]

Reads <analysis>/sentences.json + profile.json (from vprofile.py ref) and the isolated vocals
<analysis>/vocals/<reel>.wav, writes:
  prompts/P_A.wav|txt   best contiguous ≈9–10 s window (clean, close to the speaker centroid, typical
                        F0 and rate, ≥1 falling statement ending, lively F0 range, cut in silences)
  prompts/P_B.wav|txt   best ≈9–10 s window from another reel
  prompts/P_C.wav|txt   ≈10 s stitched from 2–3 short clean sentences of varied intonation with 0.25 s pauses
  prompts/P_LONG.wav|txt ≈20–25 s contiguous window (voice-conversion engines)
  prompts/P_OLD2.wav|txt the old production prompt's source span re-isolated (if --old-prompt)
  heldout/H1..H4.wav + heldout.json   4 sentences 2–5 s, varied intonation, overlapping no prompt
  ref_montage.wav (+ .json)           ≈20 s of clean sentences from every reel, no held-out overlap
  selection.json                      scores and reasons
Clips are cut in the silence around the sentences (or at the lowest-energy frame when the narrator
runs sentences together), 8 ms fades, static gain to −20 dBFS speech RMS, mono, native vocals rate.
"""
import argparse, json, os, sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfeat  # noqa: E402

TARGET_RMS_DB = -20.0


def clean_ok(s, g):
    return (s.get("asr_conf", 0) >= 0.6 and s.get("smr_db", 0) >= g["smr_floor"] and s.get("f0")
            and s.get("sim_centroid", {}).get("mean", 0) >= g["sim_floor"])


def sent_score(s, g):
    """Per-sentence quality for prompt use (higher = better)."""
    sc = 0.0
    sc += 4.0 * (s.get("sim_centroid", {}).get("mean", 0.5) - g["sim_med"])
    sc += 0.04 * min(s.get("smr_db", 0), 25)
    sc += 0.5 * (s.get("asr_conf", 0.5) - 0.8)
    if s.get("f0"):
        sc -= 0.15 * abs(vfeat.st(s["f0"]["median"]) - vfeat.st(g["f0_med"]))
    return sc


def overlaps(a0, a1, spans, margin=0.05):
    return any(a0 < b1 - margin and a1 > b0 + margin for b0, b1 in spans)


def windows(S, reel, lo, hi):
    """Consecutive sentence runs of one reel whose span is within [lo, hi] seconds."""
    R = [s for s in S if s["reel"] == reel]
    R.sort(key=lambda s: s["t0"])
    out = []
    for i in range(len(R)):
        for j in range(i, len(R)):
            span = R[j]["t1"] - R[i]["t0"]
            if span > hi:
                break
            if span >= lo:
                out.append(R[i:j + 1])
    return out


def win_score(W, g, emb=None, x=None, sr=None):
    if not all(s.get("f0") for s in W):
        return -99, {}
    base = np.mean([sent_score(s, g) for s in W])
    worst_smr = min(s.get("smr_db", 0) for s in W)
    worst_conf = min(s.get("asr_conf", 0) for s in W)
    f0 = np.median([s["f0"]["median"] for s in W])
    syl = sum(s["syllables"] for s in W); sp = sum(s["speech_s"] for s in W)
    rate = syl / sp / g["rate"]
    falls = sum(1 for s in W if s.get("final") and s["final"]["cat"] == "fall" and s["type"] != "question")
    rises = sum(1 for s in W if s.get("final") and s["final"]["cat"] == "rise" and s["type"] != "question")
    rng = np.median([s["f0"]["range_st_p10_p90"] for s in W]) / g["rng"]
    edge = (0.0 if (W[0].get("gap_before") is None or W[0]["gap_before"] >= 0.06) else -0.4) + \
           (0.0 if (W[-1].get("gap_after") is None or W[-1]["gap_after"] >= 0.06) else -0.4)
    sc = base + 0.03 * min(worst_smr, 20) + 0.6 * (worst_conf - 0.8) - 1.5 * abs(np.log(rate)) - 0.25 * abs(vfeat.st(f0) - vfeat.st(g["f0_med"]))
    sc += 0.25 * min(falls, 3) - 0.1 * rises + 0.4 * min(rng, 1.3) + edge
    info = {"base": base, "worst_smr": worst_smr, "worst_conf": worst_conf, "f0": f0, "rate_ratio": rate, "falls": falls,
            "rises": rises, "range_ratio": rng, "edge": edge}
    return sc, info


def cut_bounds(W, x, sr):
    """Start/end sample of a sentence run: inside the surrounding silences, never into neighbouring speech."""
    a = W[0]["t0"]; b = W[-1]["t1"]
    gb = W[0].get("gap_before"); ga = W[-1].get("gap_after")
    pre = min(0.06, max(0.0, (gb or 0.0) * 0.5)) if gb is not None else 0.06
    post = min(0.08, max(0.0, (ga or 0.0) * 0.5)) if ga is not None else 0.08
    return max(0, int((a - pre) * sr)), min(len(x), int((b + post) * sr))


def finish(y, sr):
    f = int(0.008 * sr)
    y = y.astype(np.float32).copy()
    if len(y) > 2 * f:
        y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    m = vfeat.speech_mask(y, sr)
    db = vfeat.frame_db(y, sr)
    lev = 10 * np.log10(np.mean(10 ** (db[m[:len(db)]] / 10))) if m.any() else -30
    g = 10 ** ((TARGET_RMS_DB - lev) / 20)
    y = y * g
    pk = np.abs(y).max()
    if pk > 0.98:
        y *= 0.98 / pk
    return y


def text_of(W):
    return " ".join(s["text"].strip() for s in W)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--old-prompt", default=None, help="REEL:T0:T1 of the old production prompt")
    a = ap.parse_args()
    A = a.analysis
    S = json.load(open(os.path.join(A, "sentences.json")))
    P = json.load(open(os.path.join(A, "profile.json")))["global"]
    sims = [s["sim_centroid"]["mean"] for s in S if s.get("sim_centroid")]
    smr = [s.get("smr_db", 0) for s in S]
    g = {"sim_med": float(np.median(sims)), "sim_floor": float(np.percentile(sims, 25)), "smr_floor": float(np.percentile(smr, 30)),
         "f0_med": P["f0"]["median"], "rate": P["rate"]["syl_per_s_speech"], "rng": P["f0_sentence_range_st_median"]}
    V = {}
    def vox(reel):
        if reel not in V:
            x, sr = sf.read(os.path.join(A, "vocals", reel + ".wav"), dtype="float32", always_2d=True)
            V[reel] = (x.mean(axis=1), sr)
        return V[reel]
    os.makedirs(os.path.join(A, "prompts"), exist_ok=True); os.makedirs(os.path.join(A, "heldout"), exist_ok=True)
    reels = sorted(set(s["reel"] for s in S))
    taken = {r: [] for r in reels}  # spans used by prompts
    sel = {"thresholds": g, "prompts": {}, "heldout": [], "montage": []}
    if a.old_prompt:
        r, t0, t1 = a.old_prompt.split(":"); taken[r].append((float(t0), float(t1)))

    def best_window(lo, hi, exclude_reels=(), avoid=True):
        cands = []
        for r in reels:
            if r in exclude_reels:
                continue
            for W in windows(S, r, lo, hi):
                if avoid and overlaps(W[0]["t0"], W[-1]["t1"], taken[r]):
                    continue
                sc, info = win_score(W, g)
                cands.append((sc, r, W, info))
        cands.sort(key=lambda c: -c[0])
        return cands

    def write_prompt(pid, r, W, info, reason):
        x, sr = vox(r)
        i0, i1 = cut_bounds(W, x, sr)
        y = finish(x[i0:i1], sr)
        sf.write(os.path.join(A, "prompts", pid + ".wav"), y, sr)
        txt = text_of(W)
        open(os.path.join(A, "prompts", pid + ".txt"), "w").write(txt + "\n")
        sel["prompts"][pid] = {"wav": os.path.join(A, "prompts", pid + ".wav"), "txt": txt, "reel": r, "t0": i0 / sr, "t1": i1 / sr,
                               "dur": round(len(y) / sr, 3), "sentences": [s["i"] for s in W], "info": info, "reason": reason}
        taken[r].append((i0 / sr, i1 / sr))
        print(pid, r, f"{i0 / sr:.2f}-{i1 / sr:.2f}", f"{len(y) / sr:.2f}s", txt[:120])

    # P_A, P_B
    c = best_window(8.8, 10.4)
    sc, r, W, info = c[0]
    write_prompt("P_A", r, W, info, "best-scoring 9–10 s window over all reels")
    c = best_window(8.8, 10.4, exclude_reels=(r,))
    sc, r2, W, info = c[0]
    write_prompt("P_B", r2, W, info, "best-scoring 9–10 s window from another reel")
    # P_LONG (may overlap P_A/P_B: it is for voice-conversion engines)
    c = best_window(20.0, 25.5, avoid=False)
    c = [x for x in c if not (a.old_prompt and overlaps(x[2][0]["t0"], x[2][-1]["t1"], [tuple(map(float, a.old_prompt.split(":")[1:]))]) and x[1] == a.old_prompt.split(":")[0])] or c
    sc, r3, W, info = c[0]
    write_prompt("P_LONG", r3, W, info, "best-scoring 20–25 s contiguous window")

    # held-out: short clean sentences of varied intonation, overlapping no prompt span
    def free(s):
        return not overlaps(s["t0"], s["t1"], taken[s["reel"]], margin=0.0)
    pool = [s for s in S if clean_ok(s, g) and 2.0 <= s["t1"] - s["t0"] <= 5.0 and free(s) and s.get("final")
            and (s.get("gap_before") is None or s["gap_before"] >= 0.03) and (s.get("gap_after") is None or s["gap_after"] >= 0.03)]
    pool.sort(key=lambda s: -sent_score(s, g))
    H, used_reels = [], []
    def pick(pred, why):
        for s in pool:
            if s in H or not pred(s):
                continue
            if used_reels.count(s["reel"]) >= 1 and any(used_reels.count(r) == 0 for r in reels) and len(H) < 4:
                # prefer a reel not used yet when an equally valid one exists
                alt = [t for t in pool if t not in H and pred(t) and used_reels.count(t["reel"]) == 0]
                if alt:
                    s = alt[0]
            H.append(s); used_reels.append(s["reel"]); s["_why"] = why
            return s
    pick(lambda s: s["type"] == "question", "question")
    pick(lambda s: s["type"] == "exclamation", "exclamation")
    pick(lambda s: s["type"] == "statement" and s["final"]["cat"] == "fall" and s["final"]["slope_st_s"] < -10, "statement, strong final fall")
    pick(lambda s: s["type"] == "statement" and s["f0"]["range_st_p10_p90"] > g["rng"], "lively statement (wide F0 range)")
    while len(H) < 4:
        pick(lambda s: s["type"] == "statement", "statement")
    # P_C: 2–3 short sentences of varied intonation, not held-out, not inside other prompts
    hspans = {r: [(s["t0"] - 0.05, s["t1"] + 0.05) for s in H if s["reel"] == r] for r in reels}
    pc_pool = [s for s in S if clean_ok(s, g) and 1.6 <= s["t1"] - s["t0"] <= 4.6 and s.get("final") and free(s)
               and not overlaps(s["t0"], s["t1"], hspans[s["reel"]], 0.0)
               and (s.get("gap_before") is None or s["gap_before"] >= 0.03) and (s.get("gap_after") is None or s["gap_after"] >= 0.03)]
    pc_pool.sort(key=lambda s: -sent_score(s, g))
    PC = []
    for pred in (lambda s: s["type"] == "statement" and s["final"]["cat"] == "fall",
                 lambda s: s["type"] == "exclamation",
                 lambda s: s["type"] == "question",
                 lambda s: s["type"] == "statement" and s["final"]["cat"] == "fall"):
        tot = sum(s["t1"] - s["t0"] for s in PC) + 0.25 * len(PC)
        for s in pc_pool:
            if s in PC or not pred(s) or tot + s["t1"] - s["t0"] > 10.6:
                continue
            PC.append(s); break
        if sum(s["t1"] - s["t0"] for s in PC) + 0.25 * (len(PC) - 1) >= 8.8 or len(PC) == 3:
            break
    parts, txts, srs = [], [], set()
    for k, s in enumerate(PC):
        x, sr = vox(s["reel"]); srs.add(sr)
        i0, i1 = cut_bounds([s], x, sr)
        seg = x[i0:i1].copy(); f = int(0.008 * sr)
        seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        if k:
            parts.append(np.zeros(int(0.25 * sr), np.float32))
        parts.append(seg); txts.append(s["text"].strip())
    sr = srs.pop()
    y = finish(np.concatenate(parts), sr)
    sf.write(os.path.join(A, "prompts", "P_C.wav"), y, sr)
    open(os.path.join(A, "prompts", "P_C.txt"), "w").write(" ".join(txts) + "\n")
    sel["prompts"]["P_C"] = {"wav": os.path.join(A, "prompts", "P_C.wav"), "txt": " ".join(txts), "dur": round(len(y) / sr, 3),
                             "parts": [{"reel": s["reel"], "t0": s["t0"], "t1": s["t1"], "type": s["type"], "final": s["final"]["cat"]} for s in PC],
                             "reason": "stitched short sentences, varied intonation, 0.25 s pauses"}
    print("P_C", f"{len(y) / sr:.2f}s", " ".join(txts))
    # old prompt re-isolated
    if a.old_prompt:
        r, t0, t1 = a.old_prompt.split(":"); t0, t1 = float(t0), float(t1)
        x, sr = vox(r)
        y = finish(x[int(t0 * sr):int(t1 * sr)], sr)
        sf.write(os.path.join(A, "prompts", "P_OLD2.wav"), y, sr)
        W = [s for s in S if s["reel"] == r and s["t0"] < t1 - 0.1 and s["t1"] > t0 + 0.1]
        txt = text_of(W)
        open(os.path.join(A, "prompts", "P_OLD2.txt"), "w").write(txt + "\n")
        sel["prompts"]["P_OLD2"] = {"wav": os.path.join(A, "prompts", "P_OLD2.wav"), "txt": txt, "reel": r, "t0": t0, "t1": t1,
                                    "dur": round(len(y) / sr, 3), "reason": "old production prompt span, re-isolated",
                                    "note": "text covers whole sentences overlapping the span; the span may cut the last one"}
    # write held-out
    HJ = []
    for k, s in enumerate(H, 1):
        x, sr = vox(s["reel"])
        i0, i1 = cut_bounds([s], x, sr)
        y = finish(x[i0:i1], sr)
        p = os.path.join(A, "heldout", f"H{k}.wav"); sf.write(p, y, sr)
        HJ.append({"key": f"H{k}", "text": s["text"].strip(), "wav": p, "dur": round(len(y) / sr, 3), "reel": s["reel"],
                   "t0": round(i0 / sr, 3), "t1": round(i1 / sr, 3), "type": s["type"], "final": s["final"], "why": s["_why"]})
        print(f"H{k}", s["reel"], f"{i0 / sr:.2f}-{i1 / sr:.2f}", s["type"], s["final"]["cat"], s["text"])
    json.dump(HJ, open(os.path.join(A, "heldout.json"), "w"), indent=1)
    sel["heldout"] = HJ
    # montage ≈20 s: best clean sentences, round-robin over reels, no held-out overlap
    hs = {r: [(h["t0"], h["t1"]) for h in HJ if h["reel"] == r] for r in reels}
    mp = {r: sorted([s for s in S if s["reel"] == r and clean_ok(s, g) and 1.5 <= s["t1"] - s["t0"] <= 5.5
                     and not overlaps(s["t0"], s["t1"], hs[r], 0.0)], key=lambda s: -sent_score(s, g)) for r in reels}
    M, tot, k = [], 0.0, 0
    while tot < 20.0 and any(mp.values()):
        r = reels[k % len(reels)]; k += 1
        if mp[r]:
            s = mp[r].pop(0); M.append(s); tot += s["t1"] - s["t0"] + 0.3
    parts, srs = [], set()
    for s in M:
        x, sr = vox(s["reel"]); srs.add(sr)
        i0, i1 = cut_bounds([s], x, sr)
        seg = x[i0:i1].copy(); f = int(0.008 * sr)
        seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        parts += [seg, np.zeros(int(0.3 * sr), np.float32)]
    sr = srs.pop()
    y = finish(np.concatenate(parts[:-1]), sr)
    sf.write(os.path.join(A, "ref_montage.wav"), y, sr)
    sel["montage"] = [{"reel": s["reel"], "t0": s["t0"], "t1": s["t1"], "text": s["text"]} for s in M]
    json.dump(sel["montage"], open(os.path.join(A, "ref_montage.json"), "w"), indent=1)
    print("montage", f"{len(y) / sr:.1f}s", len(M), "sentences")
    json.dump(sel, open(os.path.join(A, "selection.json"), "w"), indent=1, default=float)


if __name__ == "__main__":
    main()
