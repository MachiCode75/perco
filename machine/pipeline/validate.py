"""Validate an episode.json against the contract (ARCHITECTURE.md §8) and the engine vocabulary.

python3 pipeline/validate.py episodes/<slug>/episode.json [--strict]

Prints errors (blocking) and warnings (style deviations from the reference reel) plus stats.
Exit code 1 if there are errors (or warnings with --strict).
Vocabulary comes from data/vocab.json (regenerate with `node pipeline/vocab.js`).
"""
import argparse, json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import text as T  # noqa: E402

# Reference-reel targets (see docs/01-reference-analysis.md)
REF = {"words_per_shot": (2.0, 6.0), "wpm": 165, "binocular_share": (0.10, 0.30), "words_total": (300, 650)}
FACING_WORDS = {"camera", "away", "left", "right"}


def load_vocab():
    p = os.path.join(ROOT, "data", "vocab.json")
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding="utf-8"))


def validate(ep, vocab, strict=False):
    errors, warnings = [], []
    E, W = errors.append, warnings.append
    for key in ("id", "language", "cast", "shots"):
        if key not in ep:
            E(f"missing top-level field '{key}'")
    if errors:
        return errors, warnings, {}
    cast = ep["cast"]
    shots = ep["shots"]
    ids = [s.get("id") for s in shots]
    dup = [k for k, n in Counter(ids).items() if n > 1]
    if dup:
        E(f"duplicate shot ids: {dup}")

    V = vocab or {}
    sets = V.get("SETS", {})
    lists = {k: set(V.get(k) or []) for k in ("FACES", "POSES", "FRAMINGS", "MOVES", "PROPS_HELD", "HAIR_STYLES", "SHIRT_PATTERNS")}

    def check(kind, value, where):
        if vocab and value is not None and lists[kind] and value not in lists[kind]:
            W(f"{where}: unknown {kind[:-1].lower()} '{value}' (engine will fall back)")

    for cid, spec in cast.items():
        check("HAIR_STYLES", (spec.get("hair") or {}).get("style"), f"cast.{cid}")
        check("SHIRT_PATTERNS", (spec.get("shirt") or {}).get("pattern"), f"cast.{cid}")
        check("FACES", spec.get("face"), f"cast.{cid}")

    for s in shots:
        where = f"shot {s.get('id')}"
        if not str(s.get("say", "")).strip():
            E(f"{where}: empty 'say' (every shot must carry narration words)")
        st = s.get("set")
        if not st:
            E(f"{where}: missing 'set'")
        elif vocab and st not in sets:
            E(f"{where}: unknown set '{st}' (known: {', '.join(sorted(sets))})")
        sinfo = sets.get(st, {})
        check("FRAMINGS", s.get("framing"), where)
        check("MOVES", s.get("move"), where)
        for a in s.get("actors", []):
            aid = a.get("id", "")
            if not (aid in cast or aid.startswith("extra:")):
                E(f"{where}: actor '{aid}' not in cast (use a cast key or 'extra:<n>')")
            m = a.get("mark")
            if isinstance(m, str) and sinfo and m not in sinfo.get("marks", []):
                E(f"{where}: actor '{aid}' mark '{m}' not in set '{st}' marks {sinfo.get('marks')}")
            f = a.get("facing")
            if isinstance(f, str) and f not in FACING_WORDS:
                kind, _, name = f.partition(":")
                if kind == "poi" and sinfo and name not in sinfo.get("pois", []):
                    E(f"{where}: facing poi '{name}' not in set '{st}' pois {sinfo.get('pois')}")
                elif kind == "actor" and name not in [x.get("id") for x in s.get("actors", [])]:
                    W(f"{where}: facing actor '{name}' is not in this shot")
                elif kind not in ("poi", "actor", "mark"):
                    E(f"{where}: invalid facing '{f}'")
            check("POSES", a.get("pose"), where)
            check("FACES", a.get("face"), where)
            p = a.get("prop")
            ptype = p.get("type") if isinstance(p, dict) else p
            check("PROPS_HELD", ptype, where)
        subj = s.get("subject")
        if isinstance(subj, str) and subj not in ("set",) and not subj.startswith(("poi:", "mark:")):
            if subj not in [x.get("id") for x in s.get("actors", [])]:
                E(f"{where}: subject '{subj}' is not an actor of this shot")
        tgt = s.get("target")
        if isinstance(tgt, str) and tgt.startswith("poi:") and sinfo and tgt[4:] not in sinfo.get("pois", []):
            E(f"{where}: target poi '{tgt[4:]}' not in set '{st}'")
        if s.get("crowd", {}).get("count", 0) and sinfo:
            area = s["crowd"].get("area", "crowd")
            slots = {c["area"]: c["slots"] for c in sinfo.get("crowds", [])}
            if area not in slots:
                E(f"{where}: crowd area '{area}' not in set '{st}' ({list(slots)})")
            elif s["crowd"]["count"] > slots[area]:
                W(f"{where}: crowd count {s['crowd']['count']} > {slots[area]} slots (will be capped)")

    # style stats vs reference
    words = T.words(T.narration(ep))
    per_shot = [len(T.words(s.get("say", ""))) for s in shots]
    nb = sum(1 for s in shots if s.get("binoculars"))
    stats = {
        "shots": len(shots), "words": len(words),
        "est_duration_s": round(len(words) / REF["wpm"] * 60, 1),
        "words_per_shot_mean": round(sum(per_shot) / max(1, len(per_shot)), 2),
        "binocular_share": round(nb / max(1, len(shots)), 2),
        "framings": dict(Counter(s.get("framing", "?") for s in shots).most_common()),
        "sets": dict(Counter(s.get("set", "?") for s in shots).most_common()),
    }
    lo, hi = REF["words_total"]
    if not lo <= len(words) <= hi:
        W(f"narration has {len(words)} words (reference ≈ 450–500; target {lo}–{hi})")
    lo, hi = REF["words_per_shot"]
    if not lo <= stats["words_per_shot_mean"] <= hi:
        W(f"mean {stats['words_per_shot_mean']} words/shot (reference ≈ 3.5–4)")
    for s, n in zip(shots, per_shot):
        if n > 9:
            W(f"shot {s.get('id')}: {n} words — too long for this style, split it")
    return errors, warnings, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    ep = json.load(open(a.episode, encoding="utf-8"))
    vocab = load_vocab()
    if vocab is None:
        print("warning: data/vocab.json missing — run `node pipeline/vocab.js` for full checks")
    errors, warnings, stats = validate(ep, vocab, a.strict)
    print(json.dumps(stats, ensure_ascii=False))
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors or (a.strict and warnings) else 0)


if __name__ == "__main__":
    main()
