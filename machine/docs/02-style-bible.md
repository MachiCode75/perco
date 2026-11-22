# 02 — Style bible (actionable rules for engine modules)

Hex values were sampled from reference frames: medians of regions and k-means of whole regions,
in sRGB as encoded in the video, after its tone mapping. Aim the **final rendered pixels** at
these values. Values marked (est.) were read from mixed regions.

## 1. Global look
- Roblox "Future/ShadowMap" look: bright, clean, slightly soft. It is not toon-shaded, and plastic
  materials have a mild specular. Saturation is moderate. Colours are pastel on buildings and
  saturated on clothes.
- Distance haze: the far shore is lifted toward the sky colour (far houses ≈ #92A6BB, tree line
  #1D293D at the horizon in the aerial). Use exponential fog that starts ≈ 60–80 studs away and
  is tinted with the horizon colour.
- Light: one warm-white sun, high (≈ 45–60° elevation), usually **from camera-left/behind**.
  Fronts of houses and faces are lit, with **soft-edged shadows** of medium density (shadow
  areas keep ≈ 55–65 % of lit brightness) and strong sky ambient. Night: no sun, blue-black sky,
  warm window and lamp light.
- No film grain, no vignette (except the binocular mask), no colour grade between scenes. The
  flashback (40.6 s) is a little hazier and greyer: sky ≈ #8F9AA3.

## 2. Sky by time of day

| time | zenith (top of frame) | horizon | notes |
|---|---|---|---|
| day (clear) | #488ACB – #5B93C7 | #6290B4 – #6C94C0, haze #92A6BB | smooth vertical gradient, no clouds visible in most shots |
| overcast (autumn) | #617C8E – #8D95A5 | ≈ #A3AAB4 | flat grey-blue, lower contrast, no hard shadows |
| snow | #8D95A5 | #B0B6C2 | ground and roofs #BFC8D8 (blue-white), falling flakes optional |
| golden | (street) #2F2946 high | #BB8366 → #F0AA3F near lamps | strong orange key from the low side; street lamps already on |
| dusk | #3F3751 | #9A7E68 → #372C3C | purple-to-peach gradient, buildings in silhouette, warm porch lights |
| night | #000000 – #000015 (near pure black) | #101424 | lit windows warm cream #EAE6D2 / amber #F0AA3F; lamp posts lit; facades still visible at ~60 % brightness (#B7C5D6 siding at night) |

## 3. Town palette
Houses: two-storey Victorian clapboard, gable roofs (front gable with small vent window),
porches with white posts and railings, window boxes with flowers, white trim everywhere.
Black/navy shutters. **Red front door** on the hero house.

| element | hex (lit) | hex (shade) |
|---|---|---|
| siding light blue (hero house) | #A8C3D6 – #B4C7D2 | #7997B2 – #8D9EB5 |
| siding pale yellow / cream-yellow | #D9C69A (est.) – #D9BFA5 | #AAA368 – #C0AC93 |
| siding dusty pink / mauve | #D6AEB0 (est.) | #A69EA9 |
| siding sage / grey-green | #A3AE8C (est.) | #758690 |
| siding grey-blue | #7D8FA0 (est.) | #637D8E |
| white trim, porch posts, railings | #E3DFD7 – #EAE6D2 | #AEADA8 – #BDB8AA |
| shutters / window panes | #192B4A (navy) | #101424 |
| roofs (asphalt shingles) | #353C51 – #353F4D (slate) | #181E2B |
| front door red | #B23918 (lit) / #962A15 | #8B2A14 |
| chimneys | red brick #9B4A33 (est.) | |
| church | white #E6E6E2 with dark grey steeple roof | |

Ground and water:

| element | hex |
|---|---|
| grass / lawns (muted dark green) | #505341, #425532, #3D4335; bright bushes #7D9259 |
| conifer trees | #3F6A35 – #5E8F3A (est., simple cone stacks) |
| dock planks (warm brown) | #674029 / #5E4930, highlights #8B6A4A, dark posts #3B2A1C |
| road asphalt | #3B3D42 day (est.), #0C0C10 night; yellow centre line #E2B33C |
| sidewalk | #B9B7AE (est.) |
| water near (medium blue, small ripples) | #366692 – #3A6695 |
| water deep / aerial | #285C8B |
| water reflection highlights | #52749D – #6295C6 |
| underwater tint (submerged bodies) | water colour at ~70 % opacity over the body, blue-shifted |

Interiors:

| room | key colours |
|---|---|
| kitchen | honey wood floor #D3A25C / #C09050, cream walls #D8BB8E, dark teal-green cabinets #2C3C37, pendant lamps |
| living room | orange wood-panel walls #A5783C / #AB5E1D, dark wood #571906, red-brick fireplace #782C0C, rust rug #8A3B10, green-grey upper wall, framed picture, wall clock |
| bedroom (night) | dark room, window = black sky with warm dots of lit windows across the lake, small table lamp |

## 4. Characters
- R6 blocky: head, torso, 2 arms, 2 legs as boxes. The head is the classic rounded Roblox
  head. Proportions as ARCHITECTURE §1. Kids ≈ 0.8× adult. Toby (little brother) is noticeably
  smaller than Me.
- Skin: Roblox classic beige #E3C9AE (lit) / #C9A98C (shade) (est.). Hands are the same colour
  as skin.
- Clothes are flat textures with bold patterns. Observed cast and palette:

| character | look |
|---|---|
| Me (narrator, kid) | spiky blond hair #F2D232, horizontal stripes yellow #E7C43F / black #151515 long sleeves, black pants; star pyjamas (navy #1F2D5C with yellow stars) at night |
| Toby (little brother) | brown hair #6B3F22, tee with horizontal red #CF4B3C / yellow #E2B84A / blue stripes + green dino logo, blue jeans #2A4FA0 |
| Mom | black hair in bun/ponytail, pink cardigan #E9C3C8, white top, light-blue jeans with flower patches |
| Grandpa | bald, rectangular black glasses, white moustache, green vest #3E5E45 over white shirt with pink grid plaid #E8B9B0, grey trousers; holds stopwatch |
| Mr Lee | bald, glasses, argyle vest blue #2E4B9B / yellow #E3C24A |
| Mrs Lee | long grey-white hair, green apron, pink polka trousers, green watering can |
| Mayor | black hair, navy suit #1B2A6B, red tie, gold mayor chain |
| extras | yellow tee + jeans, pink polka-dot pyjamas, purple granny outfit, white shirt + jeans, tan suit, overalls, wedding black suit / white dress |

- Held props are chunky. Binoculars: black, two cylinders with blue or white lens discs. Signs:
  white board ≈ 1.6 × 1 studs with hand-drawn marker letters ("HI ME!" blue H I, red M E,
  green underline). Stopwatch: big round silver face with red hand.

### Face decals (classic Roblox, flat black on the head front)
- Strokes are pure black #111, thick (≈ 4–5 % of head width). Eyes are vertical black ovals
  ≈ 10 % of head width × 18 % of head height, spaced ≈ 30 % apart.
- **smile:** oval eyes + thin U-curve mouth (most common). **happy:** eyes become "^ ^" arcs +
  smile. **grin:** D-shaped open mouth, black inside, white upper teeth band. **talk:** small
  open oval mouth. **worried / sad:** brows slanted up toward the centre + small frown (sad =
  lower lids). **angry:** brows slanted down to the centre (Grandpa), flat or frown mouth.
  **surprised / scared:** round eyes, open round mouth, raised brows. **cry:** sad brows +
  **blue tear streaks** (#5AA8E8) running from eyes to chin. **scream:** angry/scared brows +
  big open mouth filled **red #D93030** with black outline (used constantly in the ending).
  **sleep / calm:** closed arc eyes, small smile (Mom walking into the water).
- Glasses are drawn or modelled as black rectangles over the eyes.

## 5. Camera defaults (est. unless stated)
- Vertical FOV ≈ 50–60° for normal shots (Roblox default 70° looks slightly wider). Binocular
  POV ≈ 20–30° (telephoto flattening).
- Camera height: chest-to-eye level of the subject (≈ 3–4.5 studs for adults, ≈ 2.5–3.5 for
  kids). Angle eye-level in 86 % of shots. Low angle (camera ≈ 1–1.5 studs) for buildings,
  streets and the "hi ME" close-up. High angle for crowds, lying bodies and heads in water.
- **Measured motion: every shot gets a linear centred zoom 1.00 → 1.05 over its duration.**
  Implement it in post (crop-scale) or as a FOV ramp ×0.95. 14 % of shots add a slow pan or
  truck (4–28 % of frame width), and 14 % add a stronger dolly-in (total scale 1.08–1.34).
- Composition: **single subjects are centred horizontally** (≈ 90 %). Rule of thirds is not
  used. Faces look into the lens or slightly off it. The caption (baseline at 72 % height) lands
  on the subject's torso or legs, so heads must stay above ≈ 62 % height.

| framing | what it looks like in this reel |
|---|---|
| extreme_wide / establishing (far shore) | lake fills the bottom 45–55 %, far houses in a band at 25–45 % height, tiny people on the dock; or an empty street with low camera and houses filling the upper 2/3 |
| aerial | high view along the lake/canal, both shores converge to the horizon at ≈ 15 % height |
| wide | 1–8 characters at 15–30 % of frame height, standing at 45–75 % height; dock or shore with houses behind |
| medium | full body or knees-up, subject ≈ 30–50 % of frame height, head top at ≈ 30–40 % height, width ≈ 35–55 % (arms out) |
| medium_close | waist-up, head top ≈ 25–38 %, head width ≈ 22–28 % of frame width |
| close_up | head + shoulders, head width ≈ 30–40 % of frame width, eyes at ≈ 35–42 % height; a held object (sign, stopwatch) may fill the lower half |
| over_shoulder / back | foreground character's back or shoulder at the bottom-left or centre, looking toward the far shore, a person or a window |
| two_shot | two characters side by side, centred as a pair |
| insert | single object fills the centre (wreath door, stopwatch, binoculars on dock, floating sign) |
| binocular POV | medium/medium-close telephoto of the far side, composed inside the mask centre (y ≈ 537), subject looking at the lens |

## 6. Binocular overlay (post)
Static black mask, two soft ellipses: centres (230, 537) and (490, 537), rx 220, ry 208 px at
720×1280. Feather ≈ 32 px with a slightly darker inner ring. Outside is #000. Apply it **after**
the per-shot zoom, so the mask never scales. Captions are drawn on top, at the same position as
in other shots.

## 7. Captions (post)
Arimo Bold (or Inter Bold) ≈ 63 px at 720 wide (94 px at 1080). White #FFFFFF fill, black
outline 3–4 px (5–6 px at 1080), soft black shadow blur ≈ 6–8 px offset (0, +2). Centred at
x = 50 %, baseline 72 % of height. One word at a time, instant swap, no gaps, no punctuation.
Highlights: yellow #F7DE72, blue #74CAF8, pink #F7A5C0 (see 01 §12 and 04 §6).
