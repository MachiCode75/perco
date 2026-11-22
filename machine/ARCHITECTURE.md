# Video Machine — Architecture & Contracts

Goal: **story text in → finished vertical video out**, reproducing the *production style* of the
reference reel (Roblox-style blocky characters, small lakeside/suburban town, ~1.3 s hard cuts,
binocular POV shots, one calm first-person narrator, one-word-at-a-time captions, ambient music bed).
Everything must run headless in this Linux container (no GPU, no Roblox Studio).

This file is the **contract** between modules. Every module owner must respect it. If you need to
change a contract, write the change in the "Contract change log" at the bottom and keep backward
compatibility where possible.

---

## 0. Pipeline overview

```
episodes/<slug>/episode.json         (written by Claude from the user's story — see SKILL)
        │
        ├─► audio/tts.py      → build/<slug>/audio/narration.wav + words.json  (word timings)
        ├─► pipeline/timing.py→ build/<slug>/timeline.json  (shot start/end/frames from word timings)
        ├─► engine/render.js  → build/<slug>/shots/<shotId>.mp4 (silent, exact frame count)
        ├─► audio/music.py    → build/<slug>/audio/music.wav   (procedural bed or user file)
        └─► post/assemble.py  → out/<slug>.mp4  (concat + binocular overlay + captions + mix)
pipeline/make_video.py orchestrates all steps (idempotent, resumable, `--only`, `--from`).
```

Directory layout (all paths relative to `machine/`):

| Path | Owner | Content |
|---|---|---|
| `engine/web/index.html`, `engine/web/main.js` | engine-core | browser runtime (three.js), exposes `window.engine` |
| `engine/web/src/characters/` | characters | blocky R6-style characters, faces, clothes, hair, poses, held props |
| `engine/web/src/world/` | world | sets (locations), props library, sky/time-of-day/weather, water |
| `engine/web/src/director/` | engine-core | camera framing + camera moves |
| `engine/server.js`, `engine/render.js`, `engine/tools/*` | engine-core | static server, shot renderer, preview tools |
| `audio/` | audio | TTS providers + word timings, music bed, mixing helpers |
| `post/` | post | captions (ASS), binocular overlay, final assembly, QA contact sheet |
| `pipeline/` | lead | schema validation, timing, orchestration |
| `docs/` | analyst + lead | reference analysis, style bible, writing & shot-list rules |
| `data/` | analyst | measured reference data (JSON/TSV) |
| `assets/` | all | binocular overlays (`jumelles_720x1280.png`, `jumelles_1080x1920.png`), fonts, etc. |
| `models/` (git-ignored) | audio | downloaded TTS model files |
| `build/`, `out/` (git-ignored) | pipeline | intermediate and final outputs |

Reference material (NOT in git, read-only):
- Reference video: `/tmp/claude-0/-home-user-perco/8d4200ce-ee34-51a0-9c0c-f9edc8e74159/scratchpad/reel/src/reel.mp4`
  (720×1280, 30 fps, 170.7 s, 128 shots).
- One mid-shot frame per shot: `.../scratchpad/reel/frames/s001.jpg … s128.jpg` (labelled with shot index + start time).
- Contact sheets: `.../scratchpad/reel/sheets/sheet_01.jpg … sheet_06.jpg`.
- Cut list: `.../scratchpad/reel/work/mids.txt` (`index start end mid`).
- Caption OCR (word changes, 8 fps): `data/reference_caption_ocr.tsv`.

Tools available in the container: node 22, `require('playwright')` (Chromium pre-installed; WebGL2 works
via SwiftShader, ~250 ms/frame at 720×1280 with shadows), python3 + pip (PyPI reachable), npm registry
reachable, ffmpeg (with libass), apt mirrors reachable, GitHub release downloads reachable.
**HuggingFace and most other hosts are blocked.** Do not rely on any other network host.

---

## 1. Units, axes, conventions

- 1 unit = 1 Roblox "stud". **Y is up**, ground at `y = 0`. Right-handed (three.js default).
- A standard adult character is ~5.2 units tall (legs 2, torso 2, head ~1.2). Kids ≈ 0.82× scale.
- Characters are built facing **+Z** (their front points to +Z when `root.rotation.y = 0`).
- Yaw angles are in **radians** inside code, **degrees** inside episode JSON.
- Render resolution for shots: **720×1280 @ 30 fps** (same as reference). Final export may be upscaled to 1080×1920.
- Deterministic: every random choice goes through a seeded RNG (`ctx.rng()` → float in [0,1)).

## 2. Browser runtime context (`ctx`)

All browser modules receive a shared context object:

```js
ctx = {
  THREE,            // the three.js namespace (import * as THREE from 'three')
  scene,            // THREE.Scene (owned by runtime; modules add to it or return groups)
  renderer,         // THREE.WebGLRenderer (shadows on, PCFSoft, ACES tone mapping, sRGB output)
  camera,           // THREE.PerspectiveCamera (director owns position/target/fov)
  rng,              // () => float, seeded per shot
  textures,         // Map cache: modules may cache CanvasTextures here by key
  quality,          // 'preview' | 'final'
}
```

Textures must be generated procedurally (CanvasTexture) or loaded from files under `machine/assets/`.
No network.

## 3. Characters module — `engine/web/src/characters/index.js`

```js
export const FACES;          // array of expression ids (see below)
export const POSES;          // array of pose ids
export const HAIR_STYLES;    // array
export const SHIRT_PATTERNS; // array
export const PROPS_HELD;     // array of held-prop ids
export function randomSpec(rng, overrides?) // → a plausible random townsperson CharacterSpec
export function createCharacter(ctx, spec)  // → Character
```

`CharacterSpec` (also used verbatim in `episode.json` → `cast`):
```json
{
  "name": "Toby",
  "build": "adult | kid | elder",
  "skin": "#f2c8a0",
  "hair": { "style": "spiky | short | bowl | long | ponytail | bun | bald | cap | messy | curly", "color": "#f5d742" },
  "shirt": { "pattern": "solid | stripes_h | stripes_v | plaid | polka | argyle_vest | suit | overalls | hoodie | dress | pajamas_stars | tee_logo", "colors": ["#f2c511", "#151515"] },
  "pants": { "style": "pants | shorts | skirt | none", "color": "#151515" },
  "accessories": ["glasses", "sunglasses", "tie", "mayor_chain", "cap", "bow", "scarf", "apron", "beard", "mustache"],
  "face": "smile"
}
```
Unknown values must fall back gracefully (never throw): unknown pattern → solid, unknown hair → short.

`Character` object:
```js
{
  root,                      // THREE.Group, origin at feet centre, facing +Z
  height,                    // units, for framing
  setFace(id),               // instant swap (Roblox decal style)
  setPose(id, opts?),        // see POSES; may be animated by update(t)
  setProp(propSpec | null),  // held prop: { type: 'binoculars'|'sign'|'stopwatch'|'phone'|'flashlight'|'book'|'cup'|'letter'|'umbrella'|'bag', text?, color? }
  update(t),                 // t = seconds since shot start; drives idle sway, walk cycle, wave, crying shake…
  anchors(),                 // → { head, eyes, chest, hands, feet } as THREE.Vector3 in WORLD space
}
```

Required FACES (draw them as flat decals on the front of the head, Roblox-classic look, thick black
strokes): `neutral, smile, happy (^^ closed eyes), grin (open mouth smile), worried, sad, cry (tears),
scream (open red mouth), angry, surprised, scared, sleep, smirk, talk`.

Required POSES (all must look deliberate; arms are rigid blocks rotating at the shoulder, legs at hip):
`stand, idle, wave, walk, run, sit, binoculars (both hands raised to eyes holding binoculars),
hold_sign (both arms forward holding a sign in front of chest), point, arms_up, hug, cry (hands to
face), shrug, look_down, lie, fall, jump, talk, wade (arms slightly raised), carry`.
`walk`/`run` animate legs+arms in place; the runtime moves the root.

## 4. World module — `engine/web/src/world/index.js`

```js
export const SETS;   // array of set ids
export const PROPS;  // array of placeable prop ids
export function createSet(ctx, id, opts?)  // → SetInstance
export function createProp(ctx, id, opts?) // → THREE.Object3D (origin at base centre, front +Z)
export function applyEnvironment(ctx, { time, weather, interior }) // sky, fog, lights, exposure
```

`SetInstance`:
```js
{
  group,              // THREE.Group to add to scene
  interior,           // bool
  waterLevel,         // number | null (y of water surface if the set has water)
  marks,              // { A: {x,y,z,yaw}, B: …, C: …, D: …, crowd: [{x,y,z,yaw}, …], … }
                      //   yaw (radians) = the direction an actor on that mark faces when facing "camera"
  pois,               // named points of interest: { lake: {x,y,z}, house: …, across: …, door: … }
  cameraHints,        // { establishing: {pos:[x,y,z], target:[x,y,z], fov}, aerial: …, wide: … }
  update(t, camera),  // per-frame (water motion, underwater fog when camera.y < waterLevel, flicker…)
}
```

Required SETS (the reference reel's locations + generic small-town coverage):
`lake_dock` (wooden dock over a lake, benches, lifebuoy, lamp posts, row of colourful Victorian houses
behind a street), `lake_far_shore` (view across the water to the opposite shore with tiny houses/people),
`lake_aerial` (high wide view of the lake with both shores), `street` (sidewalk, road with crosswalk,
Victorian houses, lamp posts, white church with steeple in distance), `house_front` (one house facade,
porch, red door, flowerbeds, mailbox), `kitchen`, `living_room` (fireplace, armchair, sofa, rug,
framed picture), `bedroom` (bed, window looking out at night), `church_front`, `park`, `forest_edge`,
`road_night`, `classroom`, `shore_water` (shallow water near the shore where people wade), `underwater`.
Houses: clapboard siding, white trims, dark shutters, gable roofs, chimneys, palette from the reference
(light blue, pale yellow, pink, sage green, cream, grey-blue).

Environment `time`: `day | golden | dusk | night`; `weather`: `clear | overcast | snow | rain | fog`.
Night: dark-blue sky, warm lit windows, lamp-post lights. Snow: white ground/roofs, falling flakes.

## 5. Director — `engine/web/src/director/index.js`

```js
export const FRAMINGS; // extreme_wide, wide, aerial, establishing, medium, medium_close, close_up,
                       // extreme_close_up, over_shoulder, pov, two_shot, insert, low_angle, high_angle, back
export const MOVES;    // static, push_in, pull_out, pan_left, pan_right, drift, orbit, tilt_up, tilt_down, follow, shake
export function frameShot(ctx, { framing, angle, move, subject, target, set, actors, duration, fov })
  // → { update(t) }  — positions ctx.camera each frame
```
Rules: medium/close framings place the camera **in front of the subject along its facing direction**;
`over_shoulder` places it behind/beside the subject looking toward `target`; `establishing`/`aerial`
use `set.cameraHints`. Moves are subtle (push_in ≈ 6–12 % of distance over the shot), like the reference.

## 6. Runtime — `engine/web/main.js` → `window.engine`

```js
await window.engine.init({ width, height, quality })
await window.engine.loadShot(resolvedShot)   // builds the whole scene for one shot
window.engine.renderFrame(t) → string        // JPEG data URL of the frame at time t (seconds)
```
`resolvedShot` = a shot from episode.json with cast references resolved to full CharacterSpecs
(see §8), plus `seed` and `duration`.

## 7. Node renderer — `engine/render.js`

```
node engine/render.js --episode episodes/<slug>/episode.json --timeline build/<slug>/timeline.json \
     --out build/<slug>/shots [--only 001,002] [--quality preview|final] [--workers 2]
```
Writes one silent H.264 MP4 per shot: `build/<slug>/shots/<shotId>.mp4`, 720×1280, 30 fps,
**exactly `frames` frames** as given by the timeline. Skips shots whose output is newer than inputs
unless `--force`.

Preview tool: `node engine/tools/preview.js --episode … --shot 012 --t 0,0.5 --out preview.png`
and `node engine/tools/preview.js --spec scene.json --out x.png` (free-form scene for module testing).

## 8. Episode format — `episodes/<slug>/episode.json`

```json
{
  "version": 1,
  "id": "lac-miroir",
  "title": "…",
  "language": "en",
  "voice": { "provider": "kokoro", "voice": "young_storyteller", "wpm": 255 },
  "music": null,
  "captions": { "highlight": ["Toby", "Grandpa"] },
  "cast": { "me": { …CharacterSpec… }, "toby": { … } },
  "shots": [
    {
      "id": "001",
      "say": "There's a copy of everyone",
      "set": "lake_dock", "time": "day", "weather": "clear",
      "framing": "over_shoulder", "angle": "eye", "move": "push_in",
      "subject": "me", "target": "poi:across",
      "binoculars": false,
      "actors": [
        { "id": "me", "mark": "A", "facing": "poi:lake", "pose": "stand", "face": "neutral", "prop": null, "depth": 0 }
      ],
      "crowd": { "count": 0, "pose": "stand", "area": "crowd" },
      "note": "free text"
    }
  ],
  "ending": { "hold": 2.5 }
}
```
- `say`: the exact narration text spoken during this shot. **Concatenating all `say` fields (with
  spaces) must give the full narration.** Shots change when the words change, like the reference.
- `actors[].id` refers to `cast` keys, or `"extra:<n>"` for a random townsperson.
- `facing`: `"camera"`, `"away"`, `"left"`, `"right"`, a number (degrees), `"actor:<id>"`, `"poi:<name>"`, `"mark:<id>"`.
- `mark`: a set mark id or `{ "x": 0, "z": 0 }`.
- `depth`: how deep the actor stands in water (units), 0 = on ground.
- `binoculars: true` → post applies the binocular mask (and the director narrows the FOV).
- `subject`: actor id the camera frames, or `"poi:<name>"`, or `"set"`.

## 9. Audio outputs (audio module)

```
python3 audio/tts.py --episode episodes/<slug>/episode.json --out build/<slug>/audio
  → narration.wav (mono, 44.1 kHz) + words.json
words.json = { "duration": 171.2, "words": [ { "i": 0, "text": "There's", "start": 0.12, "end": 0.41 }, … ] }
python3 audio/music.py --duration 172 --mood calm_to_eerie --seed 1 --out build/<slug>/audio/music.wav
```
Word `text` must match the episode narration tokens in order (same tokenisation as `pipeline/text.py`:
split on whitespace; punctuation stays attached to the word).

## 10. Timeline (pipeline)

`build/<slug>/timeline.json`:
```json
{ "fps": 30, "width": 720, "height": 1280, "duration": 172.4,
  "shots": [ { "id": "001", "start": 0.0, "end": 1.73, "frames": 52, "firstWord": 0, "lastWord": 4 } ] }
```
Cuts happen at the start time of the first word of each shot (cut slightly before the word: −0.05 s).
The last shot is extended by `ending.hold` seconds. Sum of frames == round(duration × fps).

## 11. Post outputs

```
python3 post/assemble.py --episode … --timeline … --words … --shots build/<slug>/shots \
   --narration build/<slug>/audio/narration.wav --music build/<slug>/audio/music.wav --out out/<slug>.mp4
```
Final: H.264 (yuv420p, CRF ≤ 20) 1080×1920 30 fps, AAC 192 kb/s 44.1 kHz, integrated loudness −14 LUFS,
music ducked under the voice. Captions burned in (one word at a time). Binocular shots get the mask.
Also writes `out/<slug>_contact.jpg` (one frame per shot) for QA.

---

## Contract change log
- v1 (initial).
- v1.1 (after reference analysis — see docs/01..04):
  - Reference = **140 shots** (mean 1.22 s), **757 words at 266 wpm**, all hard cuts, every shot has a
    linear ~5 % centred zoom; binocular shots ≈ 15 % of runtime; cut ≈ 0.07 s before the first word.
  - `ending.hold` default **0.8 s** (was 2.5).
  - `captions.highlight` entries may be strings or `{"text", "color"}`; the reference colours ONLY
    quoted direct speech, one colour per speaker (yellow #F7DE72, blue #74CAF8, pink #F7A5C0). Extra
    optional keys supported by post: `highlight_color`, `auto_proper_nouns`, `palette`, `lead`,
    `hold_gap_max`, `last_hold` (see post/README.md).
  - Characters: extra spec fields (`shirt.sleeves`, `sleevePattern`, `sleeveColors`, `neck`, `logo`,
    `inner`, `pants.pattern`, `colors`, `shoes`, `hair.capColor`), extra patterns `vest`, `cardigan`,
    extra face `wink`, setPose options (see engine/web/src/characters/README.md).
- v1.2: **no music bed by default** (`music` omitted/null → voice-only mix; the user adds music later).
  `post/assemble.py --music` is optional.
- v2 (multi-reference, see docs/05-multi-reference.md) — NEW contracts:
  - **Creatures & modifiers (characters module)**: a CharacterSpec may contain
    `"creature": "<id>"` (archetype: `furry_giant`, `sky_face`, `shadow_eyes`, `stretched`, `tall_thin`,
    `blob`, `doll`, … listed in exported `CREATURES`), `"scale": 3.0` (uniform giant/small),
    `"stretch": {"arms": 2, "legs": 1.6, "torso": 1.3, "neck": 0.8}` (creepy elongation of a normal
    character), `"eyes": "normal|glow|hollow|many"`, `"glowColor": "#ffd84a"`. Creatures still return
    the §3 Character object (setPose/setFace/update/anchors may do creature-specific things; unknown
    poses fall back to idle). New scary FACES: `creepy_grin, wide_eyes, hollow, teeth, blank`.
  - **Text cards (world module)**: set id `card` with `setOptions: {style, text, title, drawing}`;
    styles `notebook` (lined paper, handwritten), `sign_wood`, `sign_metal` (e.g. WELCOME TO …),
    `plaque`, `note`, `phone` (message bubbles), `newspaper`, `monitor` (heart rate line + number),
    `calendar`, `clock`. The card fills a 9:16 frame from cameraHints.establishing.
  - **POV masks (post)**: shot field `pov: "binoculars" | "vignette" | "keyhole" | "scope"`
    (`binoculars: true` stays an alias). Director narrows the FOV for any `pov`.
  - **New sets (world)**: `suburban_street`, `forest_road`, `hospital_room`, `warehouse`, `backyard`,
    `city_street`, `town_square`, `rooftops_sky`.
