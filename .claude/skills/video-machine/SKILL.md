---
name: video-machine
description: Turn a story the user sends into a finished vertical narrated video in the style of the reference reels (Roblox-style blocky characters, small-town horror with a creature/anomaly, ~1.3 s hard cuts, POV masks, fast first-person kid narrator, one-word captions, voice only). Use whenever the user sends a story / "histoire" to turn into a video, or asks to run, fix or improve the video machine.
---

# Video Machine — story → video (cheap path)

Everything lives in `machine/`. **Read only `machine/docs/CHEATSHEET.md`, `machine/docs/06-storytelling.md` and `machine/data/vocab.json`**
(skip docs 01–05 and the module READMEs unless you are changing the engine).

## Steps
0. Fresh session: `cd machine && bash setup.sh` (idempotent; installs deps, vocab).
1. Decide length (default ≈ 150–170 s ⇒ ≈ 500–570 words with the default voice narrator_ref), language (default: the story's).
2. Fill the adaptation template (06 §9) in a few lines, then write `machine/episodes/<slug>/story.screen` directly (format: CHEATSHEET §4). The spoken column
   is the script: follow CHEATSHEET §2 beats and §3 visual grammar. Keep the user's plot.
   Missing a creature/set/prop? Pick the closest id; if the gap matters, tell the user.
3. `cd machine && python3 pipeline/screenplay.py episodes/<slug>/story.screen` → fix every ERROR and every
   coherence WARN (what is said must be shown: CHEATSHEET §3.0).
4. `python3 pipeline/validate.py episodes/<slug>/episode.json` → fix ERRORs, consider WARNs.
5. `node engine/tools/storyboard.js --episode episodes/<slug>/episode.json --out build/<slug>/storyboard.jpg`
   → look once; fix shots that are broken (subject hidden/off-frame, wrong place, image ≠ words, nothing moving,
   the object named in the line not visible).
6. `python3 pipeline/make_video.py episodes/<slug>/episode.json --workers 3` (background, ~45–55 min incl. ~20 min of voice synthesis
   for 3 min of video). Then check `out/<slug>_contact.jpg` and `out/<slug>_qa.json`.
7. Commit `episodes/<slug>/` (not build/out), push, send the MP4 + contact sheet (SendUserFile) with a
   3-line summary.

## Rules
- Never copy a reference reel's story; only its production style.
- No music bed unless asked (the user adds music).
- Don't claim success without checking the outputs (frames, QA json).
- Token economy: no reading of big docs, one storyboard pass, render in background, no polling.
