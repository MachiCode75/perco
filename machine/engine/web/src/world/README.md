# World module (`engine/web/src/world/`)

Sets (locations), a placeable props library, sky / time-of-day / weather, water and underwater —
the Roblox-style lakeside Victorian town of the reference reel. Contract: `ARCHITECTURE.md` §4.

```js
import { SETS, PROPS, createSet, createProp, applyEnvironment } from './src/world/index.js';
const set = createSet(ctx, 'lake_dock', { seed: 1 });   // SetInstance (cached on ctx, last 3 kept)
ctx.scene.add(set.group);
applyEnvironment(ctx, { time: 'night', weather: 'snow', interior: set.interior });
// per frame: set.update(t, camera)   ← also drives sky, particles, water, underwater fog
```

Previews: `docs/img/world_<set>.jpg` (one per set) and `docs/img/world_times.jpg`
(lake_dock at day / golden / dusk / night / snow).

## Files

| File | Content |
|---|---|
| `index.js` | public API (SETS, PROPS, createSet, createProp, applyEnvironment, TIMES, WEATHERS) |
| `core.js` | seeded RNG, colour cache, unit geometry templates, **Builder** (merging) |
| `textures.js` | procedural CanvasTextures, cached in `ctx.textures` as `world:<key>` |
| `materials.js` | shared material registry (`ctx.worldMats`) + snow/wet shader patch |
| `house.js` | parametric Victorian house + church |
| `props.js` | all other props (`P.<id>(builder, opts)`) |
| `sets.js` | town layout generator + the 15 set compositions |
| `environment.js` | sky shader, lights, fog, exposure, night lamps, snow/rain, underwater switch |
| `water.js` | lake surface shader, ripple rings around waders |
| `props2.js` | v2 props (ranch house, brownstone, power pole, treehouse, hospital, statue, plaque, …) |
| `sets2.js` | v2 sets (suburban_street … rooftops_sky) + `card` |
| `cards.js` | text cards: canvas drawing of the 10 card styles, auto-fit text, crayon drawings |
| `fonts/` | vendored OFL fonts (Patrick Hand = kid handwriting, Permanent Marker), see `fonts/LICENSE.txt` |

## Conventions

* 1 unit = 1 stud, Y up, ground `y = 0`. Props: origin at base centre, front = **+Z**.
* Every set: main action near the origin, main camera side = **+Z**, background toward **−Z**.
* `marks.*.yaw` = direction an actor on that mark faces when `facing: "camera"` (radians; 0 = +Z).
* Marks `A, B, C, D` are 2.5–4 units apart with a clear background. `crowd` is an array of ≥ 30
  slots, ordered nearest-to-A first, with slots on the camera side of the actors moved to the end,
  so `crowd.count: 6` fills the background around the action. Other arrays in `marks`
  (`far`, `shore`, `beach`, `seats`) are extra crowd areas (`crowd.area`).
* `cameraHints` (`{pos, target, fov}`, fov = vertical degrees) are composed for **9:16**.
  Every set has `establishing`, `aerial`, `wide`, plus set-specific extras.
* Sets are deterministic per `(id, opts.seed)` and **do not consume `ctx.rng`**, so a location looks
  identical in every shot of an episode (house colours do not change between cuts).
  `createProp` uses `opts.seed` if given, else `ctx.rng`.
* Lake sets: `waterLevel = -1.5`; dock decks and lawns are at `y = 0`.
  `update(t, camera)` animates the water and switches to the underwater look (teal fog, no sky)
  when `camera.position.y < waterLevel`. Actors lowered by `depth` show through the semi-transparent
  water with a blue tint, and get animated ripple rings at the surface.

## Sets

| Set | What | Extra marks | POIs | Extra hints |
|---|---|---|---|---|
| `lake_dock` | wooden dock (T-head with benches, rails, lifebuoy) on the near shore; lawn, lamp posts, road with crosswalk, row of Victorian houses at −Z; far shore (houses, church, gazebo, second dock) 120 units across the lake at +Z; hills | `E`, `bench1/2` (sit, facing lake), `shore1/2`, `road`; arrays `far` (people on the far dock/shore facing back), `shore` | lake, across, far_dock, dock, dock_end, shore, road, house, door, window, church, water, bench, lifebuoy | `across` (from the dock across the lake), `reverse`, `low` |
| `lake_far_shore` | same town (other seed/church/gazebo placement); hints look from across the water | as lake_dock | + `viewer` (where the watcher stands across the lake) | `binoculars` (telephoto fov 8 from across the lake), `across` |
| `lake_aerial` | the lake town rotated so the lake runs along Z (look down its length, like the reel's aerial) | as lake_dock (rotated) | as lake_dock | `top` |
| `street` | lakeside street: actors on the house-side sidewalk, houses behind, road + crosswalk in front, lake-side lawn/lake behind the camera; church down the street | `crossing`, `lake_side`; `crowd` along both sidewalks | road, crosswalk, house, door, church, lake, across, dock | `along` (down the street), `from_house` |
| `house_front` | one light-blue house with porch, red door, flowerbeds, path, mailbox; neighbours; road at +Z | `porch` (on the porch, y=1.3), `steps`, `sidewalk` | house, door, porch, window, mailbox, road, garden | `porch` |
| `church_front` | white church with steeple, steps, lamp posts, benches, flowerbeds | `steps` | church, door, steeple, road, bench | `low` (looking up at the steeple) |
| `park` | lawn, white gazebo, paths, benches, picnic tables, trees | `gazebo`, `bench1/2` | gazebo, path, bench, trees, lamp | |
| `forest_edge` | meadow, rail fence, dirt path into a pine/round-tree forest, rocks, sign | `path` | forest, path, sign, trees | |
| `road_night` | road running away (−Z) between porch houses and lamp posts (best with `time: night`/`dusk`) | `sidewalk` | road, horizon, house, lamp, door | `sidewalk` |
| `shore_water` | sandy beach sloping into the lake, houses behind; marks **in the water** | `A–D` stand at thigh depth with `depth: 0` (`depth` adds: 1.5 ≈ waist, 3 ≈ chin); `deep`; dry `beach1/2`; arrays `crowd` (in water), `beach` (dry) | lake, across, shore, house, road | `low` (camera just above the water) |
| `underwater` | lake bed (y=-14), rocks, seaweed, dock posts, surface at y=0 seen from below | `A–D` on the bed, `surface` | surface, bed, dock, shore | `up` (looking up at the surface) |
| `kitchen` | dark-teal cabinets, counters, stove, fridge, wood table with chairs & food, pendant lamps, windows with garden view | `seat1/2` (chairs), `stove` | table, counter, stove, fridge, window, door, lamp | `table` |
| `living_room` | wood-panelled walls, olive back wall, red-brick fireplace (flickering fire light), painting, red & green armchairs, sofa, rug, bookshelf, TV, curtained window | `armchair`, `sofa`, `fire` | fireplace, armchair, sofa, tv, window, picture, table | `fireplace` |
| `bedroom` | upstairs room, big window on the back wall looking across the lake at the town (lit windows at night), bed, desk lamp | `bed`, `desk`; `A` is at the window | window, across, bed, desk, door, lamp | `window` (over the shoulder out of the window) |
| `classroom` | chalkboard, teacher desk, 12 student desks facing −Z, windows, clock | `teacher`; array `seats` (12 desk chairs, yaw π = facing the board) | board, desk, window, students, door | `students` (from the board) |

### v2 sets (multi-reference, `docs/05-multi-reference.md`)

Previews: `docs/img/world_<set>.jpg`, cards: `docs/img/world_cards.jpg`.

| Set | What | Extra marks | POIs | Extra hints |
|---|---|---|---|---|
| `suburban_street` | ref5 desert suburb: single-storey stucco/brick ranch houses with tile hip roofs, garages, driveways, dry lawns, wooden power poles + wires, wide plain road (camera side), dusty sky (`set.env`) | `road`, `driveway` | house, door, garage, road, pole, sky, across | `street` (along the road) |
| `forest_road` | ref2: two-lane road running away (−Z) through dense tall pines, guard rail, curve/speed signs, one lamp; great at night/rain. `opts.sign` = text of a roadside wooden sign | `shoulder` | road, forest, sign, rail, horizon | `shoulder` |
| `hospital_room` | ref2 ending: hospital bed, heart monitor (72), IV pole, privacy curtain, window with blinds, chair, flowers | `bed` (on the mattress, y=3.1), `bedside`, `chair` | bed, patient, monitor, window, door, curtain | `monitor` (screen close-up), `patient` |
| `warehouse` | ref5: big corrugated shed, roller door half open (`opts.open` 0–1), black sign with yellow letters (`opts.sign`, default TOWN WAREHOUSE), crates, pallets, bins, poles | `door`, `inside` | door, sign, crates, inside, lamp | `sign` |
| `backyard` | ref3: lawn, privacy fence, swing set, treehouse in a big tree (ladder), neighbours over the fence; house back + deck behind the camera | `treehouse` (on the platform, y=11.3), `swing`, `ladder`, `deck` | treehouse, swing, fence, house, back_door, tree | `house` (reverse), `treehouse` |
| `city_street` | ref6: brick brownstone rows with stoops along a street running away (−Z), street lamps, trees, parked cars, skyline at the vanishing point (towers light up at night) | `sidewalk`, `stoop` (top step, y=5) | skyline, road, stoop, door, lamp, buildings | `stoop` |
| `town_square` | ref6: cobbled plaza, statue (`opts.statue` 'head'\|'figure') on a granite plinth with bronze plaque (`opts.title`, `opts.text`), benches, lamps, civic building with portico/dome, brownstones, skyline | `plaque` (in front of the plaque, facing it), `statue_top`; `crowd` = rings around the statue **facing it**, `audience` = rows facing camera | statue, plaque, hall, benches, lamp, square | `plaque` (close), `statue` (low angle) |
| `rooftops_sky` | ref3/ref5: low camera looking up over the roofs, lots of sky; place a giant behind the row or a face in the sky | `giant` (ground behind the houses, for a `scale` 6–8 creature), `sky` (y=58, for `sky_face`), `roof` (on a ridge) | sky, giant, rooftops, moon, house, road | `up` (steep look up), `over` (over the roofs) |
| `card` | full-frame text card, see below | `A–D`/`crowd` exist but are off-frame | card, text | `close`, `angled` |

### Text cards — `set: "card"`, `setOptions: {style, text, title, drawing, …}`

The establishing/wide/aerial hint is the same straight-on 9:16 framing (camera `[0,8,30]`, fov 30 → a
9 × 16 window); the card object fills it, with a little background (wood table, wall, plinth, road)
at the edges so slow push-ins/pull-outs stay plausible. Text is auto-sized and wrapped (`\n` forces a
line break). Each set instance is cached per options; card textures are disposed on eviction.

| style | look | options |
|---|---|---|
| `notebook` | lined paper (red margin) on a table, kid handwriting (Patrick Hand) with per-letter jitter | `text`, `title` (underlined), `drawing`: `moon` (smiley moon with pins, ref3) \| `sun` \| `face` \| `house` \| `eye` \| `tree` \| `family` \| `none` |
| `note` | yellow sticky/paper note with tape on a table | `text`, `title` (marker), `drawing`, `color`, `ink` |
| `sign_wood` | dark wooden roadside sign on posts, carved serif letters, forest + road behind | `title` (default WELCOME TO), `text` (default MAPLE HOLLOW), `subtitle`, `color`, `ink` |
| `sign_metal` | green highway sign with white border/letters on poles | `title`, `text`, `subtitle` (e.g. POP. 412), `color` (board), `ink` |
| `plaque` | bronze plaque with engraved serif text on a granite plinth | `title` (ELIAS HART), `text` (THE ONE WHO NEVER SLEPT) |
| `phone` | phone in hand-size on a table, message bubbles | `title` (contact), `text`: one message per line, lines starting with `>` are sent (blue, right), `time` |
| `newspaper` | newsprint front page: masthead, headline, photo, columns | `title` (masthead), `text` (headline), `drawing` (photo), `date` |
| `monitor` | heart monitor: black screen, green ECG line, ♥ + number (ref2) | `text` (number, default 72), `title` (label, default HR) |
| `calendar` | wall calendar: month header, days crossed out in red up to the circled day | `title` (month), `text` (day(s) to circle, e.g. "13" or "13,14"), `note`, `startDay` (0–6), `days`, `cross:false` |
| `clock` | red 7-segment alarm clock in a dark room (ref4 "3:00"), or an analog face | `text` (e.g. "3:00"), `title` (AM/PM), `color`, `analog:true` |

Sign/plaque cards are outdoor (`interior: false`, environment sky); the others are interior-lit
(`interior: true`) with a soft lamp gradient, so `time: night` makes them darker/moodier.

Interiors: `interior: true`, `waterLevel: null`. Walls/ceiling do not cast shadows so the window
light (directional, `set.windowLight`) enters the room; practical lamps become point lights.

`opts` for `createSet`: `{ seed }` (variation of the generated town; default 1).

## Props (`PROPS`, 81)

`createProp(ctx, id, opts)` → merged `THREE.Group` (`userData.info` holds layout info, e.g. the
house door position). Unknown ids return an empty group (warning, never throws).

* **Buildings**: `house_victorian` (`color, trim, door, shutter, roof, floors 1–3, porch (bool),
  style 'front'|'side'|'tower', width, depth, doorX, chimney, seed`; returns `{w, d, frontZ, door, height}`),
  `church` (`color, roof, door`).
* **Nature**: `tree_pine (height, color, wide)`, `tree_round (height, color)`, `bush (size, blobs,
  flowers, flowerColor)`, `hedge`, `flowerbed (width, depth, flowerColor)`, `planter`, `potted_plant`,
  `rock (size)`, `reeds`, `seaweed`, `hill (radius, height)`.
* **Street / lake**: `bench (length)`, `picnic_table`, `lamp_post (height)`, `lifebuoy (post)`,
  `mailbox (color)`, `fence (length, height)` (white picket), `rail_fence` (wooden rail),
  `dock_section (length, width, depth, rails 'left'|'right'|true)` — deck top at y=0, posts go down,
  `pier_post`, `boat`, `car (color)`, `gazebo (radius)`, `street_sign`, `hydrant`, `trash_can`,
  `flower_arch` (wedding arch), `road_segment (length, width)` (along X), `crosswalk (width, length)`,
  `sidewalk (length, width)`.
* **Interior**: `table (width, depth, height, items)`, `chair`, `sofa (length, color)`, `armchair (color)`,
  `fireplace (width, height)` (against a wall at z=0), `bed (color)`, `nightstand`,
  `window (width, height, y, curtains, glass)` (frame for a wall opening), `door (width, height, color)`,
  `bookshelf`, `kitchen_counter (length, sink, upper)`, `fridge`, `stove`, `rug`,
  `picture_frame (variant 0–3, y)`, `tv`, `lamp (kind 'floor'|'table')`, `pendant_lamp (drop)`,
  `ceiling_light`, `cabinet`, `desk` (school desk + chair), `chalkboard`, `clock`, `curtain`, `stairs`.
* **Signs**: `sign_board ({text, width, height, posts, colors, bg})` — marker-style text texture;
  `shop_sign ({text, width, height, y, bg, ink})` — bold block letters (e.g. TOWN WAREHOUSE);
  `road_sign ({kind: 'curve'|'stop'|'speed', text})`; `plaque ({title, text, width, height, y})`.
* **v2 buildings**: `house_ranch (color, roof, garage, boarded, door)` — single-storey stucco/brick,
  tile hip roof; `brownstone (floors 3–4, color, flip, stoopX)` — returns `stoop`/`door` positions;
  `civic_building`; `tower (width, depth, height, spire)` — skyline block with night-lit windows.
* **v2 street/yard**: `power_pole (height, transformer)` (+ `wire()` helper in props2.js),
  `garbage_can` (wheelie bin), `privacy_fence (length, height)`, `swing_set`/`swing`, `treehouse (height)`,
  `crate (size)`, `pallet`, `roller_door (width, height, open 0–1)`, `boarded_window (width, height, y)`,
  `guard_rail (length)`, `statue (kind 'head'|'figure', title, text)`.
* **v2 hospital**: `hospital_bed`, `heart_monitor (text)`, `iv_pole`, `curtain_track (length, h)`.

Composing a new place: create a `Builder` (`core.js`) and call `P.<id>(b, opts)` inside
`b.push(x, y, z, yaw) … b.pop()` — see `sets.js` (`lot()`, `shoreSide()`, `room()` helpers).

## Environment

`applyEnvironment(ctx, { time, weather, interior })`
* `time`: `day` (blue gradient sky, sun 45°), `golden` (low warm sun, peach sky), `dusk`
  (orange→purple sky, lamps and windows on), `night` (navy sky + stars, moonlight, warm window glow,
  lamp-post point lights near the action + halos and light pools on the ground).
* `weather`: `clear`, `overcast` (grey sky, soft light), `snow` (white cover on every up-facing
  surface via a shared shader uniform + falling flakes), `rain` (darker, wet/glossy, streaks),
  `fog` (dense fog).
* Lights: hemisphere + one directional sun with PCF-soft shadows fitted to `set.shadow`
  (2048 map, 1024 when `ctx.quality === 'preview'`). Fog colour = horizon haze.
  Exposure is set per time (ACES tone mapping comes from the runtime).
* Interiors: warm hemisphere + window light; practical lamps/fireplace become point lights
  (fire flickers); at night the room is lamp-lit and the outside is dark with lit windows.

## Performance notes (SwiftShader)

* The Builder merges all static geometry by **(material, chunk, 64-unit cell)** with vertex colours,
  so one material serves every colour; cells let three.js frustum-cull off-screen parts of the town
  in the main and shadow passes (lake_dock: ~100 draw calls, ~35–40k triangles visible).
* Outdoors only ground-like surfaces receive shadows (PCF-soft costs ~25 taps per fragment).
  Rough materials use Lambert; textures use bilinear-mipmap filtering, anisotropy 1.
* Opaque draw order is front-to-back-ish (props/houses, then ground, far chunk, hills, lake bed,
  sky last) so early-z rejects hidden pixels.
* Measured through the real runtime (`engine/tools/test_world/perf.js`, 720×1280, 10 characters,
  JPEG encode included, low machine load): lake_dock **~270 ms (establishing) / ~350 ms (wide)** per frame;
  v2: town_square ~190 ms, city_street ~285–315 ms, forest_road ~155–195 ms, suburban_street ~180–190 ms.
  The first frame of a new shot also compiles shaders (~1–1.5 s); built sets are cached on ctx.

## Testing tools (`engine/tools/test_world/`)

* `render.js --set a,b --time day,night --weather snow --views establishing,wide --actors A,B@1.5 --crowd 8`
  free-camera renders through `index.html`/`page.js` (`--cam x,y,z:tx,ty,tz:fov` for a custom camera).
* `perf.js` real-runtime frame timing; `cpuprof.js` load-independent CPU-time profile vs a
  calibration scene (`--ab noRecv,noWater,…` for A/B); `dump.js` lists marks/pois/hints of every set.
* `cards.js` renders every card style (`--only notebook,plaque`).
* Scene specs for `engine/tools/preview.js`: `engine/tools/test_scenes/world_*.json`.

`set.env` (optional, per set): sky/fog/light overrides per time of day applied by `applyEnvironment`
with clear/overcast weather (e.g. the dusty desert haze of `suburban_street`).
