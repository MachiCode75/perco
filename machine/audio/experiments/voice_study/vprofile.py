"""Acoustic profile of a narrator voice from sentence-segmented recordings.

Reference reels (isolated vocals + faster-whisper words):
    python3 audio/experiments/voice_study/vprofile.py ref --vocals <dir of <reel>.wav> --mix <dir of mixture wavs> \
        --words whisper.json --sentences-out sentences.json --out profile.json [--emb-dir DIR]

Any other voice, from a wav and a sentence list [{"text","start","end"}] (e.g. a Chatterbox job json):
    python3 audio/experiments/voice_study/vprofile.py voice --wav take.wav --groups take.json --out profile_x.json

Per sentence: F0 stats, contour movement, sentence-final slope, speaking rate (syllables/s with pauses
≥ 100 ms excluded), pauses, formants, LTAS bands/tilt, HNR/jitter/shimmer/CPPS, loudness dynamics,
speaker embeddings. Then per-reel and global aggregates (see aggregate()).
"""
import argparse, json, os, re, sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfeat  # noqa: E402

SR = 24000
ABBR = {"mr.", "mrs.", "ms.", "dr.", "st.", "vs.", "jr.", "sr."}


# ----------------------------------------------------------------------------- sentences

def build_sentences(words):
    """Whisper words (with attached punctuation) → sentences split on . ! ? (not abbreviations)."""
    out, cur = [], []
    for w in words:
        if not w["w"]:
            continue
        cur.append(w)
        t = w["w"].strip().lower().rstrip("\"'”’)")
        if re.search(r"[.!?]$", t) and t not in ABBR:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    S = []
    for ws in out:
        text = " ".join(w["w"].strip() for w in ws)
        text = re.sub(r"\s+([,.!?;:])", r"\1", text)
        S.append({"text": text, "start": ws[0]["start"], "end": ws[-1]["end"],
                  "words": [{"w": w["w"], "start": w["start"], "end": w["end"], "p": w.get("p")} for w in ws],
                  "asr_conf": float(np.mean([w.get("p") or 0 for w in ws]))})
    return S


def refine(S, x, sr):
    """Place sentence boundaries in the silence between ASR sentences (energy VAD of the isolated
    vocals). Between sentence i and i+1 we search [end_i - 0.15, start_i+1 + 0.15]: the longest
    non-speech run becomes the gap (t1_i = run start, t0_i+1 = run end); with no silence at all (this
    narrator often runs sentences together) both are set to the lowest-energy 10 ms frame (gap 0)."""
    m = vfeat.speech_mask(x, sr, rel_db=-40, min_pause=0.03)
    db = vfeat.frame_db(x, sr)
    H = vfeat.HOP
    n = min(len(m), len(db))
    fr = lambda t: int(np.clip(round(t / H), 0, n - 1))
    for i, s in enumerate(S):
        s["t0"], s["t1"] = s["start"], s["end"]
    # outer edges
    if S:
        a = fr(S[0]["start"] - 0.3); b = fr(S[0]["start"] + 0.3)
        sp = np.where(m[a:b])[0]
        S[0]["t0"] = (a + sp[0]) * H if len(sp) else S[0]["start"]
        a = fr(S[-1]["end"] - 0.3); b = fr(S[-1]["end"] + 0.4)
        sp = np.where(m[a:b])[0]
        S[-1]["t1"] = (a + sp[-1] + 1) * H if len(sp) else S[-1]["end"]
    for i in range(len(S) - 1):
        e, s1 = S[i]["end"], S[i + 1]["start"]
        lo, hi = min(e, s1), max(e, s1)
        a, b = fr(lo - 0.15), fr(hi + 0.15)
        best, j = None, a
        while j < b:
            if not m[j]:
                k = j
                while k < b and not m[k]:
                    k += 1
                if best is None or k - j > best[1] - best[0]:
                    best = (j, k)
                j = k
            else:
                j += 1
        if best is not None and best[1] - best[0] >= 3:
            S[i]["t1"], S[i + 1]["t0"] = best[0] * H, best[1] * H
        else:
            c = a + int(np.argmin(db[a:b])) if b > a else fr(lo)
            S[i]["t1"] = S[i + 1]["t0"] = c * H
    for i, s in enumerate(S):
        s["t0"], s["t1"] = round(float(s["t0"]), 3), round(float(s["t1"]), 3)
        s["gap_before"] = round(s["t0"] - S[i - 1]["t1"], 3) if i else None
        s["gap_after"] = round(S[i + 1]["t0"] - s["t1"], 3) if i + 1 < len(S) else None
    return S


# ----------------------------------------------------------------------------- per sentence

def sentence_features(x, sr, s, emb=None, mix=None, with_emb=True):
    a, b = int(s["t0"] * sr), int(s["t1"] * sr)
    seg = x[a:b]
    f = vfeat.features(seg, sr, s["text"])
    t, f0 = f.pop("_f0_track")
    r = {k: v for k, v in f.items()}
    if mix is not None:
        acc = mix[a:b] - seg[:len(mix[a:b])]
        r["smr_db"] = float(10 * np.log10((seg ** 2).sum() / ((acc ** 2).sum() + 1e-12) + 1e-12))
        # residual in inter-word gaps ≥ 0.25 s (vocals level re speech level)
        gaps = []
        ws = s.get("words") or []
        for w0, w1 in zip(ws[:-1], ws[1:]):
            if w1["start"] - w0["end"] >= 0.25:
                gaps.append((w0["end"] + 0.06, w1["start"] - 0.06))
        if gaps:
            ge = np.concatenate([x[int(g0 * sr):int(g1 * sr)] for g0, g1 in gaps])
            r["gap_resid_db"] = float(10 * np.log10((ge ** 2).mean() + 1e-12) - 10 * np.log10((seg ** 2).mean() + 1e-12))
    if emb is not None and with_emb and len(seg) > 0.8 * sr:
        e = emb.embed(seg, sr)
        r["_emb"] = e
    r["_f0"] = (t, f0)
    return r


# ----------------------------------------------------------------------------- aggregates

def _med(vals):
    v = [x for x in vals if x is not None and np.isfinite(x)]
    return float(np.median(v)) if v else None


def aggregate(rows, x_by_src=None, sr=SR):
    """rows: per-sentence feature dicts (with _f0 and optional _emb). → aggregate profile dict."""
    f0 = np.concatenate([r["_f0"][1][r["_f0"][1] > 0] for r in rows if r.get("_f0") is not None]) if rows else np.array([])
    g = {"n_sentences": len(rows)}
    g["f0"] = vfeat.f0_stats(f0) if len(f0) else None
    g["contour"] = {k: _med([(r["contour"] or {}).get(k) for r in rows]) for k in ("abs_velocity_st_s", "turns_per_s", "declination_st_s")}
    g["f0_sentence_sd_st_median"] = _med([(r["f0"] or {}).get("sd_st") for r in rows])
    g["f0_sentence_range_st_median"] = _med([(r["f0"] or {}).get("range_st_p10_p90") for r in rows])
    # sentence-final movement by type
    fin = {}
    for typ in ("all", "statement", "question", "exclamation", "trailing"):
        rs = [r for r in rows if r.get("final") and (typ == "all" or r.get("type") == typ)]
        if not rs:
            continue
        sl = [r["final"]["slope_st_s"] for r in rs]
        cats = [r["final"]["cat"] for r in rs]
        fin[typ] = {"n": len(rs), "slope_median": float(np.median(sl)), "delta_st_median": float(np.median([r["final"]["delta_st"] for r in rs])),
                    "pct_fall": 100.0 * cats.count("fall") / len(rs), "pct_rise": 100.0 * cats.count("rise") / len(rs),
                    "pct_flat": 100.0 * cats.count("flat") / len(rs), "pct_negative_slope": 100.0 * float(np.mean(np.array(sl) < 0)),
                    "end_f0_median": float(np.median([r["final"]["end_f0"] for r in rs]))}
    g["final"] = fin
    syl = sum(r.get("syllables", 0) for r in rows); sp = sum(r["speech_s"] for r in rows); span = sum(r["span_s"] for r in rows)
    nw = sum(r.get("words", 0) for r in rows)
    g["rate"] = {"syl_per_s_speech": syl / sp if sp else None, "syl_per_s_span": syl / span if span else None,
                 "words_per_s_speech": nw / sp if sp else None, "words_per_s_span": nw / span if span else None,
                 "syl_per_s_sentence_median": _med([r.get("syl_per_s_speech") for r in rows])}
    intra = [b - a for r in rows for a, b in r["pauses"]]
    inter = [r["gap_after"] for r in rows if r.get("gap_after") is not None and 0 <= r["gap_after"] < 3]
    g["pauses"] = {"intra_median_s": _med(intra), "intra_p90_s": float(np.percentile(intra, 90)) if intra else None,
                   "intra_per_sentence": len(intra) / max(1, len(rows)),
                   "inter_median_s": _med(inter), "inter_p10_s": float(np.percentile(inter, 10)) if inter else None,
                   "inter_p90_s": float(np.percentile(inter, 90)) if inter else None}
    if inter:
        tot_speech = sum(r["span_s"] for r in rows)
        g["rate"]["syl_per_s_overall"] = syl / (tot_speech + sum(inter)) if tot_speech else None
        g["rate"]["words_per_min_overall"] = 60 * nw / (tot_speech + sum(inter)) if tot_speech else None
    g["formants"] = {k: _med([(r.get("formants") or {}).get(k) for r in rows]) for k in ("F1", "F2", "F3")}
    g["quality"] = {k: _med([(r.get("quality") or {}).get(k) for r in rows]) for k in ("hnr_db", "jitter_local", "shimmer_local", "cpps_db")}
    g["dyn"] = {k: _med([(r.get("dyn") or {}).get(k) for r in rows]) for k in ("rms_db_sd", "rms_db_p10_p90")}
    lv = [(r.get("dyn") or {}).get("level_dbfs_p50") for r in rows]
    lv = [v for v in lv if v is not None]
    g["dyn"]["sentence_level_sd_db"] = float(np.std(lv)) if len(lv) > 2 else None
    if x_by_src is not None:
        # LTAS of the concatenated sentences (speech only)
        segs = [x_by_src[r["_src"]][int(r["_t0"] * sr):int(r["_t1"] * sr)] for r in rows]
        g["ltas"] = vfeat.ltas_bands(np.concatenate(segs), sr) if segs else None
    else:
        g["ltas"] = {"bands_db": {k: _med([r["ltas"]["bands_db"][k] for r in rows]) for k, _, _ in vfeat.BANDS},
                     "tilt_db_oct": _med([r["ltas"]["tilt_db_oct"] for r in rows])}
    return g


def embedding_centroid(rows, min_dur=1.5):
    use = [r for r in rows if r.get("_emb") is not None and r["speech_s"] >= min_dur]
    out = {}
    for k in vfeat.Embedder.NAMES:
        w = np.array([r["speech_s"] for r in use])
        V = np.stack([r["_emb"][k] for r in use])
        c = (V * w[:, None]).sum(0); out[k] = c / np.linalg.norm(c)
    for r in rows:
        if r.get("_emb") is not None:
            r["sim_centroid"] = {k: vfeat.cosine(r["_emb"][k], out[k]) for k in out}
            r["sim_centroid"]["mean"] = float(np.mean(list(r["sim_centroid"].values())))
    return out


def public(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}


# ----------------------------------------------------------------------------- CLI

def cmd_ref(a):
    W = json.load(open(a.words))
    emb = vfeat.Embedder()
    rows, X, sent_out, per_reel = [], {}, {}, {}
    for reel in sorted(W):
        vp = os.path.join(a.vocals, reel + ".wav")
        if not os.path.exists(vp):
            print("missing vocals", reel); continue
        x = vfeat.load(vp, SR); X[reel] = x
        mix = vfeat.load(os.path.join(a.mix, reel + ".wav"), SR) if a.mix else None
        if mix is not None:
            n = min(len(x), len(mix)); mix = mix[:n]
        S = refine(build_sentences(W[reel]["words"]), x, SR)
        rr = []
        for i, s in enumerate(S):
            if s["t1"] - s["t0"] < 0.4:
                continue
            r = sentence_features(x, SR, s, emb=emb, mix=mix)
            r.update({"reel": reel, "i": i, "t0": s["t0"], "t1": s["t1"], "start_asr": s["start"], "end_asr": s["end"],
                      "gap_before": s["gap_before"], "gap_after": s["gap_after"], "asr_conf": s["asr_conf"],
                      "_src": reel, "_t0": s["t0"], "_t1": s["t1"], "words_t": s["words"]})
            rr.append(r)
        rows += rr
        print(reel, len(rr), "sentences", flush=True)
    cent = embedding_centroid(rows)
    os.makedirs(a.emb_dir, exist_ok=True)
    for k, v in cent.items():
        np.save(os.path.join(a.emb_dir, f"centroid_{k}.npy"), v)
    for reel in sorted(set(r["reel"] for r in rows)):
        per_reel[reel] = aggregate([r for r in rows if r["reel"] == reel], X)
    glob = aggregate(rows, X)
    sims = [r["sim_centroid"]["mean"] for r in rows if r.get("sim_centroid") and r["speech_s"] >= 1.5]
    glob["sim_centroid"] = {"median": float(np.median(sims)), "p10": float(np.percentile(sims, 10)),
                            "p90": float(np.percentile(sims, 90))}
    for k in vfeat.Embedder.NAMES:
        v = [r["sim_centroid"][k] for r in rows if r.get("sim_centroid") and r["speech_s"] >= 1.5]
        glob["sim_centroid"][k + "_median"] = float(np.median(v))
    prof = {"source": "reference reels, isolated vocals", "vocals_dir": a.vocals, "sr": SR, "global": glob, "per_reel": per_reel,
            "centroids": {k: os.path.join(a.emb_dir, f"centroid_{k}.npy") for k in cent}}
    json.dump(prof, open(a.out, "w"), indent=1)
    json.dump([public(r) for r in rows], open(a.sentences_out, "w"), indent=1)
    print("wrote", a.out, a.sentences_out)


def cmd_voice(a):
    x = vfeat.load(a.wav, SR)
    G = json.load(open(a.groups))
    G = G.get("groups", G.get("sentences", G)) if isinstance(G, dict) else G
    emb = vfeat.Embedder()
    S = [{"text": g["text"], "start": g["start"], "end": g["end"]} for g in G]
    S = refine(S, x, SR) if a.refine else [dict(s, t0=s["start"], t1=s["end"], gap_before=None, gap_after=None) for s in S]
    rows = []
    for s in S:
        r = sentence_features(x, SR, s, emb=emb)
        r.update({"t0": s["t0"], "t1": s["t1"], "gap_after": s.get("gap_after"), "_src": "x", "_t0": s["t0"], "_t1": s["t1"]})
        rows.append(r)
    glob = aggregate(rows, {"x": x})
    if a.centroid_dir:
        cen = {k: np.load(os.path.join(a.centroid_dir, f"centroid_{k}.npy")) for k in vfeat.Embedder.NAMES}
        for r in rows:
            if r.get("_emb") is not None:
                r["sim_centroid"] = {k: vfeat.cosine(r["_emb"][k], cen[k]) for k in cen}
                r["sim_centroid"]["mean"] = float(np.mean(list(r["sim_centroid"].values())))
        e = emb.embed(np.concatenate([x[int(r["t0"] * SR):int(r["t1"] * SR)] for r in rows]), SR)
        glob["sim_centroid_concat"] = {k: vfeat.cosine(e[k], cen[k]) for k in cen}
        sims = [r["sim_centroid"]["mean"] for r in rows if r.get("sim_centroid")]
        glob["sim_centroid"] = {"median": float(np.median(sims))} if sims else None
    json.dump({"source": a.wav, "global": glob, "sentences": [public(r) for r in rows]}, open(a.out, "w"), indent=1)
    print("wrote", a.out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("ref"); r.add_argument("--vocals", required=True); r.add_argument("--mix"); r.add_argument("--words", required=True)
    r.add_argument("--out", required=True); r.add_argument("--sentences-out", required=True); r.add_argument("--emb-dir", required=True)
    v = sub.add_parser("voice"); v.add_argument("--wav", required=True); v.add_argument("--groups", required=True)
    v.add_argument("--out", required=True); v.add_argument("--centroid-dir"); v.add_argument("--refine", action="store_true")
    a = ap.parse_args()
    cmd_ref(a) if a.cmd == "ref" else cmd_voice(a)


if __name__ == "__main__":
    main()
