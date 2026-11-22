#!/usr/bin/env python3
"""Narration TTS + word timings (ARCHITECTURE.md §9).

python3 audio/tts.py --episode episodes/<slug>/episode.json --out build/<slug>/audio
        [--provider kokoro|elevenlabs|espeak] [--voice …] [--speed 1.0] [--pitch st] [--wpm 165]
→ narration.wav (mono 44.1 kHz, −16 LUFS, true peak ≤ −1 dBTP) + words.json + tts_info.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

from pipeline.text import narration, words as tokenize  # noqa: E402  (shared tokenisation)
import audiolib as al  # noqa: E402

SENT_END = re.compile(r"[.!?…]+[\"'”’»)\]]*$")
ELLIPSIS = re.compile(r"(\.\.\.|…)[\"'”’»)\]]*$")
CLAUSE_END = re.compile(r"[,;:—–][\"'”’»)\]]*$")
ABBREV = {"mr.", "mrs.", "ms.", "dr.", "st.", "jr.", "sr.", "vs.", "etc.", "m.", "mme.", "mlle.", "prof."}

# Reference reel (docs/01-reference-analysis.md): 757 words / 170.6 s ≈ 266 wpm, pauses 0.12–0.24 s.
# v2 (refs 1/3/5 transcribed): 254–272 wpm, inter-word gaps p90 ≈ 0.36 s, max ≈ 0.64 s → tighter pauses.
# v3 (same "In this town…" openings read by the reference and by us): the reference articulates 10–50 %
# slower inside sentences but leaves almost no silence between them (continuous flow) → tiny pauses,
# the pace solver then lowers the engine speed to keep ~268 wpm.
DEFAULTS = {"wpm": 268.0, "sentence_pause": 0.05, "ellipsis_pause": 0.10, "paragraph_pause": 0.10,
            "clause_pause": 0.0, "hook_words": 28, "hook_pace": 0.88, "lead_in": 0.12, "tail": 0.40, "lufs": -16.0}
SPEED_RANGE = (0.6, 1.9)  # kokoro engine speed bounds (model accepts 0.5–2.0)


# ---------------------------------------------------------------- segmentation

def paragraph_ends(episode):
    """Token indices after which the author left a blank line inside a `say` (paragraph break)."""
    ends, i = set(), 0
    for s in episode["shots"]:
        say = s.get("say", "").strip()
        if not say:
            continue
        parts = re.split(r"\n\s*\n", say)
        for p in parts[:-1]:
            i += len(tokenize(p))
            ends.add(i - 1)
        i += len(tokenize(parts[-1]))
    return ends


def boundary(tok, j, para, n):
    if j == n - 1:
        return "end"
    if j in para:
        return "paragraph"
    if SENT_END.search(tok) and tok.lower() not in ABBREV:
        return "ellipsis" if ELLIPSIS.search(tok) else "sentence"
    if CLAUSE_END.search(tok):
        return "clause"
    return None


def make_chunks(toks, para, policy="sentence", max_words=40, min_words=4):
    """→ list of (first, last_exclusive, kind_after). kind ∈ sentence/ellipsis/paragraph/clause/end."""
    n = len(toks)
    kinds = [boundary(t, j, para, n) for j, t in enumerate(toks)]
    # sentences
    sents, a = [], 0
    for j, k in enumerate(kinds):
        if k in ("sentence", "ellipsis", "paragraph", "end"):
            sents.append([a, j + 1])
            a = j + 1
    # split over-long sentences at clause marks (else at the middle word)
    split = []
    for a, b in sents:
        stack = [(a, b)]
        while stack:
            x, y = stack.pop(0)
            if y - x <= max_words:
                split.append([x, y])
                continue
            mid = (x + y) // 2
            cands = [j for j in range(x + 3, y - 3) if kinds[j] == "clause"]
            cut = min(cands, key=lambda j: abs(j - mid)) + 1 if cands else mid
            stack[:0] = [(x, cut), (cut, y)]
    if policy == "paragraph":  # group sentences up to max_words, never across paragraphs
        groups, cur = [], None
        for a, b in split:
            if cur and (b - cur[0] <= max_words) and kinds[cur[1] - 1] not in ("paragraph",):
                cur[1] = b
            else:
                if cur:
                    groups.append(cur)
                cur = [a, b]
        groups.append(cur)
        split = groups
    else:  # merge very short sentences with the following one (kokoro is unstable on tiny inputs)
        merged = []
        for a, b in split:
            if merged and (merged[-1][1] - merged[-1][0] < min_words) and kinds[merged[-1][1] - 1] != "paragraph" \
                    and b - merged[-1][0] <= max_words:
                merged[-1][1] = b
            else:
                merged.append([a, b])
        if len(merged) > 1 and merged[-1][1] - merged[-1][0] < min_words and kinds[merged[-2][1] - 1] != "paragraph":
            last = merged.pop()
            merged[-1][1] = last[1]
        split = merged
    return [(a, b, kinds[b - 1] or "clause") for a, b in split]


# ---------------------------------------------------------------- per-chunk processing

def trim_chunk(audio, sr, times, rel_db=-42.0):
    """Trim leading/trailing silence using the word times as a guide + energy. Returns audio, times."""
    env = al.envelope(audio, sr, 0.005)
    thr = env.max() * 10 ** (rel_db / 20)
    valid = [t for t in times if t]
    if not valid or env.max() <= 0:
        return audio, times
    loud = np.flatnonzero(env > thr)
    lo = int(max(0.0, valid[0][0] - 0.15) * sr)
    c = loud[loud >= lo]
    s = max(0, (c[0] if len(c) else lo) - int(0.012 * sr))
    hi = int((valid[-1][1] + 0.40) * sr)
    c = loud[loud <= hi]
    e = min(len(audio), (c[-1] if len(c) else hi) + int(0.035 * sr))
    out = al.fade(audio[s:e], sr, 0.004, 0.025)
    off, dur = s / sr, (e - s) / sr
    new = [None if t is None else (min(max(0.0, t[0] - off), dur), min(max(0.0, t[1] - off), dur)) for t in times]
    # the first word of a chunk starts exactly at the detected energy onset (sound fades in a few
    # frames before the predicted phoneme boundary when it follows silence)
    k = next(i for i, t in enumerate(new) if t)
    onset = (c0 - s) / sr if (c0 := (loud[loud >= lo][0] if (loud >= lo).any() else None)) is not None else None
    if onset is not None and 0 <= new[k][0] - onset < 0.15:
        new[k] = (onset, new[k][1])
    return out, new


def enforce_gap(audio, sr, times, j, target, max_gap=None):
    """Make the silence between word j and j+1 at least `target` s (and at most `max_gap`), editing only
    inside the quiet run between them. Returns audio, times."""
    if times[j] is None or times[j + 1] is None:
        return audio, times
    env = al.envelope(audio, sr, 0.01)
    thr = env.max() * 10 ** (-40 / 20)
    a, b = int(times[j][1] * sr) - int(0.15 * sr), int(times[j + 1][0] * sr) + int(0.15 * sr)
    a, b = max(0, a), min(len(audio), b)
    if b - a < 4:
        return audio, times
    quiet = env[a:b] < thr
    # longest quiet run in the window
    best, cur, bs = (0, 0), 0, 0
    for i, q in enumerate(quiet):
        if q:
            if cur == 0:
                bs = i
            cur += 1
            if cur > best[1]:
                best = (bs, cur)
        else:
            cur = 0
    length = best[1] / sr
    if best[1] == 0:
        return audio, times
    mid = a + best[0] + best[1] // 2
    if length < target:
        ins = int((target - length) * sr)
        audio = np.concatenate([audio[:mid], np.zeros(ins, audio.dtype), audio[mid:]])
        delta = ins / sr
    elif max_gap and length > max_gap:
        rem = int((length - max_gap) * sr)
        s0 = mid - rem // 2
        audio = np.concatenate([audio[:s0], audio[s0 + rem:]])
        delta = -rem / sr
    else:
        return audio, times
    pivot = mid / sr
    new = []
    for t in times:
        if t is None:
            new.append(None)
        else:
            new.append(tuple(x + delta if x >= pivot else x for x in t))
    return audio, new


# ---------------------------------------------------------------- providers

def make_provider(name, voice, language, pitch, threads, out_dir):
    if name == "kokoro":
        from tts_kokoro import KokoroProvider
        p = KokoroProvider(voice=voice, language=language, pitch=pitch, threads=threads)
        p.chunk_policy, p.max_chunk_words = "sentence", 40
        return p
    if name == "elevenlabs":
        from tts_elevenlabs import ElevenLabsProvider
        return ElevenLabsProvider(voice=voice, language=language, cache_dir=Path(out_dir) / ".cache" / "elevenlabs")
    if name == "espeak":
        from tts_espeak import EspeakProvider
        return EspeakProvider(voice=voice, language=language)
    raise SystemExit(f"unknown provider {name}")


# ---------------------------------------------------------------- main

def synthesize(episode, out_dir, provider="kokoro", voice=None, speed=None, pitch=None, wpm=None, threads=None):
    t0 = time.time()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    vcfg = dict(episode.get("voice") or {})
    provider = provider or vcfg.get("provider") or "kokoro"
    if voice is None and (vcfg.get("provider") or "kokoro") == provider:
        voice = vcfg.get("voice")
    speed = float(speed if speed is not None else vcfg.get("speed", 1.0) or 1.0)
    pitch = pitch if pitch is not None else vcfg.get("pitch")
    opt = {k: float(vcfg[k]) if vcfg.get(k) is not None else d for k, d in DEFAULTS.items()}
    if wpm is not None:
        opt["wpm"] = float(wpm)
    language = episode.get("language", "en")

    text = narration(episode)
    toks = tokenize(text)
    if not toks:
        raise SystemExit("episode has no narration")
    para = paragraph_ends(episode)
    prov = make_provider(provider, voice, language, pitch, threads, out_dir)
    chunks = make_chunks(toks, para, prov.chunk_policy, prov.max_chunk_words)
    texts = [" ".join(toks[a:b]) for a, b, _ in chunks]
    if hasattr(prov, "set_context"):
        prov.set_context(texts)
    gap_of = {"sentence": opt["sentence_pause"], "ellipsis": opt["ellipsis_pause"],
              "paragraph": opt["paragraph_pause"], "clause": opt["clause_pause"], "end": 0.0}
    internal = []  # (chunk, local word index, target) for sentence ends inside a chunk
    for ci, (a, b, _) in enumerate(chunks):
        for j in range(a, b - 1):
            k = boundary(toks[j], j, para, len(toks))
            if k in ("sentence", "ellipsis", "paragraph"):
                internal.append((ci, j - a, gap_of[k]))
    gaps = [gap_of[k] for _, _, k in chunks]

    # ---- pace: choose engine speed so that the overall rate ≈ wpm × speed
    target_total = len(toks) / (opt["wpm"] * speed) * 60.0 if opt["wpm"] > 0 else None
    pauses = sum(gaps) + sum(t for _, _, t in internal)
    if target_total:
        ratio, want = getattr(prov, "ratio", 1.0), max(1e-3, target_total - pauses)
        # predicted speech time is monotone (but not proportional: per-token rounding) in speed → bisect
        est = lambda s: sum(prov.estimate_speech_seconds(texts, s)) / ratio
        lo, hi = SPEED_RANGE
        if est(lo) < want:
            eng_speed = lo
        elif est(hi) > want:
            eng_speed = hi
        else:
            for _ in range(9):
                mid = 0.5 * (lo + hi)
                lo, hi = (mid, hi) if est(mid) > want else (lo, mid)
            eng_speed = 0.5 * (lo + hi)
        print(f"[tts] pace: want {want:.2f}s speech -> engine speed {eng_speed:.3f}", file=sys.stderr)
    else:
        eng_speed = speed
    prov.set_pace(eng_speed)

    # ---- synthesize chunks
    pieces = []
    for ci, ((a, b, kind), t) in enumerate(zip(chunks, texts)):
        # the reference delivers the hook ("In this town, …") ~10–15 % slower than the rest
        hook = a < opt["hook_words"] and provider == "kokoro"
        if hook:
            prov.set_pace(eng_speed * opt["hook_pace"])
        audio, times = prov.synth(t, toks[a:b])
        if hook:
            prov.set_pace(eng_speed)
        audio, times = trim_chunk(np.asarray(audio, np.float32), prov.sample_rate, times)
        for cj, lj, target in [x for x in internal if x[0] == ci][::-1]:
            audio, times = enforce_gap(audio, prov.sample_rate, times, lj, target,
                                       max_gap=target * 2.5 if provider != "kokoro" else max(0.08, target * 1.6))
        audio = al.resample(audio, prov.sample_rate, al.OUT_SR)
        pieces.append((audio, times))
        print(f"[tts] chunk {ci + 1}/{len(chunks)} {len(audio) / al.OUT_SR:5.2f}s  {t[:60]}", file=sys.stderr)

    # ---- fine-tune the pace with the inter-chunk pauses (bounded)
    speech = sum(len(p[0]) for p in pieces) / al.OUT_SR
    scale = 1.0
    if target_total and sum(gaps) > 0:
        scale = float(np.clip((target_total - speech) / sum(gaps), 0.6, 1.4))
    sr = al.OUT_SR
    out, word_times, cursor = [np.zeros(int(opt["lead_in"] * sr), np.float32)], [], opt["lead_in"]
    for (audio, times), g in zip(pieces, gaps):
        word_times += [None if t is None else (t[0] + cursor, t[1] + cursor) for t in times]
        out.append(audio)
        cursor += len(audio) / sr
        gs = int(round(g * scale * sr))
        out.append(np.zeros(gs, np.float32))
        cursor += gs / sr
    out.append(np.zeros(int(opt["tail"] * sr), np.float32))
    wav = al.highpass(np.concatenate(out), sr, 60.0)
    wav, gain = al.normalize(wav, sr, opt["lufs"], -1.0)
    duration = len(wav) / sr

    # ---- words.json (fill gaps, keep monotonic)
    filled = list(word_times)
    for i, t in enumerate(filled):
        if t is None:
            prev_end = filled[i - 1][1] if i and filled[i - 1] else opt["lead_in"]
            filled[i] = (prev_end, prev_end)
    res, last = [], 0.0
    for i, (s, e) in enumerate(filled):
        s = max(s, last)
        nxt = filled[i + 1][0] if i + 1 < len(filled) else duration
        e = max(s + 0.01, min(e, max(nxt, s + 0.01)))
        res.append({"i": i, "text": toks[i], "start": round(s, 3), "end": round(min(e, duration), 3)})
        last = s
    assert [w["text"] for w in res] == toks
    (out_dir / "words.json").write_text(json.dumps({"duration": round(duration, 3), "words": res},
                                                   ensure_ascii=False, indent=1))
    al.write_wav(out_dir / "narration.wav", wav, sr)
    # ---- delivery: reshape intonation/pitch/dynamics like the reference narrator (timing unchanged)
    delivery = (episode.get("voice") or {}).get("delivery", "reference")
    if provider == "kokoro" and delivery == "reference":
        import prosody
        vcfg = episode.get("voice") or {}
        prosody.process(str(out_dir / "narration.wav"), str(out_dir / "narration.wav"),
                        target_hz=float(vcfg.get("pitch_hz", 176)), rng=float(vcfg.get("range", 1.55)))
        import soundfile as _sf
        wav, _sr = _sf.read(str(out_dir / "narration.wav"))
        wav, _ = al.normalize(wav.astype(np.float32), sr, opt["lufs"], -1.0)
        al.write_wav(out_dir / "narration.wav", wav, sr)

    span = res[-1]["end"] - res[0]["start"]
    info = {"provider": provider, "voice": getattr(prov, "cfg", {}).get("voice", voice) if provider == "kokoro" else voice,
            "preset": getattr(prov, "cfg", {}).get("preset"), "pitch": getattr(prov, "cfg", {}).get("pitch"),
            "language": language, "engine_speed": round(eng_speed, 3), "pause_scale": round(scale, 3),
            "words": len(toks), "chunks": len(chunks), "duration": round(duration, 3),
            "wpm": round(float(len(toks) / span * 60), 1), "target_wpm": round(opt["wpm"] * speed, 1),
            "lufs": round(al.loudness_lufs(wav, sr) or 0, 2), "true_peak_db": round(al.true_peak_db(wav, sr), 2),
            "seconds": round(time.time() - t0, 1)}
    (out_dir / "tts_info.json").write_text(json.dumps(info, indent=1))
    print(f"[tts] {info}", file=sys.stderr)
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episode", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--provider", choices=["kokoro", "elevenlabs", "espeak"])
    ap.add_argument("--voice", help="kokoro: preset (young_storyteller, adult_calm, fr_storyteller…), voice id "
                                    "or blend 'am_fenrir*0.7+am_michael*0.3'; elevenlabs: name or voice_id")
    ap.add_argument("--speed", type=float, help="pace multiplier on --wpm (1.0 = 255 wpm)")
    ap.add_argument("--pitch", type=float, help="kokoro: semitones (tape-style resampling)")
    ap.add_argument("--wpm", type=float, help="target overall words/min incl. pauses (0 = raw engine speed)")
    ap.add_argument("--threads", type=int, help="onnxruntime threads (default 2 or $AUDIO_THREADS)")
    a = ap.parse_args()
    episode = json.loads(Path(a.episode).read_text())
    synthesize(episode, a.out, a.provider, a.voice, a.speed, a.pitch, a.wpm, a.threads)


if __name__ == "__main__":
    main()
