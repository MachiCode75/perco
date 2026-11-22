# World module (`engine/web/src/world/`)

Sets (locations), a placeable props library, sky / time-of-day / weather, water and underwater —
the Roblox-style lakeside Victorian town of the reference reel. Contract: `ARCHITECTURE.md` §4.

```js
import { SETS, PROPS, createSet, createProp, applyEnvironment } from './src/world/index.js';
const set = createSet(ctx, 'lake_dock', { seed: 1 });   // SetInstance (cached on ctx, last 3 kept)
ctx.scene.add(set.group);
applyEnvironment(ctx, { time: 'night', weather: 'snow', interior: set.interior, power: 'on' });
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
| `props3.js` | v3 story props (cookie, fur_tuft, giant_footprint, note_paper, giant_hand, window_face, glowing_eyes, candle …) + kids' room decor atlases |
| `sets3.js` | v3 sets: `bedroom` (variants + window rig), `library`, `shop_front` |
| `windows.js` | interior window rig: casing, sashes (open/locked), deep sill + items, 1–3 stacked curtain layers (animated), boards, moonlight pool |
| `home.js` | "our house" identity (`opts.home`) shared by house_front / suburban_street / rooftops_sky |
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
| `house_front` | one light-blue house with porch, red door, flowerbeds, path, mailbox; neighbours; road at +Z. `opts.home` (see v3) | `porch` (on the porch, y=1.3), `steps`, `sidewalk`, `by_home` (road, facing the house) | house, door, porch, window, mailbox, road, garden, home, home_window, home_door, home_roof | `porch`, `door`, `home_window`, `roof` |
| `church_front` | white church with steeple, steps, lamp posts, benches, flowerbeds | `steps` | church, door, steeple, road, bench | `low` (looking up at the steeple) |
| `park` | lawn, white gazebo, paths, benches, picnic tables, trees | `gazebo`, `bench1/2` | gazebo, path, bench, trees, lamp | |
| `forest_edge` | meadow, rail fence, dirt path into a pine/round-tree forest, rocks, sign | `path` | forest, path, sign, trees | |
| `road_night` | road running away (−Z) between porch houses and lamp posts (best with `time: night`/`dusk`) | `sidewalk` | road, horizon, house, lamp, door | `sidewalk` |
| `shore_water` | sandy beach sloping into the lake, houses behind; marks **in the water** | `A–D` stand at thigh depth with `depth: 0` (`depth` adds: 1.5 ≈ waist, 3 ≈ chin); `deep`; dry `beach1/2`; arrays `crowd` (in water), `beach` (dry) | lake, across, shore, house, road | `low` (camera just above the water) |
| `underwater` | lake bed (y=-14), rocks, seaweed, dock posts, surface at y=0 seen from below | `A–D` on the bed, `surface` | surface, bed, dock, shore | `up` (looking up at the surface) |
| `kitchen` | dark-teal cabinets, counters, stove, fridge, wood table with chairs & food, pendant lamps, windows with garden view. `opts.wall`; window-rig opts apply to the side window | `seat1/2` (chairs), `stove` | table, counter, stove, fridge, window, door, lamp, side_window, sill, outside | `table` |
| `living_room` | wood-panelled walls, olive back wall (`opts.wall`), red-brick fireplace (flickering fire light), painting, red & green armchairs, sofa, rug, bookshelf, TV, curtained window (window-rig opts) | `armchair`, `sofa`, `fire` | fireplace, armchair, sofa, tv, window, picture, table, sill, outside, curtains | `fireplace` |
| `bedroom` | upstairs room, big window (window rig) on the back wall looking across the lake at the town (lit windows at night), bed, desk lamp. `opts.variant` `boy`\|`girl`\|`parents`, `opts.wall`, window-rig opts (v3) | `bed`, `desk`; `A` is at the window | window, across, bed, desk, door, lamp, sill, outside, curtains, wall_art | `window` (over the shoulder out of the window), `curtains`, `sill`, `outside` |
| `classroom` | chalkboard, teacher desk, 12 student desks facing −Z, windows, clock | `teacher`; array `seats` (12 desk chairs, yaw π = facing the board) | board, desk, window, students, door | `students` (from the board) |

### v2 sets (multi-reference, `docs/05-multi-reference.md`)

Previews: `docs/img/world_<set>.jpg`, cards: `docs/img/world_cards.jpg`.

| Set | What | Extra marks | POIs | Extra hints |
|---|---|---|---|---|
| `suburban_street` | ref5 desert suburb: single-storey stucco/brick ranch houses with tile hip roofs, garages, driveways, dry lawns, wooden power poles (34 tall, one just right of our house so est/wide views show it) + wires, wide plain road (camera side), dusty sky (`set.env`); our house = the one at x=−4 (`opts.home`); forest edge (dead end, barrier, dark pines) at the −X end of the street; `opts.footprints: true` = a giant footprint on every front lawn | `road`, `driveway`, `by_pole` (giant beside the pole at its depth), `by_home` (road, facing our house), `neighbor1` (the Millers, x=36) / `neighbor2` (x=−44) (on the road facing the house), `guard` (road near the trees, facing them) | house, door, garage, road, pole, sky, across, home, home_window, home_door, home_roof, pole_top (crossarm — put `fur_tuft` there), trees, street_end, footprint (lawn of our house), neighbor1, neighbor1_window, neighbor2, neighbor2_window | `street` (along the road), `to_forest` (from our house down the street to the trees), `pole_top` (low look up at the crossarm), `home` |
| `forest_road` | ref2: two-lane road running away (−Z) through dense tall pines, guard rail, curve/speed signs, one lamp; great at night/rain. `opts.sign` = text of a roadside wooden sign | `shoulder` | road, forest, sign, rail, horizon | `shoulder` |
| `hospital_room` | ref2 ending: hospital bed, heart monitor (72), IV pole, privacy curtain, window with blinds, chair, flowers | `bed` (on the mattress, y=3.1), `bedside`, `chair` | bed, patient, monitor, window, door, curtain | `monitor` (screen close-up), `patient` |
| `warehouse` | ref5: big corrugated shed, roller door half open (`opts.open` 0–1), black sign with yellow letters (`opts.sign`, default TOWN WAREHOUSE), crates, pallets, bins, poles | `door`, `inside` | door, sign, crates, inside, lamp | `sign` |
| `backyard` | ref3: lawn, privacy fence, swing set, treehouse in a big tree (ladder), neighbours over the fence; house back + deck behind the camera | `treehouse` (on the platform, y=11.3), `swing`, `ladder`, `deck` | treehouse, swing, fence, house, back_door, tree | `house` (reverse), `treehouse` |
| `city_street` | ref6: brick brownstone rows with stoops along a street running away (−Z), street lamps, trees, parked cars, skyline at the vanishing point (towers light up at night) | `sidewalk`, `stoop` (top step, y=5) | skyline, road, stoop, door, lamp, buildings | `stoop` |
| `town_square` | ref6: cobbled plaza, statue (`opts.statue` 'head'\|'figure') on a granite plinth with bronze plaque (`opts.title`, `opts.text`), benches, lamps, civic building with portico/dome, brownstones, skyline | `plaque` (in front of the plaque, facing it), `statue_top`; `crowd` = rings around the statue **facing it**, `audience` = rows facing camera | statue, plaque, hall, benches, lamp, square | `plaque` (close), `statue` (low angle) |
| `rooftops_sky` | ref3/ref5: low camera looking up over the roofs, lots of sky, power poles + wires (`opts.poles: false` removes them); our house = central front-row house (`opts.home`); place a giant behind the row or a face in the sky | `giant` (ground in the gap between/behind houses, x=−22 z=−52; needs a creature taller than ~32 to show over the roofs), `over_home` (right behind our house — towers over it), `by_home`, `sky` (y=58, for `sky_face`), `roof` (on a ridge) | sky, giant, rooftops, moon, house, road, home, home_window, home_door, home_roof, pole_top, over_home | `up` (steep look up), `over` (over the roofs), `home`, `giant_low` (low view from the road: houses in front, giant between them) |
| `card` | full-frame text card, see below | `A–D`/`crowd` exist but are off-frame | card, text | `close`, `angled` |
| `library` | (interior) back-wall bookshelves, double-sided shelf rows, 2 reading tables with green banker lamps, librarian L-desk (bell, books, lamp), newspaper rack (`opts.newspaper {title,text,date}` = front paper), globe, QUIET PLEASE sign, tall windows, `opts.wall` | `table` (reading seat), `librarian` (behind the desk), `shelves` (aisle), `newspapers` (at the rack) | shelves, table, newspapers, desk, window, door, lamp, sign | `newspapers`, `table`, `shelves`, `desk` |
| `shop_front` | small-town hardware store: brick facade, 2-line sign `opts.sign` (default PIKE'S HARDWARE; `signColor`, `signInk`) lit by gooseneck lamps at night, striped awning, display window `opts.display` `curtains` (hanging + folded curtains for sale, price card `opts.price`, default "3 FOR $20") \| `tools` (default) \| `none`, door with OPEN sign (`opts.open:false` → CLOSED); BAKERY / DINER neighbours, street, cars | `door`, `window` (facing the display), `road` | sign, window, display, door, awning, road, bakery, diner, lamp | `sign`, `window`, `street` |

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

### v3 — showing exactly what the narration says

**Power cut** — `applyEnvironment(ctx, {…, power: 'off'})` or set `opts.power: 'off'`: window glass (`win`, skyline `tower`) not
emissive, lamp heads dark, no lamp-post / porch point lights, halos or ground pools, interior lamps and TV off, fireplace out
(`opts.fire: true` keeps it), interiors at night/dusk get only cold moonlight (blue hemisphere + window light; people stay readable).
Shot props keep their own light (`candle`, `giant_hand` rim light).

**Our house** — `opts.home = {wall, roof, door, trim, shutter}` in `house_front`, `suburban_street`, `rooftops_sky` draws the same
2-storey Victorian (style side, 32×23, ridge y≈30.6, below the 34-tall poles) in exactly those colours; the neighbours stay identical
with or without it. Pois `home`, `home_window` (upstairs front window left of the door), `home_door` (door surface — tape a
`note_paper` there), `home_roof` always exist (without `opts.home` they point at the default central house).

**Window rig** (`bedroom`, `living_room`, `kitchen` side window) — set opts:
* `curtains`: `{layers 1–3, state 'open'|'closed'|'gap'|'layered', color, animate 'close'|'open'|null, gap (0.55), delay (0.1), duration (1.5), sheer, blackout}`
  (also a number = layers, a state string, a colour string, or `false`). Each layer hangs on its own rod at its own depth:
  sheer (cream, translucent, next to the glass) → main (`color`) → blackout (dark navy). `open` stacks are staggered so each layer
  peeks out; `layered` = sheer closed + main half open + blackout open (reads "3 curtains" in one frame); `gap` = closed with a crack
  in the middle ("1 inch"); `animate:'close'` closes them one after another (glass side first) over `duration` s via set.update(t);
  `animate:'open'` reverses. The window light and the moonlight pool on the floor follow the opening (the room darkens as they close).
* `windowOpen: true` (lower sash raised; a closed sash shows a brass latch), `boarded: true` (4 planks + a diagonal nailed across, curtains
  closed), `sill: ['cookie', {type: 'cookie_plate', x, z, yaw, opts}, …]` (any prop id, standing on the deep sill in front of the curtains).
* Pois: `window`, `sill` (top centre of the sill), `outside` (window centre, 2.1 outside the glass — put `giant_hand` / `window_face` there), `curtains`.
* `bedroom` `variant`: `boy` (blue walls, green wainscot, green bedspread, rocket / dino / GOAL! / race-car posters, soccer ball, toy box),
  `girl` (pink walls, lilac wainscot, pink bed, glow-in-the-dark star stickers on walls + ceiling, 4 crayon drawings taped up, teddy on
  the bed, lilac curtains), `parents` (beige, double burgundy bed, two nightstands + lamps, dresser with mirror, armchair). `wall` overrides the colour.

**Props v3** (`createProp` → `userData.update(t)` on animated ones, `userData.focus` = close-up point):

| id | what | opts |
|---|---|---|
| `cookie` | chocolate-chip cookie lying flat, Ø 0.64 | `size`, `chips`, `bitten` |
| `cookie_plate` | plate + 3 cookies | `size`, `milk: true` (glass of milk) |
| `fur_tuft` | clump of long dark strands hanging from the origin (snag point), ~2 long | `size` (1.25), `count`, `color`, `wind` — place at `poi:pole_top` |
| `giant_footprint` | deep muddy print, toes +Z, 9 × 4: rim, wet floor, 5 toes, claw gouges | `length`, `width`, `side`, `mud: false` — frame it `wide`/`high_angle` (`insert` is too close) |
| `footprint_trail` | prints alternating L/R along +Z | `count` (5), `spacing`, `length`, `mud` |
| `note_paper` | taped paper note (same look as the `note` card), origin = sheet centre, faces +Z | `text`, `title`, `color`, `ink`, `width`, `height`, `tilt` |
| `giant_hand` | huge furry hand + forearm (~6), palm toward +Z, pale claws, origin = hand centre (put at `poi:outside`) | `pose` `tap` (index finger taps the glass at `rate` 3 Hz) \| `open` \| `pinch`, `holding: 'cookie'` (with pinch), `fur`, `skin`, `reach` (1.8), `light: false` |
| `window_face` | the furry giant's face (dark fur + unlit white eyes and grin) filling a window from outside, origin = window centre | `face` (`teeth`/`creepy_grin`/`scream`/`hollow`), `size` (11), `fur` |
| `glowing_eyes` | pairs of glowing eyes in a volume facing +Z (instanced, additive), blinking | `count` (24), `spread` ([34,7,12] or a width), `color` ('#ffd84a', '#e8f4ff' …), `size` (0.6), `approach` (units/s toward +Z), `open: true` / `close: true` (one by one over `openTime` 1.2 / `closeTime` 1.5 s), `blink: false` |
| `candle` | dish + candle + flickering flame/halo + small warm point light | `height`, `intensity` (14), `distance` |
| `hammer_nails` | hammer + 5 nails lying flat | `yaw` |
| `plush` | teddy bear sitting | `size`, `color`, `bow` |
| `ball` | soccer ball | `size`, `color` |

Interiors: `interior: true`, `waterLevel: null`. Walls/ceiling do not cast shadows so the window
light (directional, `set.windowLight`) enters the room; practical lamps become point lights.

`opts` for `createSet`: `{ seed }` (variation of the generated town; default 1) + the per-set options above (`power`, `home`, `variant`,
`wall`, `curtains`, `windowOpen`, `boarded`, `sill`, `footprints`, `poles`, `sign`, `display`, `price`, `newspaper` …). Bad option values
never throw: they fall back to defaults (a builder that throws is rebuilt with `{}`).

## Props (`PROPS`, 94 — v3 props above)

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
  `road_sign ({kind: 'curve'|'stop'|'speed', text})`; `plaque ({title, text, width, height, y})`; `shop_sign` also takes `lines: 2` (or `\n` in the text).
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

`applyEnvironment(ctx, { time, weather, interior, power })` (`power: 'off'` = blackout, see v3)
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
