"""One command: episode.json → finished video.

python3 pipeline/make_video.py episodes/<slug>/episode.json [--from STEP] [--only STEP] [--force]
                               [--workers 3] [--storyboard] [--quality final|preview]

Steps (in order): vocab, validate, tts, timing, music, storyboard, render, assemble, qa
Outputs: build/<slug>/… (intermediate) and out/<slug>.mp4, out/<slug>_contact.jpg, out/<slug>_qa.json
Each step is skipped when its outputs are newer than its inputs (unless --force or --only).
"""
import argparse, hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import text as T  # noqa: E402

STEPS = ["vocab", "validate", "tts", "timing", "music", "storyboard", "render", "assemble", "qa"]


def run(cmd, step):
    print(f"\n=== [{step}] {' '.join(cmd)}", flush=True)
    t0 = time.time()
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(f"[{step}] failed (exit {r.returncode})")
    print(f"=== [{step}] done in {time.time() - t0:.1f}s", flush=True)


def newer(out, *ins):
    if not os.path.exists(out):
        return False
    t = os.path.getmtime(out)
    return all(os.path.getmtime(i) <= t for i in ins if i and os.path.exists(i))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--from", dest="start", choices=STEPS)
    ap.add_argument("--only", choices=STEPS)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--storyboard", action="store_true", help="also render a one-still-per-shot storyboard")
    ap.add_argument("--quality", default="final", choices=["final", "preview"])
    a = ap.parse_args()

    ep_path = os.path.abspath(a.episode)
    ep = json.load(open(ep_path, encoding="utf-8"))
    slug = ep["id"]
    b = os.path.join(ROOT, "build", slug)
    audio = os.path.join(b, "audio")
    out_dir = os.path.join(ROOT, "out")
    os.makedirs(audio, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    words = os.path.join(audio, "words.json")
    narr = os.path.join(audio, "narration.wav")
    music = os.path.join(audio, "music.wav")
    timeline = os.path.join(b, "timeline.json")
    shots_dir = os.path.join(b, "shots")
    final = os.path.join(out_dir, f"{slug}.mp4")

    steps = [a.only] if a.only else STEPS[STEPS.index(a.start):] if a.start else STEPS
    if not a.storyboard and "storyboard" in steps and a.only != "storyboard":
        steps = [s for s in steps if s != "storyboard"]
    force = a.force or bool(a.only)

    # narration/voice fingerprint: re-run TTS only when the spoken text or the voice changes
    fp = hashlib.sha1(json.dumps([T.narration(ep), ep.get("voice"), ep.get("language")], ensure_ascii=False).encode()).hexdigest()
    stamp = os.path.join(audio, ".tts_stamp")

    t_start = time.time()
    for step in steps:
        if step == "vocab":
            vocab = os.path.join(ROOT, "data", "vocab.json")
            srcs = [os.path.join(ROOT, "engine", "web", "src", d, "index.js") for d in ("characters", "world", "director")]
            if force or not newer(vocab, *srcs):
                run(["node", "pipeline/vocab.js"], step)
        elif step == "validate":
            run([sys.executable, "pipeline/validate.py", ep_path], step)
        elif step == "tts":
            if force or not (os.path.exists(words) and os.path.exists(stamp) and open(stamp).read() == fp):
                run([sys.executable, "audio/tts.py", "--episode", ep_path, "--out", audio], step)
                open(stamp, "w").write(fp)
        elif step == "timing":
            run([sys.executable, "pipeline/timing.py", "--episode", ep_path, "--words", words, "--out", timeline], step)
        elif step == "music":
            dur = json.load(open(timeline))["duration"]
            m = ep.get("music") or {}
            if not m.get("mood") and not m.get("file"):
                print("\n=== [music] skipped (no music: voice only — music is added later in the editor)")
                continue
            if force or not newer(music, timeline):
                cmd = [sys.executable, "audio/music.py", "--duration", f"{dur + 0.5:.2f}", "--mood", m.get("mood", "calm_to_eerie"),
                       "--seed", str(m.get("seed", 1)), "--out", music]
                if m.get("file"):
                    cmd += ["--file", os.path.join(os.path.dirname(ep_path), m["file"])]
                run(cmd, step)
        elif step == "storyboard":
            run(["node", "engine/tools/storyboard.js", "--episode", ep_path, "--out", os.path.join(b, "storyboard.jpg")], step)
        elif step == "render":
            cmd = ["node", "engine/render.js", "--episode", ep_path, "--timeline", timeline, "--out", shots_dir,
                   "--workers", str(a.workers), "--quality", a.quality]
            if a.force:
                cmd.append("--force")
            run(cmd, step)
        elif step == "assemble":
            cmd = [sys.executable, "post/assemble.py", "--episode", ep_path, "--timeline", timeline, "--words", words,
                   "--shots", shots_dir, "--narration", narr, "--out", final]
            m = ep.get("music") or {}
            if m.get("mood") or m.get("file"):
                cmd += ["--music", music]
            run(cmd, step)
        elif step == "qa":
            run([sys.executable, "post/qa.py", "--video", final, "--timeline", timeline, "--words", words,
                 "--out", os.path.join(out_dir, f"{slug}_qa.json")], step)
    print(f"\nALL DONE in {(time.time() - t_start) / 60:.1f} min → {final}")


if __name__ == "__main__":
    main()
