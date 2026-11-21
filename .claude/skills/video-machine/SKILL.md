---
name: video-machine
description: Turn a story the user sends into a finished vertical narrated video in the style of the reference reel (Roblox-style blocky characters in a small lakeside town, ~1.3 s hard cuts, binocular POV shots, calm first-person narrator, one-word captions, ambient music). Use whenever the user sends a story / "histoire" to turn into a video, or asks to run, fix or improve the video machine.
---

# Video Machine — story → video

The machine lives in `machine/` (read `machine/ARCHITECTURE.md` once per session for the contracts).
You (Claude) are the **writer and director**: you turn the user's story into `episode.json`; the code
does the rest (voice, timing, 3D render, captions, mix).

## 0. Before writing — load the rules (every time)
Read these, they are short and binding:
1. `machine/docs/03-writing-rules.md` — how to adapt any story into narration like the reference.
2. `machine/docs/04-shotlist-rules.md` — how to cut narration into shots, with the vocabulary mapping.
3. `machine/docs/02-style-bible.md` — visual rules (sets, framings, faces, palette, captions).
4. `machine/data/vocab.json` — the exact ids the engine accepts (sets + their marks/pois, poses, faces,
   framings, moves, props). Regenerate with `cd machine && node pipeline/vocab.js` if stale.
Optional: `machine/docs/01-reference-analysis.md` (measured numbers), `machine/docs/05-episode-guide.md`.

## 1. Adapt the story (script)
- Language: the user's choice (default: the language of the story). Keep proper names.
- Reference pace is FAST: 757 words in 170 s (266 wpm, tiny pauses). Target 620–780 words for ~2 min 50
  (fewer words for shorter stories: words ≈ seconds × measured TTS words/s — see `audio/README.md`).
- First person kid/teen narrator, deadpan, short sentences (half ≤ 6 words); present tense for the
  rules of the world, past tense from the first incident. Follow the 15 beats of `03-writing-rules.md`
  (hook rule → triplet → ritual + examples → personal example + recurring object → wrong detail →
  elder lore + countdown → escalation → town reaction → prophecy → climax → twist (≈ 60–69 %) →
  emotional callback → the other side's end → dark accelerating ending → final image of the object).
- Devices: refrain ×3, doubles tag ("Other X"), pivot phrase, numbers as digits, triplets, ≤ 5 short
  quotes (tag after the quote).
- Keep the user's plot. Do not invent a different story; restructure, tighten, add the devices.
- Write it to `machine/episodes/<slug>/script.md` (slug = short kebab-case id).

## 2. Cast & places
- Define every recurring character in `cast` with a distinctive, readable look (contrasting shirt
  patterns/colours, hair style/colour, 1 accessory). Kids `build: "kid"`, elders `build: "elder"`.
- Choose sets from `vocab.json` that fit the story; reuse a small number of places (3–6) like the
  reference; vary time of day/weather to show time passing.
- Pick a **recurring object** (prop) that opens and closes the story, and a **signature POV device**
  (binocular shots when someone watches something; otherwise use binoculars sparingly or not at all).

## 3. Shot list (`episode.json`)
- Split the narration into ~130–145 shots of 2–11 words (median 5): a new image at each phrase; the
  image **literally illustrates** the words (≈ 85 %). Cut just before the payoff word. Concatenated
  `say` fields must equal the script exactly.
- Framing mix like the reference (see 04-shotlist-rules): many medium shots facing camera, close-ups
  for emotions (face changes on the emotional word), wides/aerials to re-establish places, ~15–25 %
  binocular POV shots when the story has watching, over-shoulder shots looking at the target.
- Moves: mostly `static` and `push_in`; `drift` for wides; `shake` only for shocks.
- Faces carry the emotion (smile → worried → cry/scream). Poses illustrate actions.
- End with the recurring object alone on screen, strong push-in (`ending.hold` ≈ 0.8 s — the
  reference ends 0.5 s after the last word).
- Captions: colour ONLY quoted direct speech, one colour per speaker:
  `"captions": {"highlight": [{"text": "<quoted words>", "color": "#F7DE72"}, …]}`
  (palette: yellow #F7DE72, blue #74CAF8, pink #F7A5C0, mint). Never colour names.
- Write `machine/episodes/<slug>/episode.json` (format: ARCHITECTURE §8; example: `machine/episodes/_template/episode.json`).

## 4. Validate → storyboard → fix
```
cd machine
python3 pipeline/validate.py episodes/<slug>/episode.json          # fix every ERROR, review WARNs
node engine/tools/storyboard.js --episode episodes/<slug>/episode.json --out build/<slug>/storyboard.jpg
```
Look at the storyboard (Read tool). Fix shots where the subject is off-frame, hidden, wrong place,
unreadable, or where the image does not match the words. Repeat until it reads like the reference.

## 5. Produce
```
cd machine
python3 pipeline/make_video.py episodes/<slug>/episode.json --workers 3
```
(≈ 20–40 min of rendering for a 3-minute video; run it in the background and monitor.)
Then check `out/<slug>_contact.jpg` and `out/<slug>_qa.json`, extract a few frames of the final video
and look at them (captions, mask, sync). Fix and re-run only the needed steps
(`--from render`, `--only assemble`, …).

## 6. Deliver
- Commit `episodes/<slug>/` (not build/ or out/), push to the session branch.
- Send the user the MP4 (SendUserFile) + the contact sheet, and a 3-line summary (duration, shots,
  voice used, anything to improve).

## Voice
`episode.voice.provider`: `kokoro` (local, free — default), `elevenlabs` (best quality; needs the
ElevenLabs host allowed in the environment + API key), `espeak` (tests only). See `machine/audio/README.md`.

## Rules
- Never copy the reference reel's story; only its production style.
- Never claim a step worked without checking its output (frames, QA json).
- If a needed set/pose/prop does not exist, choose the closest existing one; if the gap matters,
  tell the user and propose adding it to the engine.
