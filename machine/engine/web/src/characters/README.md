# Characters module (Roblox-classic R6)

`engine/web/src/characters/index.js` follows the contract in ARCHITECTURE.md §3. It builds blocky R6 characters:
legs 1×2×1, torso 2×2×1, arms 1×2×1, and a rounded head 1.26×1.2×1.2. Each character has a flat face decal,
classic shirt and pants painted on the blocks, chunky hair, accessories, held props, poses and in-place animation.

```js
import { FACES, POSES, HAIR_STYLES, SHIRT_PATTERNS, PROPS_HELD, randomSpec, createCharacter } from './src/characters/index.js';
const ch = createCharacter(ctx, spec);   // ctx = { THREE, scene, renderer, camera, rng, textures, quality }
scene.add(ch.root);                      // origin at the feet centre, facing +Z
ch.setPose('hold_sign'); ch.setFace('grin'); ch.setProp({ type: 'sign', text: 'HI ME!' });
ch.update(t);                            // call every frame (t = seconds since shot start)
ch.anchors();                            // { head, eyes, chest, hands, handL, handR, feet, top } world-space Vector3
```

`height` is 5.2 for adults and elders, and 4.26 for kids (kids are scaled by 0.82). The extras `ch.spec` (the
normalised spec), `ch.face`, `ch.pose` and `ch.joints` (body, hips, upper, neck, head, armL, armR, legL, legR)
are also exposed.

Unknown values never throw. They fall back to a default: face `smile`, pose `stand`, hair `short`, pattern `solid`,
pants style `pants`. Unknown props and accessories are ignored. Invalid colours fall back to defaults. Common
aliases are accepted too, for example `crying` becomes `cry`, `sitting` becomes `sit` and `afro` becomes `curly`.

## CharacterSpec

```json
{
  "name": "Toby",
  "build": "adult | kid | elder",
  "skin": "#f2c8a0",
  "hair": { "style": "spiky", "color": "#f6dc3c", "capColor": "#c8322d" },
  "shirt": { "pattern": "stripes_h", "colors": ["#f2c511", "#151515"],
             "sleeves": "long | short | none", "sleevePattern": "plaid", "sleeveColors": ["#f3ece4", "#e09a95"],
             "neck": "round | v | collar | hood | none", "logo": "dino | star | heart | smiley | none | <=4 letters", "logoColor": "#3fae49", "inner": "#fff" },
  "pants": { "style": "pants | shorts | skirt | none", "color": "#151515", "pattern": "solid | jeans | floral | stripes | plaid | stars | polka", "colors": ["#..", "#.."], "shoes": "#e9eef8" },
  "accessories": ["glasses", { "type": "tie", "color": "#c0262d" }],
  "face": "smile"
}
```
Every field is optional. The fields not listed in ARCHITECTURE §3 are optional extensions: `sleeves`,
`sleevePattern`, `sleeveColors`, `neck`, `logo`, `logoColor`, `inner`, `capColor`, `pants.pattern`,
`pants.colors`, `pants.shoes`, and the shirt patterns `vest` and `cardigan`.
`elder` keeps adult proportions, adds a slight stoop and animates a little slower. Colours are clamped so that
nothing is pure black (the darkest value is about `#151515`).

### Shirt patterns: meaning of `colors`
| pattern | colors | defaults |
|---|---|---|
| `solid` | [body] | short sleeves, round neck, pocket |
| `stripes_h` / `stripes_v` | [a, b] | long sleeves; the stripes wrap the torso and line up with the arms |
| `plaid` | [base, lines, thin lines?] | collar and buttons |
| `polka` | [base, dots] | |
| `argyle_vest` | [vest, diamonds, shirt] | white shirt sleeves and collar |
| `vest` | [vest, shirt] | plain sweater vest with V-neck and buttons (Grandpa) |
| `cardigan` | [cardigan, inner top] | open cardigan with pockets (Mom) |
| `suit` | [jacket, shirt, tie] | lapels, pocket square, white cuffs; the pants default to the jacket colour |
| `overalls` | [shirt, denim, shirt stripe?] | bib, straps and buttons; the legs are always denim |
| `hoodie` | [body, strings] | pocket, strings and a 3D hood |
| `dress` | [dress, waistband] | A-line skirt block; pants default to `none` and the legs are dress-coloured |
| `pajamas_stars` | [base, stars, piping] | the legs get the same star pattern |
| `tee_logo` | [a, b (stripes if ≠ a), trim] | chest logo (`logo`), coloured collar and cuffs (little brother) |

Mixed sleeves: set `sleevePattern` and/or `sleeveColors`. For example, Grandpa wears a green `vest` with
`sleevePattern: "plaid"` and `sleeveColors: ["#f3ece4", "#e09a95"]`.

### Hair styles
`spiky` (blonde Toby), `short`, `bowl`, `long`, `ponytail`, `bun`, `bald`, `cap` (short hair under a cap
coloured by `hair.capColor`), `messy`, `curly`. The `cap` accessory turns any style except `bald` into `cap`.

### Accessories
`glasses` (thick black rims), `sunglasses`, `tie` (3D), `mayor_chain` (gold chain with a red medallion), `cap`,
`bow`, `scarf`, `apron`, `beard`, `mustache`, and the v3 `sleep_mask` (see the end of this file). Facial hair uses the hair colour, or grey when the character is bald.
Any accessory can carry its own colour: `{ "type": "scarf", "color": "#2a6" }`.

## FACES
Decals on the front of the head, with thick black strokes:
`neutral, smile, happy (^^), grin (open white mouth), worried, sad, cry (> < with blue tears), scream (red open mouth),
angry (V brows), surprised, scared, sleep, smirk, talk, wink` and the v2 scary faces
`creepy_grin` (hollow eyes with white pin-pupils and a huge jagged grin, like the stretched Mom in ref3),
`wide_eyes`, `hollow` (black empty eyes), `teeth` (a wide grin full of teeth) and `blank` (no face). With `talk`, the mouth opens and closes
automatically in `update(t)`. `setFace()` swaps the decal instantly.

## POSES
`stand, idle, wave, walk, run, sit, binoculars, hold_sign, point, arms_up, hug, cry, shrug, look_down, lie, fall,
jump, talk, wade, carry`, plus the v2 poses `reach` (both arms out toward the camera), `loom` (leaning forward with the head
up) and `lean` (tilted sideways; takes `side: 'left'`), and the v3 action poses listed at the end of this file. The arms are rigid blocks that rotate at the shoulder, and the legs rotate at the hip.
`update(t)` adds breathing, sway, walk and run cycles (in place), waving, sobbing, the talk head-bob, jump hops and so on.
All of this is deterministic: the only random value is a per-character phase, drawn once from `ctx.rng` at creation.

`setPose(id, opts)` options:
- `side: 'left'` mirrors one-armed poses (`wave`, `point`, `talk`).
- `speed` and `amplitude` apply to `walk`, `run` and `wade`.
- `seat` is the seat height for `sit`. It defaults to 1.5; use 0 to sit on the ground. The legs stick straight out, R6 style.
- `face: 'down'` makes `lie` face-down. Otherwise the character lies on its back, with the feet at the origin and the head toward −Z.
- `fall` accepts `at` (start time, default 0), `duration` (default 0.65 s) and `direction` (`'forward'` or `'back'`). The character topples over and then lies still.
- `jump` accepts `period` (default 0.8 s) and `height` (default 1.3).

## PROPS_HELD (`setProp`)
`setProp({ type, text?, color? })`, or `setProp(null)` to remove the prop.
| type | how it is held |
|---|---|
| `binoculars` | at the eyes in the `binoculars` pose (black, blue lenses); otherwise in the right hand |
| `sign` | in front of the chest in `hold_sign` or `carry`; `text` is drawn in multicolour marker letters with a green underline (e.g. `"HI ME!"`, `"BYE ME"`). Otherwise it hangs at the side. |
| `stopwatch` | in the right hand, dial facing forward (silver, white dial, red hand) |
| `phone`, `cup`, `letter`, `book`, `bag` | in the right hand; `book` and `bag` go in front with `carry`; `color` is optional |
| `flashlight` | in the right hand with a visible beam and a SpotLight (`on: false` = off, `light: false` = beam only); see v3 |
| `umbrella` | in the right hand with the canopy over the head (`color`) |

Hand-held props follow the hand but stay upright and facing forward, so they read clearly on camera.

## Performance and caching
Textures, materials and geometries are cached in `ctx.textures` under keys that start with `chr:`. They are shared by
every character with the same spec and reused across shots on the same page. A character takes about 7–12 draw calls,
and every mesh casts and receives shadows. In the bench, 30 random characters at 720×1280 render in about
220–260 ms per frame with SwiftShader and PCF shadows, after a first frame of about 1.3 s while shaders and
textures upload. `quality: 'preview'` halves the texture resolution.

## Examples (the reference cast)
See `engine/tools/test_characters/cast.js`. It includes Toby (the bee kid), the little brother, Mom, Grandpa,
the Mayor, the bride, the groom, the old lady, the argyle man, the star pyjamas and the overalls.

## Testing
```
node engine/tools/test_characters/render.js --scene lineup|faces|poses|props|hair|patterns|crowd [--out x.jpg]
node engine/tools/test_characters/render.js --scene custom --config cfg.json [--t 0,0.5]
node engine/tools/preview.js --spec engine/tools/test_scenes/characters_sign.json --out x.png   # through the real runtime
```
Preview sheets: `docs/img/characters_lineup.jpg`, `docs/img/characters_faces.jpg` and `docs/img/characters_poses.jpg`.

## v2: modifiers and creatures (ARCHITECTURE v2)

### Modifiers (any CharacterSpec)
| field | effect |
|---|---|
| `scale` (number, default 1) | uniform size multiplier on top of the build (`kid` is 0.82). `height` and `anchors()` follow it. |
| `stretch` `{arms, legs, torso, neck}` | elongates the limbs, torso and neck for a creepy, too-tall version of a normal character. The defaults are 1, 1, 1 and 0; `neck` is an extra length in studs. A plain number such as `"stretch": 1.8` stretches the arms and legs and lengthens the torso and neck a little. |
| `eyes`: `normal`, `glow`, `hollow` or `many` | `glow` adds emissive eye discs with a halo, coloured by `glowColor` (default `#ffd84a`), that read in night scenes. `hollow` gives big black empty eyes, and `many` gives about 9 eyes all over the face. All of them work with any face id. |

```json
{ "build": "adult", "hair": {"style": "ponytail", "color": "#3b2416"}, "shirt": {"pattern": "cardigan"},
  "stretch": {"arms": 2.1, "legs": 1.9, "torso": 1.3, "neck": 0.55}, "face": "creepy_grin" }
{ "build": "kid", "eyes": "glow", "glowColor": "#ff3b3b", "face": "neutral", "scale": 1.0 }
```

### Creatures: `"creature": "<id>"` (exported `CREATURES`)
All the other spec fields still apply where they make sense: clothes for the humanoid creatures, plus `scale`, `face` and `eyes`.
| id | look | default size | poses |
|---|---|---|---|
| `furry_giant` | huge black shaggy fur creature, small head, tiny white eyes, wide white grid grin (ref5); optional `furColor` | `scale` 2.3, about 12 units tall (taller than a 2-storey house eave) | idle (gorilla sway), walk/run (lumbering), loom, reach, sit, lie, fall; the rest map to idle |
| `sky_face` | giant moon with craters, glowing yellow and red eyes, angry brows and crooked teeth (ref3); `glowColor` sets the iris colour | radius 2.6 × `scale` (default 5, so 26 units across). The origin is the bottom of the sphere, so place it with a mark `y` high in the sky. | idle (slow wobble), loom (tilts down and closer), walk (drift); `setFace` and `setProp` do nothing |
| `shadow_eyes` | tall dark purple silhouette covered in about 70 blinking white eyes, spiky head, white eyes and a zigzag mouth (ref6) | `scale` 1.45, about 10 units tall | every humanoid pose; idle is a creepy sway; optional `bodyColor` |
| `tall_thin` | slender, faceless figure in a black suit with long limbs and a white blank head | about 9 units tall | every humanoid pose (idle: creep) |
| `stretched` | the given spec, elongated, with the `creepy_grin` face by default (the too-tall "Mom") | from `stretch` | every humanoid pose |
| `doll` | porcelain doll with black glossy eyes, lashes, rosy cheeks, a crack line, a pink dress and a bow | kid | every humanoid pose |
| `scarecrow` | burlap head with a stitched mouth, straw hat, straw tufts and a plaid shirt; looks best with `"eyes": "glow"` | adult | idle = arms out on a post; the other poses work too |

Unknown poses fall back to the creature's idle. Unknown creature ids give a normal character with the modifiers applied.
Aliases are accepted, for example `moon` becomes `sky_face`, `furry` becomes `furry_giant` and `slender` becomes `tall_thin`.

```json
{ "id": "g", "mark": {"x": 5, "z": -16}, "facing": "camera", "pose": "loom", "face": "teeth", "spec": {"creature": "furry_giant"} }
{ "id": "moon", "mark": {"x": -4, "y": 14, "z": -70}, "facing": "camera", "pose": "loom", "spec": {"creature": "sky_face", "scale": 6} }
{ "id": "it", "mark": "B", "pose": "reach", "spec": {"creature": "shadow_eyes"} }
```
For a close-up, frame `anchors().eyes` or `.head`. The furry face, moon and shadow head are built to fill a 720×1280 frame.
At a distance, they are sized to loom over 2-storey houses.

Previews: `docs/img/characters_creatures.jpg` (bench) and `docs/img/characters_creatures_loom.jpg`. The second one is a
night scene from the real runtime: `node engine/tools/preview.js --spec engine/tools/test_scenes/characters_loom.json`.
To rebuild the bench sheet, run `node engine/tools/test_characters/render.js --scene creatures`.

Performance: 3 creatures (`furry_giant`, `shadow_eyes`, `sky_face`) plus 5 characters render at 720×1280 in about
150–170 ms per frame, after a first frame of about 1 s. One furry giant is about 10k triangles in 15 draw calls.

## v3: actions, story props and sleep masks

Every id below is in the exported lists (`POSES`, `PROPS_HELD`, `ACCESSORIES`), so `pipeline/vocab.js` dumps it into
`data/vocab.json`. Everything is a pure function of `t`. **Shot-timed** poses (marked ⏱) read the raw shot time, so the
action starts at the beginning of the shot; `poseOptions.at` delays it. The others loop seamlessly and read within about 1 s.

### Action poses (any humanoid; `setPose(id, opts)`)
| id | what it shows | opts |
|---|---|---|
| `tap` ⏱ | arm raised forward at face height, knuckle-taps a window (~3 Hz), the shoulder jabs forward on each tap | `rate` (Hz), `times` (stop after n taps), `side: 'left'`, `at` |
| `knock` ⏱ | fist thrusting forward at chest/face height, about 3 knocks per second | `rate`, `times`, `side`, `at` |
| `hammer` ⏱ | the right arm hammers at chest height (~2.5 Hz) while the other hand holds the nail; use it with the prop `hammer` | `rate`, `side`, `at` |
| `pull_curtain` ⏱ | both hands sweep from the sides to the middle (0.85 s), hold, then reset; 1.8 s cycle | `direction: 'open'`, `side` (one hand only), `period`, `at` |
| `peek` | leans sideways about 15°, head tilted, one hand holding the edge of a curtain or door, easing in and out | `side` |
| `nod`, `shake_head` | head yes / no | `rate` |
| `look_around` | nervous: the head darts left and right and dwells, the torso follows, hands clasped | `rate` (default 0.42 Hz) |
| `rock` | gentle side-to-side soothing sway with cradling arms (humming) | `period` |
| `sit_rock` | seated forward/back rocking (same seat rules as `sit`) | `seat`, `period` |
| `offer` | both arms forward at chest height, hands together, the held prop held out on the palms | — |
| `count` ⏱ | the pointing hand jumps across `n` positions (from the character's right to its left) with a small jab on each count, and the head follows | `n` (default 5; 3–7 typical), `interval` (default 0.42 s), `spread` (rad), `side`, `at` |
| `crouch` | hiding low: kneeling, curled forward, hands over the head, trembling | — |
| `tiptoe` | slow sneaky walk in place: high careful steps, leaning forward, hands raised in front. It also works as `walk.pose` | `speed`, `amplitude` |
| `sleep_lie` | lying on the back with hands folded on the stomach, head turned, slow breathing (pair it with face `sleep`) | `face: 'down'` |
| `bend` | torso bent forward about 65° with the head level, looking into something low such as a window | `angle` (rad, default 1.15) |
| `pinch` ⏱ | the hand reaches forward (0–0.9 s), pinches delicately, then lifts from 1.5 s; the held prop sits at the fingertips | `side`, `at` |
| `spread` ⏱ | the arms open wide sideways (0.6 s) and stay there, protective; the legs widen | `instant: true`, `at` |
| `straddle` | legs wide apart, standing over something and looking down (the hips lower so the feet stay on the ground) | `width` (rad, default 0.42), `angle` |
| `step` ⏱ | one big slow stride (75% swing, then plant with a thud), then the other leg | `period` (1.4 s), `amplitude`, `lift`, `at` |

Aliases include `close_curtain` and `draw_curtain`→`pull_curtain`, `give` and `hold_out`→`offer`, `hide` and `cower`→`crouch`,
`sneak`→`tiptoe`, `sleep`→`sleep_lie`, `stoop`→`bend`, `pick_up`→`pinch`, `arms_wide`→`spread`, `stand_over`→`straddle`,
`stride` and `stomp`→`step`, and `yes`/`no`→`nod`/`shake_head`. `peek` is now its own pose; it used to be an alias of `lean`.

**Furry giant:** `tap`, `knock`, `hammer` and `pinch` map to giant-specific versions.
- `tap`: leans down about 45°, one long arm reaches forward and down, and the index finger taps at about 3 Hz.
- `knock`: a big fist swings downward, as if on a roof, at about 2 Hz. `hammer` uses the same motion.
- `pinch`: bent down, the hand slowly reaches out, and the index finger and thumb close around the held prop (`cookie`), then lift it.

Fur-coloured fingers appear only during `tap`, `pinch` and `count`. `walk` is a bigger lumbering stride with arm swing.
`step` defaults to a giant stride (`amplitude` 1.45, `lift` 0.55, `period` 1.6). `bend`, `spread`, `straddle`, `count`,
`offer` and the other poses use the generic versions.

Held props are scaled to about 1.3× normal world size, so a giant's cookie matches a kid's cookie.

The fur has a faint cool rim sheen at grazing angles so that the black silhouette reads against dark night backgrounds.
Use `"rim": false` or `"rimColor"` to turn it off or change it. Its `height` (about 12.3 at the default `scale` 2.3) is unchanged.
A numeric string such as `"scale": "3"` is accepted.

The other creatures use the generic versions. `sky_face` gets `nod`, `shake_head` and `look_around`. On `sky_face`,
`bend`, `tap`, `knock`, `pinch` and `peek` become `loom`, and `step` becomes `walk`.

### New held props (`setProp({ type, ... })`)
| type | look / behaviour | opts |
|---|---|---|
| `cookie` | round, light brown, big dark chips; the face turns toward the camera. In `offer` it sits on the palms; in `carry` the hands close around it | — |
| `plate` | white plate with a blue rim and 4 cookies, tilted toward the camera; held in front with `offer` and `carry` | `color` |
| `hammer` | wooden handle and steel head, rigid in the fist, so it swings with the arm in `hammer` (strike face forward) | — |
| `candle` | white candle in a brass holder; the emissive flame and halo flicker in `update(t)`; a small warm PointLight (intensity 2.5, distance 7, no shadow) | `light: false`, `intensity`, `distance`, `color` |
| `note` | paper sheet with tape; `text` is handwritten and auto-wrapped (e.g. `"You looked."`) | `text` |
| `flashlight` (improved) | with `on` (default true): bright lens, lens halo, and an additive two-cone beam (`depthWrite: false`, fading along its length) plus the SpotLight. With `on: false`: dark lens, no beam and no light | `on`, `beam` (length, default 7), `light: false`, `intensity` |

All props accept `scale`. Aliases: `cookies`→`plate`, `torch`→`flashlight`, `paper`→`note`, `candlestick`→`candle`, `mallet`→`hammer`.
Placement depends on the pose:
- `offer`: any hand prop is held out between the joined hands.
- `carry` with a small prop (cookie, candle, note, phone, cup, flashlight…): the hands come together around it.
- `carry` or `hold_sign` with `sign`, `book`, `bag` or `plate`: the prop goes in front of the chest.
- `pinch`: the prop goes at the fingertips.
- Any other pose: the prop is in the right hand.

Props may define `update(t)`, which the character calls every frame.

### Accessory `sleep_mask`
`"sleep_mask"` or `{ "type": "sleep_mask", "text": "NOT LOOKING", "color": "#23253a", "textColor": "#fff", "slot": "eyes" | "forehead" }`.
- It is a padded mask with a stitched border and an elastic strap around the head.
- `text` is drawn big and bold on the front. It is fitted on 1 or 2 lines, and the text colour is picked automatically for contrast.
- Without text, the mask shows closed eyes with lashes.
- In `slot: "eyes"` (the default) the mask sits in front of the face plane, so the face decal's eyes are hidden.

You can wear two at once. A second mask, `slot: "forehead"`, or the alias `"sleep_mask2"` sits pushed up on the forehead
above the first. A mask without its own `text` reuses the other mask's text ("He wears 2."). Extra masks beyond two are
ignored. Other aliases: `mask`, `eye_mask`, `blindfold`.

```json
{ "id": "mayor", "pose": "stand", "spec": { "accessories": ["mayor_chain", { "type": "sleep_mask", "text": "NOT LOOKING" }, "sleep_mask2"] } }
{ "id": "bea", "pose": "offer", "prop": "cookie", "face": "grin" }
{ "id": "dad", "pose": "hammer", "prop": "hammer", "facing": "right" }
{ "id": "dad", "pose": "count", "poseOptions": { "n": 7, "interval": 0.35 } }
{ "id": "beast", "pose": "pinch", "prop": "cookie", "spec": { "creature": "furry_giant" } }
{ "id": "beast", "pose": "tap", "poseOptions": { "times": 4 }, "spec": { "creature": "furry_giant" } }
```

### Rig extensions (for module authors)
Pose functions may also set the following fields:
- `J.offL` / `J.offR`: shoulder offsets, used for jabs and thrusts.
- `J.legDrop`: lowers the hips by this fraction of the leg length so that spread legs stay on the ground.
- `J.seated`: the hips height is absolute.
- `J.kneel`: legs folded back, the hips at the leg thickness.
- `J.finger` and `J.pinch`: read by creature hands.

`createHumanoid` overrides also accept:
- `poseDefaults` (`{pose: opts}`)
- `propScale`
- `handPad`
- `pinchPoint(rig)` (arm-local)
- `update(t, rig, pose)` with `rig.J` and `rig.poseOpts`
