"""Acoustic voice features shared by the voice study (profile.py, score.py).

Every function takes a mono float32 signal and its sample rate, so the reference recordings
(isolated vocals) and the TTS candidates are measured with exactly the same code.

  load(path, sr)                        → mono float32 at sr
  trim(x, sr)                           → leading/trailing silence trimmed (keeps ≤ pad)
  speech_mask(x, sr)                    → 10 ms frame mask of speech (energy VAD) + pauses ≥ 100 ms
  pitch(x, sr)                          → (times, f0 Hz, 0 = unvoiced), Praat autocorrelation
  final_movement(t, f0)                 → sentence-final pitch slope (st/s) over the last voiced 300 ms
  formants(x, sr)                       → F1..F3 medians over voiced, loud frames (Praat Burg)
  voice_quality(x, sr)                  → HNR, jitter, shimmer, CPPS
  ltas_bands(x, sr)                     → long-term spectrum: band levels (dB re total), tilt dB/oct
  dynamics(x, sr)                       → loudness dynamics over speech frames
  syllables(text)                       → syllable count (CMU dict, heuristic fallback, numbers spelled out)
  features(x, sr, text)                 → all of the above for one utterance (dict, JSON-able)
  Embedder                              → wespeaker + titanet speaker embeddings (sherpa-onnx, 16 kHz)
"""
from __future__ import annotations

import os, re, subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
EVAL = os.path.join(ROOT, "models", "eval")

F0_FLOOR, F0_CEIL = 90.0, 700.0
BANDS = [("sub300", 50, 300), ("low300_1k", 300, 1000), ("mid1k_2k5", 1000, 2500),
         ("presence2k5_5k", 2500, 5000), ("air5k_10k", 5000, 10000)]
HOP = 0.01


# ----------------------------------------------------------------------------- I/O

def load(path, sr=24000, start=None, dur=None):
    import soundfile as sf
    if start is None and dur is None and path.lower().endswith((".wav", ".flac")):
        x, r = sf.read(path, dtype="float32", always_2d=True)
        x = x.mean(axis=1)
        if r != sr:
            import librosa
            x = librosa.resample(x, orig_sr=r, target_sr=sr)
        return x.astype(np.float32)
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(start)] if start is not None else []) + ["-i", path]
    cmd += (["-t", str(dur)] if dur else []) + ["-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()


def resample(x, sr, to):
    if sr == to:
        return x
    import librosa
    return librosa.resample(x, orig_sr=sr, target_sr=to).astype(np.float32)


def frame_db(x, sr, hop=HOP, win=0.025):
    h, w = int(hop * sr), int(win * sr)
    if len(x) < w:
        x = np.pad(x, (0, w - len(x)))
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    e = np.mean(x[idx].astype(np.float64) ** 2, axis=1)
    return 10 * np.log10(e + 1e-12)


def speech_mask(x, sr, rel_db=-38.0, min_pause=0.10, min_speech=0.03):
    """Energy VAD on 10 ms frames. Threshold = (95th-percentile frame level) + rel_db.
    Gaps shorter than min_pause are filled (they are closures inside words, not pauses)."""
    db = frame_db(x, sr)
    if len(db) == 0:
        return db.astype(bool)
    thr = np.percentile(db, 95) + rel_db
    m = db > thr
    # fill short gaps
    def runs(b):
        r, i = [], 0
        while i < len(b):
            j = i
            while j < len(b) and b[j] == b[i]:
                j += 1
            r.append((b[i], i, j)); i = j
        return r
    for v, i, j in runs(m):
        if not v and (j - i) * HOP < min_pause and i > 0 and j < len(m):
            m[i:j] = True
    for v, i, j in runs(m):
        if v and (j - i) * HOP < min_speech:
            m[i:j] = False
    return m


def pauses(mask, min_pause=0.10):
    """→ list of (start_s, end_s) of non-speech runs ≥ min_pause strictly inside the utterance."""
    out, i, n = [], 0, len(mask)
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return out
    a, b = idx[0], idx[-1]
    i = a
    while i <= b:
        if not mask[i]:
            j = i
            while j <= b and not mask[j]:
                j += 1
            if (j - i) * HOP >= min_pause:
                out.append((i * HOP, j * HOP))
            i = j
        else:
            i += 1
    return out


def trim(x, sr, pad=0.05, rel_db=-40.0):
    m = speech_mask(x, sr, rel_db=rel_db)
    idx = np.where(m)[0]
    if len(idx) == 0:
        return x
    a = max(0, int((idx[0] * HOP - pad) * sr)); b = min(len(x), int(((idx[-1] + 1) * HOP + 0.015 + pad) * sr))
    return x[a:b]


# ----------------------------------------------------------------------------- pitch

def _snd(x, sr):
    import parselmouth
    return parselmouth.Sound(np.asarray(x, dtype=np.float64), sampling_frequency=sr)


def pitch(x, sr, floor=F0_FLOOR, ceil=F0_CEIL):
    p = _snd(x, sr).to_pitch_ac(time_step=HOP, pitch_floor=floor, pitch_ceiling=ceil, very_accurate=False,
                                octave_jump_cost=0.5, voiced_unvoiced_cost=0.2)
    f = p.selected_array["frequency"].astype(np.float64)
    t = p.xs()
    return t, f


def st(f, ref=100.0):
    return 12.0 * np.log2(np.maximum(f, 1e-6) / ref)


def clean_f0(f):
    """Remove isolated octave jumps: voiced frames > 9 st from the running median become unvoiced."""
    f = f.copy(); v = f > 0
    if v.sum() < 5:
        return f
    s = st(f[v]); med = np.median(s)
    bad = np.abs(s - med) > 12
    vi = np.where(v)[0]
    f[vi[bad]] = 0
    return f


def f0_stats(f):
    v = f[f > 0]
    if len(v) < 5:
        return None
    p10, p50, p90 = np.percentile(v, [10, 50, 90])
    s = st(v)
    return {"median": float(p50), "p10": float(p10), "p90": float(p90), "mean": float(np.mean(v)),
            "range_st_p10_p90": float(st(p90) - st(p10)), "range_st_p5_p95": float(np.subtract(*np.percentile(s, [95, 5]))),
            "sd_st": float(np.std(s)), "voiced_frames": int(len(v))}


def contour_stats(t, f):
    """Movement statistics of a pitch contour (semitones): mean absolute velocity, number of
    direction changes per second, declination over the utterance."""
    v = f > 0
    if v.sum() < 10:
        return None
    s = st(f[v]); tv = t[v]
    d = np.diff(s); dt = np.diff(tv)
    ok = dt < 0.025  # consecutive voiced frames only
    vel = np.abs(d[ok]) / dt[ok] if ok.any() else np.array([0.0])
    sign = np.sign(d[ok]); sign = sign[sign != 0]
    turns = int(np.sum(sign[1:] != sign[:-1])) if len(sign) > 1 else 0
    dur = max(tv[-1] - tv[0], 1e-3)
    decl = float(np.polyfit(tv - tv[0], s, 1)[0]) if len(s) > 3 else 0.0
    return {"abs_velocity_st_s": float(np.median(vel)), "turns_per_s": turns / dur, "declination_st_s": decl}


def final_movement(t, f, win=0.30, thr=3.0):
    """Slope (st/s) of a straight-line fit to the last `win` seconds of voicing, plus the change in
    semitones between the start and end of that window. cat: fall (< -thr st/s), rise (> thr), flat."""
    v = np.where(f > 0)[0]
    if len(v) < 6:
        return None
    t_end = t[v[-1]]
    sel = v[t[v] >= t_end - win]
    if len(sel) < 6:
        return None
    s = st(f[sel]); tt = t[sel]
    slope = float(np.polyfit(tt, s, 1)[0])
    k = max(2, len(s) // 4)
    delta = float(np.median(s[-k:]) - np.median(s[:k]))
    cat = "fall" if slope < -thr else ("rise" if slope > thr else "flat")
    return {"slope_st_s": slope, "delta_st": delta, "cat": cat, "end_f0": float(np.median(f[sel][-k:]))}


# ----------------------------------------------------------------------------- timbre

def formants(x, sr, max_formant=5500.0):
    snd = _snd(x, sr)
    fm = snd.to_formant_burg(time_step=HOP, max_number_of_formants=5, maximum_formant=max_formant,
                             window_length=0.025, pre_emphasis_from=50)
    t, f = pitch(x, sr)
    db = frame_db(x, sr)
    thr = np.percentile(db, 90) - 20 if len(db) else -100
    out = {k: [] for k in ("F1", "F2", "F3")}
    for ti, fi in zip(t, f):
        if fi <= 0:
            continue
        j = int(round(ti / HOP))
        if j >= len(db) or db[j] < thr:
            continue
        for n, k in enumerate(("F1", "F2", "F3"), 1):
            val = fm.get_value_at_time(n, ti)
            if val == val and val > 0:
                out[k].append(val)
    return {k: (float(np.median(v)) if len(v) >= 5 else None) for k, v in out.items()}


def voice_quality(x, sr, full=True):
    """HNR (cross-correlation, dB); with full=True also jitter/shimmer (local) and CPPS."""
    import parselmouth
    from parselmouth.praat import call
    snd = _snd(x, sr)
    res = {}
    try:
        h = snd.to_harmonicity_cc(time_step=HOP, minimum_pitch=F0_FLOOR, silence_threshold=0.1, periods_per_window=1.0)
        hv = h.values[h.values > -100]
        res["hnr_db"] = float(np.mean(hv)) if len(hv) else None
    except Exception:
        res["hnr_db"] = None
    if not full:
        return res
    try:
        pp = call(snd, "To PointProcess (periodic, cc)", F0_FLOOR, F0_CEIL)
        res["jitter_local"] = float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3))
        res["shimmer_local"] = float(call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    except Exception:
        res["jitter_local"] = res["shimmer_local"] = None
    try:
        pc = call(snd, "To PowerCepstrogram", 60, 0.002, 5000, 50)
        res["cpps_db"] = float(call(pc, "Get CPPS", "yes", 0.02, 0.0005, 60, 330, 0.05, "Parabolic", 0.001, 0,
                                    "Exponential decay", "Robust"))
    except Exception:
        res["cpps_db"] = None
    for k, v in list(res.items()):
        if v is not None and not np.isfinite(v):
            res[k] = None
    return res


def ltas(x, sr, n_fft=2048):
    """Long-term average power spectrum over speech frames → (freqs, power)."""
    import librosa
    S = np.abs(librosa.stft(x, n_fft=n_fft, hop_length=int(HOP * sr), win_length=n_fft, center=True)) ** 2
    e = 10 * np.log10(S.sum(axis=0) + 1e-12)
    keep = e > np.percentile(e, 95) - 30
    P = S[:, keep].mean(axis=1) if keep.any() else S.mean(axis=1)
    return librosa.fft_frequencies(sr=sr, n_fft=n_fft), P


def ltas_bands(x, sr):
    fr, P = ltas(x, sr)
    tot = P[(fr >= 50) & (fr < min(10000, sr / 2))].sum() + 1e-20
    bands = {name: float(10 * np.log10(P[(fr >= lo) & (fr < min(hi, sr / 2))].sum() / tot + 1e-12)) for name, lo, hi in BANDS}
    # spectral tilt: dB per octave over 1/3-octave bins between 150 Hz and 8 kHz
    edges = 150 * 2 ** (np.arange(0, 17) / 3.0)
    cf, lv = [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        if hi > min(8000, sr / 2):
            break
        m = (fr >= lo) & (fr < hi)
        if m.any():
            cf.append(np.sqrt(lo * hi)); lv.append(10 * np.log10(P[m].mean() + 1e-20))
    tilt = float(np.polyfit(np.log2(cf), lv, 1)[0]) if len(cf) > 4 else None
    lo_e = P[(fr >= 50) & (fr < 1000)].sum(); hi_e = P[(fr >= 1000) & (fr < 5000)].sum()
    centroid = float((fr * P).sum() / (P.sum() + 1e-20))
    return {"bands_db": bands, "tilt_db_oct": tilt, "alpha_ratio_db": float(10 * np.log10(hi_e / (lo_e + 1e-20) + 1e-12)),
            "centroid_hz": centroid}


def dynamics(x, sr):
    db = frame_db(x, sr)
    m = speech_mask(x, sr)
    v = db[m[:len(db)]] if m.any() else db
    if len(v) < 5:
        return None
    return {"rms_db_sd": float(np.std(v)), "rms_db_p10_p90": float(np.subtract(*np.percentile(v, [90, 10]))),
            "level_dbfs_p50": float(np.median(v))}


# ----------------------------------------------------------------------------- text

_CMU = None


def _num_words(text):
    try:
        from num2words import num2words
    except Exception:
        return text
    def rep(m):
        s = m.group(0)
        try:
            return " " + num2words(int(s)) + " "
        except Exception:
            return s
    return re.sub(r"\d+", rep, text)


def norm_words(text):
    t = re.sub(r"\b(\d{1,2}):00\b", r"\1", text.replace("’", "'"))
    t = re.sub(r"\b(\d{1,2}):(\d\d)\b", r"\1 \2", t)
    t = _num_words(t)
    t = re.sub(r"\bA\.?M\.?\b", "a m", t)
    t = re.sub(r"\bP\.?M\.?\b", "p m", t)
    t = t.lower().replace("-", " ")
    t = re.sub(r"[^a-z' ]+", " ", t)
    return [w.strip("'") for w in t.split() if w.strip("'")]


def _syl_heur(w):
    w = w.lower()
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


def syllables(text):
    global _CMU
    if _CMU is None:
        try:
            import pronouncing
            _CMU = pronouncing
        except Exception:
            _CMU = False
    n = 0
    for w in norm_words(text):
        if w in ("a", "m", "p") and False:
            pass
        ph = _CMU.phones_for_word(w) if _CMU else []
        n += _CMU.syllable_count(ph[0]) if ph else _syl_heur(w)
    return n


def sentence_type(text):
    t = text.strip().rstrip("\"'”’)")
    if t.endswith("?"):
        return "question"
    if t.endswith("!"):
        return "exclamation"
    if t.endswith("...") or t.endswith("…"):
        return "trailing"
    return "statement"


# ----------------------------------------------------------------------------- per-utterance

def features(x, sr, text=None, with_formants=True, with_quality=True, quality_full=True):
    t, f = pitch(x, sr)
    f = clean_f0(f)
    m = speech_mask(x, sr)
    sp = float(m.sum() * HOP)
    pz = pauses(m)
    idx = np.where(m)[0]
    total = float((idx[-1] - idx[0] + 1) * HOP) if len(idx) else 0.0
    out = {"dur": len(x) / sr, "speech_s": sp, "span_s": total, "pauses": [[round(a, 3), round(b, 3)] for a, b in pz],
           "f0": f0_stats(f), "contour": contour_stats(t, f), "final": final_movement(t, f),
           "ltas": ltas_bands(x, sr), "dyn": dynamics(x, sr)}
    if text is not None:
        ns = syllables(text); nw = len(norm_words(text))
        out.update({"text": text, "type": sentence_type(text), "syllables": ns, "words": nw,
                    "syl_per_s_speech": ns / sp if sp > 0 else None,
                    "syl_per_s_span": ns / total if total > 0 else None,
                    "words_per_s_speech": nw / sp if sp > 0 else None})
    if with_formants:
        out["formants"] = formants(x, sr)
    if with_quality:
        out["quality"] = voice_quality(x, sr, full=quality_full)
    out["_f0_track"] = (t, f)
    return out


def strip_private(d):
    return {k: v for k, v in d.items() if not k.startswith("_")}


# ----------------------------------------------------------------------------- embeddings

class Embedder:
    """wespeaker ResNet34 + NeMo TitaNet-small speaker embeddings (sherpa-onnx), unit-normalised."""
    NAMES = ("wespeaker", "titanet")

    def __init__(self, threads=2):
        import sherpa_onnx as so
        self.ex = []
        for f in ("wespeaker_en_voxceleb_resnet34.onnx", "nemo_en_titanet_small.onnx"):
            cfg = so.SpeakerEmbeddingExtractorConfig(model=os.path.join(EVAL, f), num_threads=threads)
            self.ex.append(so.SpeakerEmbeddingExtractor(cfg))

    def embed(self, x, sr):
        x = resample(np.asarray(x, dtype=np.float32), sr, 16000)
        out = {}
        for name, e in zip(self.NAMES, self.ex):
            s = e.create_stream(); s.accept_waveform(16000, x.tolist()); s.input_finished()
            v = np.array(e.compute(s)); out[name] = v / (np.linalg.norm(v) + 1e-9)
        return out


def cosine(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
