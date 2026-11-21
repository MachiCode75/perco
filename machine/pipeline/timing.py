"""Shot timeline from word timings (ARCHITECTURE.md §10).

python3 pipeline/timing.py --episode episodes/<slug>/episode.json \
    --words build/<slug>/audio/words.json --out build/<slug>/timeline.json [--fps 30]

Rules (measured on the reference reel):
- a shot starts slightly before its first word (LEAD seconds) so the cut lands on the word;
- the first shot starts at 0; each shot ends where the next one starts;
- the last shot lasts until the end of the narration + ending.hold;
- frame counts are computed from cumulative rounded boundaries so that the sum of frames is exact.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import text as T  # noqa: E402

LEAD = 0.07          # cut ~2 frames before the first word of a shot (measured on the reference)
MIN_SHOT = 0.35      # warn below this duration


def build_timeline(episode, words_doc, fps=30, width=720, height=1280):
    words = words_doc["words"]
    expected = T.words(T.narration(episode))
    if len(words) != len(expected):
        raise SystemExit(f"timing: words.json has {len(words)} words, episode narration has {len(expected)}")
    for i, (w, e) in enumerate(zip(words, expected)):
        if T.norm(w["text"]) != T.norm(e):
            raise SystemExit(f"timing: word {i} mismatch: words.json '{w['text']}' vs episode '{e}'")

    ranges = T.shot_word_ranges(episode)
    hold = float(episode.get("ending", {}).get("hold", 0.8))  # reference: video ends 0.46 s after the last word
    speech_end = max(float(words_doc.get("duration", 0)), words[-1]["end"] if words else 0)
    total = speech_end + hold

    starts = []
    for k, (sid, first, last) in enumerate(ranges):
        if first is None or last is None:
            raise SystemExit(f"timing: shot {sid} has no words (silent shots are only allowed via ending.hold)")
        starts.append(0.0 if k == 0 else max(0.0, words[first]["start"] - LEAD))
    # keep strictly increasing
    for k in range(1, len(starts)):
        if starts[k] <= starts[k - 1]:
            starts[k] = starts[k - 1] + 1.0 / fps

    bounds = starts + [total]
    frame_bounds = [round(b * fps) for b in bounds]
    shots, warnings = [], []
    for k, (sid, first, last) in enumerate(ranges):
        f0, f1 = frame_bounds[k], frame_bounds[k + 1]
        frames = max(1, f1 - f0)
        dur = frames / fps
        if dur < MIN_SHOT:
            warnings.append(f"shot {sid} is short ({dur:.2f}s): consider merging with a neighbour")
        shots.append({"id": sid, "start": round(f0 / fps, 4), "end": round(f1 / fps, 4), "frames": frames,
                      "firstWord": first, "lastWord": last})
    total_frames = frame_bounds[-1]
    assert sum(s["frames"] for s in shots) == total_frames - frame_bounds[0]
    return {"fps": fps, "width": width, "height": height, "duration": round(total_frames / fps, 4),
            "frames": total_frames, "shots": shots, "warnings": warnings}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()
    ep = json.load(open(a.episode, encoding="utf-8"))
    wd = json.load(open(a.words, encoding="utf-8"))
    tl = build_timeline(ep, wd, fps=a.fps)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(tl, open(a.out, "w", encoding="utf-8"), indent=1)
    durs = [s["frames"] / tl["fps"] for s in tl["shots"]]
    print(f"timeline: {len(durs)} shots, {tl['duration']:.2f}s, mean {sum(durs)/len(durs):.2f}s/shot "
          f"(min {min(durs):.2f}, max {max(durs):.2f})")
    for w in tl["warnings"]:
        print("  warning:", w)


if __name__ == "__main__":
    main()
