"""Fidelity score of a narrator-voice candidate against the reference reels' narrator.

    python3 audio/experiments/voice_study/score.py <cand_dir> [--quick] [--analysis DIR] [--print]

<cand_dir>/manifest.json (standard candidate format, see build/voice_study/README or the study brief):
    {"id", "engine", "label", "license", "params", "sr", "sentences": [{"key": "H1", "text", "file"}, ...]}
Writes <cand_dir>/score.json.

Importable for best-of-N selection:
    from score import Scorer
    sc = Scorer(quick=True)                       # loads models once (~2 s)
    m = sc.score_take("take.wav", text="So of course, I looked.", key="T5")   # → metrics + m["fidelity"]
    agg = sc.score_manifest("cands/<cid>")        # whole candidate (what the CLI writes)

Per sentence: speaker similarity to the reference centroid (wespeaker / titanet cosine), F0 median diff
(st) and range ratio vs the reference, speaking-rate ratio (syllables/s with pauses ≥ 100 ms excluded),
sentence-final slope (st/s over the last voiced 300 ms) and fall/flat/rise flag, formant ratios F1–F3,
LTAS band differences (dB), HNR diff, ASR word error rate (NeMo CTC conformer, acoustic, no LM) vs the
intended text; for held-out keys (H1..H4) also the duration ratio and the F0-contour correlation after
DTW alignment with the reference recording of the same sentence.

FIDELITY 0–100 (weights, each component in [0,1] × weight):
    speaker similarity          40   mean(wespeaker, titanet) cosine to the centroid, mapped linearly from an
                                     unrelated voice (→0) to the reference's own held-out level (→1)
    sentence endings            12   per sentence fall=1 / flat=0.5 / rise=0 (statements & exclamations;
                                     questions: rise=1), ÷ the reference's own score, capped at 1
    speaking rate               10   1 − |ln(rate ratio)| / ln 1.35
    F0 range (p10–p90, st)       7   1 − |ln(range ratio)| / ln 1.8
    F0 median                    7   1 − |Δ st| / 4
    held-out contour             6   DTW F0-contour correlation, 0 → 0, ≥ 0.75 → 1 (only H keys; if none, the
                                     other weights are rescaled to 100)
    formants F1–F3               9   1 − mean|ln ratio| / 0.15
    LTAS bands                   6   1 − mean|Δ dB| / 6
    HNR                          3   1 − |Δ dB| / 5
  intelligibility gate (WER on the whole candidate or the sentence):
    WER ≤ 0.10 → ×1;  0.10–0.25 → ×(1 − (WER − 0.10));  > 0.25 → ×0.5
"""
from __future__ import annotations

import argparse, json, os, sys, time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vfeat  # noqa: E402

ANALYSIS = os.path.join(vfeat.ROOT, "build", "voice_study", "analysis")
ASR_DIR = os.path.join(vfeat.ROOT, "models", "eval", "sherpa-onnx-nemo-ctc-en-conformer-small")
SR = 24000

WEIGHTS = {"speaker": 40, "endings": 12, "rate": 10, "f0_range": 7, "f0_median": 7, "heldout_contour": 6,
           "formants": 9, "ltas": 6, "hnr": 3}


def _clip01(v):
    return float(np.clip(v, 0.0, 1.0))


def ending_points(typ, cat):
    if cat is None:
        return None
    if typ == "question":
        return {"rise": 1.0, "flat": 0.5, "fall": 0.0}[cat]
    return {"fall": 1.0, "flat": 0.5, "rise": 0.0}[cat]


def wer(ref_words, hyp_words):
    r, h = ref_words, hyp_words
    if not r:
        return 0.0 if not h else 1.0
    D = np.zeros((len(r) + 1, len(h) + 1), dtype=np.int32)
    D[:, 0] = np.arange(len(r) + 1); D[0, :] = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            D[i, j] = min(D[i - 1, j] + 1, D[i, j - 1] + 1, D[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return float(D[-1, -1]) / len(r)


def _canon(words):
    """Merge spellings the CTC model and the text normaliser disagree on (a m → am, okay → ok …)."""
    out, i = [], 0
    while i < len(words):
        w = words[i]
        if w in ("a", "p") and i + 1 < len(words) and words[i + 1] == "m":
            out.append(w + "m"); i += 2; continue
        out.append({"okay": "ok", "mr": "mister", "mrs": "missus"}.get(w, w)); i += 1
    return out


def contour_corr(ref, cand, sr):
    """F0-contour correlation after DTW on MFCCs (10 ms frames). Returns (corr, n_pairs)."""
    import librosa
    hop = int(0.01 * sr)
    def mf(x):
        m = librosa.feature.mfcc(y=x, sr=sr, n_mfcc=20, n_fft=1024, hop_length=hop)[1:]
        return (m - m.mean(axis=1, keepdims=True)) / (m.std(axis=1, keepdims=True) + 1e-6)
    def f0grid(x, n):
        t, f = vfeat.pitch(x, sr); f = vfeat.clean_f0(f)
        g = np.zeros(n)
        idx = np.clip(np.round(t / 0.01).astype(int), 0, n - 1)
        g[idx] = f
        return g
    A, B = mf(ref), mf(cand)
    _, wp = librosa.sequence.dtw(X=A, Y=B, metric="cosine")
    fa, fb = f0grid(ref, A.shape[1]), f0grid(cand, B.shape[1])
    pa, pb = fa[wp[:, 0]], fb[wp[:, 1]]
    ok = (pa > 0) & (pb > 0)
    if ok.sum() < 20:
        return None, int(ok.sum())
    sa, sb = vfeat.st(pa[ok]), vfeat.st(pb[ok])
    return float(np.corrcoef(sa, sb)[0, 1]), int(ok.sum())


class Scorer:
    def __init__(self, analysis=ANALYSIS, quick=False, threads=2):
        self.analysis, self.quick = analysis, quick
        self.prof = json.load(open(os.path.join(analysis, "profile.json")))
        self.g = self.prof["global"]
        self.cal = self.prof.get("calibration", {})
        self.cent = {k: np.load(os.path.join(analysis, f"centroid_{k}.npy")) for k in vfeat.Embedder.NAMES}
        self.emb = vfeat.Embedder(threads=threads)
        import sherpa_onnx
        self.asr = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=os.path.join(ASR_DIR, "model.int8.onnx"),
                                                               tokens=os.path.join(ASR_DIR, "tokens.txt"), num_threads=threads)
        hp = os.path.join(analysis, "heldout.json")
        self.heldout = {h["key"]: h for h in json.load(open(hp))} if os.path.exists(hp) else {}
        self._ref_wav = {}

    # ------------------------------------------------------------------ pieces
    def transcribe(self, x, sr):
        y = vfeat.resample(x, sr, 16000)
        s = self.asr.create_stream(); s.accept_waveform(16000, y); self.asr.decode_stream(s)
        return s.result.text.strip().lower()

    def sim(self, x, sr):
        e = self.emb.embed(x, sr)
        d = {k: vfeat.cosine(e[k], self.cent[k]) for k in e}
        d["mean"] = float(np.mean([d[k] for k in vfeat.Embedder.NAMES]))
        return d

    def ref_heldout(self, key):
        if key not in self._ref_wav and key in self.heldout:
            self._ref_wav[key] = vfeat.load(self.heldout[key]["wav"], SR)
        return self._ref_wav.get(key)

    # ------------------------------------------------------------------ one take
    def score_take(self, wav, text, key=None, sr=None):
        x = vfeat.load(wav, SR) if isinstance(wav, str) else vfeat.resample(np.asarray(wav, np.float32), sr or SR, SR)
        x = vfeat.trim(x, SR, pad=0.06)
        f = vfeat.features(x, SR, text, with_formants=True, with_quality=True, quality_full=not self.quick)
        f.pop("_f0_track", None)
        m = {"key": key, "text": text, "dur": round(len(x) / SR, 3), "features": f}
        m["sim"] = self.sim(x, SR) if len(x) > 0.5 * SR else None
        hyp = self.transcribe(x, SR)
        m["asr"] = hyp
        m["wer"] = wer(_canon(vfeat.norm_words(text)), _canon(vfeat.norm_words(hyp)))
        m.update(self.compare(f))
        if key in self.heldout:
            r = self.ref_heldout(key)
            if r is not None:
                rt = vfeat.trim(r, SR, pad=0.06)
                c, n = contour_corr(rt, x, SR)
                rm, xm = vfeat.speech_mask(rt, SR), vfeat.speech_mask(x, SR)
                m["heldout"] = {"contour_corr": c, "pairs": n, "dur_ratio": float(xm.sum() / max(1, rm.sum())),
                                "span_ratio": len(x) / max(1, len(rt))}
        m["fidelity"] = self.fidelity(m, level="sentence")
        return m

    def compare(self, f):
        g, out = self.g, {}
        if f.get("f0") and g.get("f0"):
            out["f0_median_diff_st"] = float(vfeat.st(f["f0"]["median"]) - vfeat.st(g["f0"]["median"]))
            ref_rng = g.get("f0_sentence_range_st_median") or g["f0"]["range_st_p10_p90"]
            out["f0_range_ratio"] = f["f0"]["range_st_p10_p90"] / ref_rng if ref_rng else None
        if f.get("syl_per_s_speech") and g["rate"].get("syl_per_s_speech"):
            out["rate_ratio"] = f["syl_per_s_speech"] / g["rate"]["syl_per_s_speech"]
        fin = f.get("final")
        out["final_slope_st_s"] = fin["slope_st_s"] if fin else None
        out["final_cat"] = fin["cat"] if fin else None
        out["final_falling"] = (fin["cat"] == "fall") if fin else None
        if f.get("formants"):
            out["formant_ratio"] = {k: (f["formants"][k] / g["formants"][k] if f["formants"].get(k) and g["formants"].get(k) else None)
                                    for k in ("F1", "F2", "F3")}
        if f.get("ltas") and g.get("ltas"):
            out["ltas_diff_db"] = {k: f["ltas"]["bands_db"][k] - g["ltas"]["bands_db"][k] for k in f["ltas"]["bands_db"]}
            if f["ltas"].get("tilt_db_oct") is not None and g["ltas"].get("tilt_db_oct") is not None:
                out["tilt_diff_db_oct"] = f["ltas"]["tilt_db_oct"] - g["ltas"]["tilt_db_oct"]
        q = (f.get("quality") or {}).get("hnr_db")
        out["hnr_diff_db"] = (q - g["quality"]["hnr_db"]) if q is not None and g["quality"].get("hnr_db") is not None else None
        return out

    # ------------------------------------------------------------------ fidelity
    def fidelity(self, m, level="sentence"):
        cal = self.cal
        comp = {}
        sim = (m.get("sim_concat") if level == "agg" else None) or m.get("sim")
        if sim:
            lo = cal.get("sim_unrelated", 0.25)
            hi = cal.get("sim_ref_concat" if level == "agg" and m.get("sim_concat") else "sim_ref_sentence", 0.85)
            comp["speaker"] = _clip01((sim["mean"] - lo) / max(1e-3, hi - lo))
        if level == "agg":
            pts = [p for p in m.get("ending_points", []) if p is not None]
            if pts:
                comp["endings"] = _clip01(np.mean(pts) / max(0.3, cal.get("ref_ending_score", 0.65)))
        else:
            p = ending_points(vfeat.sentence_type(m.get("text") or ""), m.get("final_cat"))
            if p is not None:
                comp["endings"] = _clip01(p / max(0.3, cal.get("ref_ending_score", 0.65)))
        if m.get("rate_ratio"):
            comp["rate"] = _clip01(1 - abs(np.log(m["rate_ratio"])) / np.log(1.35))
        if m.get("f0_range_ratio"):
            comp["f0_range"] = _clip01(1 - abs(np.log(max(1e-3, m["f0_range_ratio"]))) / np.log(1.8))
        if m.get("f0_median_diff_st") is not None:
            comp["f0_median"] = _clip01(1 - abs(m["f0_median_diff_st"]) / 4.0)
        hc = m.get("heldout_contour_corr") if level == "agg" else (m.get("heldout") or {}).get("contour_corr")
        if hc is not None:
            comp["heldout_contour"] = _clip01(hc / 0.75)
        fr = [v for v in (m.get("formant_ratio") or {}).values() if v]
        if fr:
            comp["formants"] = _clip01(1 - np.mean(np.abs(np.log(fr))) / 0.15)
        ld = list((m.get("ltas_diff_db") or {}).values())
        if ld:
            comp["ltas"] = _clip01(1 - np.mean(np.abs(ld)) / 6.0)
        if m.get("hnr_diff_db") is not None:
            comp["hnr"] = _clip01(1 - abs(m["hnr_diff_db"]) / 5.0)
        wsum = sum(WEIGHTS[k] for k in comp)
        raw = 100.0 * sum(WEIGHTS[k] * v for k, v in comp.items()) / wsum if wsum else 0.0
        w = m.get("wer", 0.0) or 0.0
        gate = 1.0 if w <= 0.10 else (1 - (w - 0.10) if w <= 0.25 else 0.5)
        return {"score": round(raw * gate, 2), "raw": round(raw, 2), "wer_gate": round(gate, 3),
                "components": {k: round(v, 3) for k, v in comp.items()}, "weights_used": wsum}

    # ------------------------------------------------------------------ whole candidate
    def score_manifest(self, cand_dir, write=True, log=False):
        t0 = time.time()
        man = json.load(open(os.path.join(cand_dir, "manifest.json")))
        per, xs = [], []
        for s in man["sentences"]:
            p = os.path.join(cand_dir, s["file"])
            if not os.path.exists(p):
                per.append({"key": s["key"], "error": "missing file"}); continue
            m = self.score_take(p, s["text"], key=s["key"])
            per.append(m)
            xs.append(vfeat.trim(vfeat.load(p, SR), SR, pad=0.06))
            if log:
                print(f"  {s['key']}: fid {m['fidelity']['score']:5.1f}  sim {m['sim']['mean'] if m['sim'] else 0:.3f}  "
                      f"wer {m['wer']:.2f}  end {m['final_cat']}  rate× {m.get('rate_ratio') or 0:.2f}", flush=True)
        ok = [m for m in per if "error" not in m]
        agg = self.aggregate(ok, xs)
        res = {"id": man.get("id"), "label": man.get("label"), "engine": man.get("engine"), "aggregate": agg,
               "fidelity": agg["fidelity"]["score"], "sentences": per, "seconds": round(time.time() - t0, 1),
               "quick": self.quick, "weights": WEIGHTS}
        if write:
            json.dump(res, open(os.path.join(cand_dir, "score.json"), "w"), indent=1, default=float)
        return res

    def aggregate(self, ok, xs):
        g = self.g
        a = {"n": len(ok)}
        if xs:
            cat = np.concatenate([np.concatenate([x, np.zeros(int(0.1 * SR), np.float32)]) for x in xs])
            a["sim_concat"] = self.sim(cat, SR)
            a["ltas"] = vfeat.ltas_bands(cat, SR)
            a["ltas_diff_db"] = {k: a["ltas"]["bands_db"][k] - g["ltas"]["bands_db"][k] for k in a["ltas"]["bands_db"]}
        sims = [m["sim"]["mean"] for m in ok if m.get("sim")]
        a["sim_sentence_mean"] = float(np.mean(sims)) if sims else None
        for k in ("wespeaker", "titanet"):
            v = [m["sim"][k] for m in ok if m.get("sim")]
            a[f"sim_sentence_{k}"] = float(np.mean(v)) if v else None
        f0 = []
        for m in ok:
            fs = m["features"].get("f0")
            if fs:
                f0.append(fs)
        if f0:
            a["f0_median_hz"] = float(np.median([f["median"] for f in f0]))
            a["f0_median_diff_st"] = float(vfeat.st(a["f0_median_hz"]) - vfeat.st(g["f0"]["median"]))
            rng = float(np.median([f["range_st_p10_p90"] for f in f0]))
            a["f0_range_st_sentence_median"] = rng
            a["f0_range_ratio"] = rng / (g.get("f0_sentence_range_st_median") or g["f0"]["range_st_p10_p90"])
        syl = sum(m["features"].get("syllables", 0) for m in ok); sp = sum(m["features"]["speech_s"] for m in ok)
        if sp:
            a["syl_per_s_speech"] = syl / sp
            a["rate_ratio"] = a["syl_per_s_speech"] / g["rate"]["syl_per_s_speech"]
        a["ending_points"] = [ending_points(vfeat.sentence_type(m["text"]), m.get("final_cat")) for m in ok]
        cats = [m.get("final_cat") for m in ok if m.get("final_cat")]
        a["pct_fall"] = 100.0 * cats.count("fall") / len(cats) if cats else None
        a["pct_rise"] = 100.0 * cats.count("rise") / len(cats) if cats else None
        sl = [m["final_slope_st_s"] for m in ok if m.get("final_slope_st_s") is not None]
        a["final_slope_median"] = float(np.median(sl)) if sl else None
        fr = {}
        for k in ("F1", "F2", "F3"):
            v = [m["formant_ratio"][k] for m in ok if m.get("formant_ratio") and m["formant_ratio"].get(k)]
            fr[k] = float(np.median(v)) if v else None
        a["formant_ratio"] = fr
        h = [m["hnr_diff_db"] for m in ok if m.get("hnr_diff_db") is not None]
        a["hnr_diff_db"] = float(np.median(h)) if h else None
        nw = [len(vfeat.norm_words(m["text"])) for m in ok]
        a["wer"] = float(sum(m["wer"] * n for m, n in zip(ok, nw)) / max(1, sum(nw)))
        ho = [m["heldout"] for m in ok if m.get("heldout") and m["heldout"].get("contour_corr") is not None]
        if ho:
            a["heldout_contour_corr"] = float(np.mean([h["contour_corr"] for h in ho]))
            a["heldout_dur_ratio"] = float(np.mean([h["dur_ratio"] for h in ho]))
        a["fidelity"] = self.fidelity(a, level="agg")
        a["fidelity_sentence_mean"] = float(np.mean([m["fidelity"]["score"] for m in ok])) if ok else None
        return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cand_dir")
    ap.add_argument("--quick", action="store_true", help="skip jitter/shimmer/CPPS (HNR is kept)")
    ap.add_argument("--analysis", default=ANALYSIS)
    ap.add_argument("--print", action="store_true")
    a = ap.parse_args()
    sc = Scorer(analysis=a.analysis, quick=a.quick)
    r = sc.score_manifest(a.cand_dir, log=a.print)
    ag = r["aggregate"]
    print(f"{r['id']}: fidelity {r['fidelity']:.1f}  sim {ag['sim_concat']['mean']:.3f}  WER {ag['wer']:.3f}  "
          f"F0 Δ {ag.get('f0_median_diff_st', 0):+.2f} st  range× {ag.get('f0_range_ratio', 0):.2f}  rate× {ag.get('rate_ratio', 0):.2f}  "
          f"fall {ag.get('pct_fall') or 0:.0f}%  contour r {ag.get('heldout_contour_corr', float('nan')):.2f}  "
          f"({r['seconds']}s) → {os.path.join(a.cand_dir, 'score.json')}")


if __name__ == "__main__":
    main()
