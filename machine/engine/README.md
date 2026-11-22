# Engine (engine-core)

Browser runtime (three.js in headless Chromium/SwiftShader) + director + Node shot renderer + QA tools.
Contracts: `ARCHITECTURE.md` §5 (director), §6 (runtime), §7 (renderer), §8 (episode), §10 (timeline).

```
engine/
  server.js          static server rooted at machine/
  browser.js         openRuntime() (Chromium + runtime page), parseArgs, resolveShot (cast → specs, seed, duration)
  render.js          episode + timeline → build/<slug>/shots/<id>.mp4 (+ render_report.json)
  web/index.html     runtime page (import map for three)
  web/main.js        window.engine runtime
  web/src/director/  framings + camera moves
  tools/preview.js   stills of one shot / free-form scene
  tools/storyboard.js contact sheet, one still per shot (or --matrix: all framings)
  tools/bench.js     ms/frame for one shot
```

## Quick start

```bash
# QA storyboard before a full render (≈0.3 s per shot at 360×640)
node engine/tools/storyboard.js --episode episodes/_test/episode.json --out build/_test/storyboard.jpg
# full render (2 browser workers), then inspect build/_test/render_report.json
node engine/render.js --episode episodes/_test/episode.json --timeline episodes/_test/timeline.json --workers 2
```

## Renderer CLI — `engine/render.js`

```
node engine/render.js --episode episodes/<slug>/episode.json --timeline build/<slug>/timeline.json
     [--out build/<slug>/shots] [--only 001,004,010-014] [--quality preview|final] [--workers 2] [--force]
     [--crf 18] [--preset medium] [--jpeg 0.92] [--no-shadows] [--no-code-hash] [--dry-run] [--restart-every 20]
```
- Cast resolution: `actors[].id` → `episode.cast[id]`; `extra:<n>` → `randomSpec` seeded by the id (the same
  `extra:3` looks identical in every shot); unknown ids → random townsperson + warning. A `subject` that is a cast
  member missing from `actors` is added automatically (auto-placed on a free mark).
- Shot seed = `shot.seed` or hash(`episode.id:shot.id`). Duration = `frames / fps`; frame *i* is rendered at
  `t = i / fps`, exactly `frames` frames (from the timeline; missing timeline/shot → `duration` or 1.5 s).
- Frames are JPEG data URLs piped into `ffmpeg -f image2pipe -framerate 30 -c:v mjpeg -i - -c:v libx264 -pix_fmt yuv420p -crf 18`
  (written to a temp file, renamed on success). Each output is checked with `ffprobe` (packet count, size).
- Up-to-date check: `shots/.meta/<id>.json` stores a hash of (resolved shot, frames, size, fps, quality, crf, jpeg,
  **engine/web source hash**). Any change to the shot or to the runtime/characters/world/director code re-renders;
  `--no-code-hash` ignores code changes, `--force` re-renders everything. Without meta it falls back to mtimes.
- Workers: N independent Chromium processes (one page each, browser restarted every 20 shots and after any failure).
- Errors are per shot: a failing shot is recorded (`status: "error"`, message, last console lines) and the run
  continues; exit code 1 if any shot failed. `build/<slug>/render_report.json` is rewritten after every shot
  (totals, per-shot ms, ms/frame, camera info, warnings).
- Progress log: `[w1] 004 35/38 frames 230 ms/f | total 183/489 ETA 28s`.

## Runtime — `window.engine` (`engine/web/main.js`)

| call | |
|---|---|
| `await init({width, height, quality})` | creates the WebGL renderer (shadows PCFSoft, ACES, sRGB). Re-init = resize. |
| `await loadShot(resolvedShot)` | builds set, environment, actors, crowd, camera. Returns `{ok, ms, warnings, camera, actors, crowd}`. Waits for async textures/fonts. |
| `renderFrame(t, mime='image/jpeg', q)` | steps walks + `character.update(t)` + camera + `set.update(t, camera)`, renders, returns a data URL. Pure function of `t` (frames can be rendered in any order). |
| `setOptions({quality, shadows, jpegQuality, exposure, maxShadowMap, shadowFollow, pointShadows})` | runtime options (unknown keys warn). |
| `info()`, `capabilities()`, `debugRay(from, to)` | last shot info + render stats / module enums / what the collision ray hits. |

Shot fields understood (episode §8 plus optional extensions, all fault-tolerant):
- `set`, `setOptions` (passed to `createSet`), `time`, `weather`, `interior` (override), `exposure` (multiplier).
- `actors[]`: `id`, `spec` (resolved by the renderer), `mark` (`"A"`, `"mark:B"`, `"crowd:3"`, `"poi:dock"`,
  `{x,z[,y,yaw°]}`, `[x,z]`; missing/unknown → next free mark A, B, C…; y defaults to the ground under the point),
  `facing`, `pose`, `poseOptions`, `face`, `prop` (string or object), `depth`, `walk`, `scale`.
- `facing`: `camera` (default for actors) = turn toward the final camera position; `away`; `left`/`right` = toward
  screen-left/right (profile); a number = absolute world yaw in degrees; `actor:<id>`, `poi:<name>`, `mark:<id>`,
  `{x,z}`, `target`, `mark` (keep the mark's yaw). The subject of `over_shoulder`/`back`/`pov` faces `target` by default.
- `depth`: units below the water surface (`waterLevel − depth`), or words: `ankle, knee/wading, thigh, waist,
  chest, shoulders/neck, head, submerged` (fractions of the actor's height). Without water in the set the actor is sunk into the ground (warning).
- `walk`: `{to: <mark|{x,z}|poi:x|actor:id>, speed=4.5, delay=0, pose, arrivePose, ground=true}` (or just the
  destination). Root moves along a straight line with a short acceleration, `walk` pose (`run` if speed ≥ 8),
  faces the walking direction, follows the ground (raycast), stops 2.2 units short of an actor, then `arrivePose`.
- `crowd`: `{count, area='crowd', pose (string or array → random per member), face, prop, depth, facing (default
  'mark' = slot yaw; 'camera' etc. allowed), pick ('order'|'near'), seed, spec}`. Specs are seeded by set+slot so
  the same townspeople stand in the same places across shots. More members than slots → extra rows behind.
  Crowd members that block the camera's view of the subject (or stand on the camera) are hidden.
- `subject`: actor id / `actor:id` / `extra:n`, `poi:<name>`, `mark:<id>`, `{x,y,z}` or `"set"`. Without a subject,
  character framings pick the first actor.
- `target`: actor id or point; used by `over_shoulder`, `pov`, `two_shot` (partner) and `facing: "target"`.
- `binoculars: true` → long lens + handheld wobble, subject kept inside the mask band (post applies the mask).
- `fov`: vertical FOV override in degrees. For character framings the director *keeps the framing* and
  recomputes the distance (lens change); for `pov`/hint framings it is a zoom.
- `camera` (optional): `{azimuth°, elevation°, distance (×), height (+units), side: 'left'|'right', fov, pos:[x,y,z], target:[x,y,z], underwater}`;
  `pos`+`target` = fully manual camera. `moveAmount` scales move intensity (default 1). `underwater: true` allows the camera below `waterLevel`.
- `props` (optional): `[{type, at, yaw°, scale, opts}]` placed with `world.createProp`.

Also: directional-light shadow frustum is re-centred on the camera pivot (`shadowFollow`), shadow maps are capped
(1024 and no point-light shadows in `preview`), scenes are disposed between shots (geometries, materials,
non-cached textures).

## Director — `engine/web/src/director/index.js`

`frameShot(ctx, {framing, angle, move, subject, target, set, actors, duration, fov, binoculars, seed, camera, ...}) → {update(t), info}`

Measured on the reference reel: subjects centred, **eyes at ≈ 40 % from the top**, camera a hair below the eye
line (verticals stay vertical), slow eased moves. Character framings are defined by the visible frame height at the
subject in character heights `H` (`character.height`), the eye position and the camera elevation; the distance is
`frameH·H / (2·tan(fov/2))`, then the camera is aimed so the eyes land exactly at `eyeY` (uses `anchors()`).

Values fitted to `docs/02-style-bible.md` (normal vertical FOV 50–60°, binoculars 20–30°, single subjects centred,
eyes at 35–42 %, eye-level camera). `H` = `character.height` (adult 5.2, kid ≈ 4.3).

| framing | composition (frame height at subject · eyes · camera elevation · fov) |
|---|---|
| `extreme_wide` | `cameraHints.extreme_wide` (else `wide`/`establishing` pulled back); character subject w/o hint: 10 H · 60 % · +8° |
| `wide` | 4.5 H (characters at 15–30 % of frame height) · 55 % · +4° · 55° (no subject → `cameraHints.wide`) |
| `establishing` / `aerial` | `set.cameraHints` (aerial derived from establishing if missing; fallback from marks) |
| `medium` | 2.0 H, full body / knees-up, head top ≈ 34 % · 40 % · −3° · 55° |
| `medium_close` | 1.3 H, waist-up · 40 % · 52° |
| `close_up` | 0.9 H, head + shoulders (head ≈ 30–40 % of width) · 40 % · 50° |
| `extreme_close_up` | 0.5 H, face · 44 % |
| `over_shoulder` | 1.7 H behind the subject, over the right shoulder (`camera.side`), raised; solved so the head sits in the lower third on its side and the target at 40 % |
| `pov` | camera at the subject's eyes looking at `target` (subject hidden). Binoculars: FOV computed so a target actor is framed medium-close inside the mask band (≤ 27°; steps back along the sight line if the target is too close) |
| `two_shot` | subject + `target` actor (else nearest actor), camera perpendicular to their line, 1.9 H and wide enough for both |
| `insert` | the held prop's bounding box (found by diffing the character subtree around `setProp`), else right hand / hands midpoint; use a presenting pose (`carry`, `hold_sign`) |
| `low_angle` / `high_angle` | 2.0 H, camera 24° below / 30° above the eye line |
| `back` | behind the subject (seen from the back), 2.0 H, +8° |

`angle`: `eye` (default), `low`, `high`, `top`, `worm` or a number (elevation°) for any character framing.
Binocular shots: `frameH /= 0.29` and eyes mapped into the band y ∈ [0.28, 0.57] (the mask's centre column), default FOV 25°.

Collision rules: the line pivot → camera is ray-cast against the set (meshes; water sheets, sky, transparent and
`userData.noCollide`/`cameraIgnore` meshes ignored). If blocked, azimuths ±14°, ±28°, ±45°, ±70° are tried; if all
are blocked the camera dollies in front of the obstacle and widens the FOV to keep the framing. The camera is kept
0.45 above the floor / below ceilings and above `waterLevel + 0.35` (unless `underwater`).
A deterministic ±7° azimuth variation is added to character framings (seeded per shot).

Occlusion is tested with rays from several body points (eyes, chest, ±shoulder width) and, for walking subjects,
along the walk path (moving the camera too for `follow`).

Moves — measured on the reference (style bible §5): **every shot has a linear centred zoom 1.00 → 1.05** (FOV ramp;
binocular shots 1.07). All moves are linear and symmetric around mid-shot, so `t = duration/2` is the composed frame:
`static` = base zoom only; `push_in` = dolly, total apparent scale 1.2 (replaces the base zoom; zoom for `pov`);
`pull_out` = 1/1.11; `pan_left`/`pan_right` = 15 % of the frame width (+ base zoom); `tilt_up`/`tilt_down` 4°;
`orbit` 8° around the pivot; `drift` = lateral truck of 10 % of frame width (no re-aim); `follow` = camera translates
with the (walking) subject; `shake` = handheld noise ≈ 0.5°. Combine with `+` (`"pan_left+shake"`). Binocular shots
always add a slow wobble (≈1 % of the FOV). `moveAmount` scales intensities; `shot.zoom` (or option `baseZoom`)
overrides the base zoom (0 disables it — **post must not add its own zoom on top**). Aliases (`ms`, `cu`, `ots`,
`dolly_in`, …) are accepted; unknown values fall back with a warning.

Lighting help: for character framings the runtime adds a soft camera-side "face fill" point light whose range ≈ the
subject distance (stronger at night/dusk/interiors) so faces are always readable, like the reference. `shot.faceFill`
(or option `faceFill`) scales it, 0 disables it.

## Tools

```bash
node engine/tools/preview.js --episode e.json --shot 012 --t 0,0.5 --out x.png      # stills of one shot (same seed as render)
     [--framing close_up --move push_in --fov 40 --angle low]                          # quick director overrides
node engine/tools/preview.js --spec scene.json --out x.png [--w 360 --h 640]          # free-form resolvedShot
node engine/tools/storyboard.js --episode e.json [--timeline t.json] --out sheet.jpg  # one still per shot (mid-shot)
     [--only 001-020] [--at 0.5] [--cols 6] [--tile 240] [--w 360 --h 640] [--workers 2] [--no-mask] [--stills dir] [--verbose]
node engine/tools/storyboard.js --matrix [--set lake_dock] [--time day] --out framings.jpg   # all 15 framings
node engine/tools/bench.js --episode e.json --shot 004 [--frames 30] [--w 720 --h 1280] [--no-shadows]
```
The storyboard labels each tile with id, framing, move, the `say` text, set/time and the number of runtime
warnings (⚠n); binocular shots get the mask. Use `--verbose` to print each shot's camera info and warnings.

## Test episode

`episodes/_test/episode.json` (12 shots, fake `timeline.json`, 489 frames): establishing+push_in, over_shoulder+drift,
binocular pov, medium+pan_right with sign, two_shot+pan_left, wide+follow with a running walker and a waving crowd,
close_up+tilt_up (interior, night), insert+tilt_down (stopwatch, kitchen), low_angle+orbit (snow), aerial+pull_out,
back+static (bedroom, night), medium_close+shake with wading actors/crowd (depth). `extreme_wide`,
`extreme_close_up` and `high_angle` are covered by `storyboard.js --matrix`.
QA images: `docs/img/engine_test_storyboard.jpg` (test episode, mid-shot stills) and `docs/img/engine_framings.jpg` (framing matrix).

## Performance (4 shared cores, SwiftShader)

Measured on the `_test` episode with the real characters + world modules while other agents were rendering
(load average ≈ 11 on 4 cores): full render 489 frames in 4 min 34 s with 2 workers, ≈ 1.1 s/frame per worker
(range 0.56 s aerial … 1.75 s street two-shot). `bench.js` on shot 004: 745 ms/frame final (shadows), 262 ms/frame
with `--quality preview --no-shadows`; ≈ 90 draw calls / 32 k triangles. On an idle machine the stub scene ran
≈ 150–300 ms/frame. Shadow mapping dominates: use `--quality preview` or `--no-shadows` for drafts.
Storyboards render at 360×640: 12 shots in ≈ 10–15 s.
