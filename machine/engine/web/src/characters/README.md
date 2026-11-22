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
`bow`, `scarf`, `apron`, `beard`, `mustache`. Facial hair uses the hair colour, or grey when the character is bald.
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
up) and `lean` (tilted sideways, peeking; takes `side: 'left'`). The arms are rigid blocks that rotate at the shoulder, and the legs rotate at the hip.
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
| `flashlight` | in the right hand with a light cone and a SpotLight (`light: false` disables the light) |
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
