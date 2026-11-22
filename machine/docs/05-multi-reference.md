# 05 — What 6 references have in common (style = what to reproduce)

Measured with `tools/analyze_reference.py` (cuts, caption OCR, audio) + visual review of one frame per shot.

| ref | length | shots | mean shot | wpm (OCR, under-counts ~10 %) | caption band (y/height) | masked POV | narrator vs ref1 | notes |
|---|---|---|---|---|---|---|---|---|
| 1 | 171 s | 135–140 | 1.22–1.27 s | 249 (266 exact) | 0.69–0.72 | 14 % binoculars | 1.00 | bee-kid hero, lakeside town, mirror town |
| 2 | 140 s | 99 | 1.42 s | 222 | 0.65–0.68 | 2 % | 0.92 | caveman-outfit kid, forest road town, cars, crash, hospital |
| 3 | 159 s | 108 | 1.47 s | 216 | 0.69–0.72 | 1 % | **0.99** | bee-kid hero, night house, giant moon face, notebook pages, stretched "Mom" |
| 4 | 110 s | 90 | 1.22 s | (OCR failed: yellow spaced caps) | 0.69–0.71 | 1 % | 0.95 | other creator: toy-like cartoon town, rope-tied flying town |
| 5 | 170 s | 133 | 1.28 s | 228 | 0.69–0.72 | 0 % | **0.99** | bee-kid hero, desert suburb, giant furry black creatures with grins |
| 6 | 125 s | 59 | 2.12 s | 230 | 0.18–0.21 (top, italic caps) | 8 % oval vignette | 0.79 | other creator: city, many-eyed shadow, statue plaque, subscribe end card |

**Canonical style = channel of refs 1, 3, 5** (same hero, same narrator voice, same caption template).
Refs 2 / 4 / 6 confirm the genre but differ in details; borrow devices only.

## Invariants (keep exactly)
- Roblox R6 blocky characters, classic decal faces; one recurring hero per channel (bee kid: blonde spiky
  hair, yellow/black horizontal stripes, black pants).
- Vertical 720×1280 30 fps, hard cuts every **1.2–1.5 s**, every shot with a slow zoom.
- First-person kid narrator, **~230–265 wpm**, one continuous voice, no pauses > 0.3 s.
- Captions: one word, white bold, black outline + shadow, centred at **~70 % height**; quotes coloured by speaker.
- −14 LUFS master (music optional; the user adds it).
- Length **110–170 s**.

## Recurring devices (use in most stories)
1. **The anomaly/creature** is the star: a giant or uncanny thing (huge face in the sky, giant furry
   creature with a wide grin, a stretched/too-tall version of a family member, a shadow with many eyes,
   a doubled town). Shown big, often looming over houses, often at night, close-ups of its face/teeth/eyes.
2. **Rules + countdown**: the town's rule, numbers that shrink or grow, a time (3:00), a day count.
3. **Text cards**: notebook pages with handwritten warnings + child drawings, wooden/metal signs
   ("WELCOME TO …"), plaques, notes, screens (heart monitor). Full-frame or close insert.
4. **Masked POV**: binoculars (ref1), oval/vignette "seeing/remembering" (ref6), keyhole/peek.
5. **Family + elder + authority** cast; crowds of townsfolk for collective moments.
6. **Settings change per story** but stay small-town Americana: suburban street (houses, lawns, power
   poles), forest road, bedroom/kitchen/living room, school, hospital room, warehouse, treehouse/backyard,
   lake, town square with statue, city brownstone street.
7. **Lighting carries mood**: bright day for normal life, orange sunset for dread, deep blue night for horror.
8. **Ending**: the hero's fate or a final object/image; sometimes a twist line on the last word.

## Gaps of the engine (to build)
- Creature archetypes + character modifiers (scale, stretch, glowing/hollow eyes, scary faces).
- Text-card shots (notebook, sign, plaque, note, phone, monitor).
- POV mask variants (vignette oval, keyhole, scope) besides binoculars.
- Sets: suburban_street, forest_road, hospital_room, warehouse, backyard (swing/treehouse),
  city_street, town_square (statue), rooftops_sky (for giant things in the sky).
