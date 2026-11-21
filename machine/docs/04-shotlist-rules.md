# 04 — Shot-list rules (narration → `shots[]`)

Measured on the 140 reference shots (`data/reference_shots.json`) and 756 caption tokens
(`data/reference_words.json`).

## 1. Splitting narration into shots
- **One shot = one phrase of 2–11 words** (mean 5.4, median 5). Distribution: 2:8 %, 3:11 %,
  4:16 %, 5:18 %, 6:18 %, 7:15 %, 8:5 %, 9:4 %, 10–11:4 %.
- **Duration target 0.6–2.0 s** (mean 1.22 s, median 1.23 s, p10 0.76 s, p90 1.74 s). At the
  reference speech rate (4.4 words/s) that gives the word counts above. With a slower TTS,
  choose **words per shot ≈ 1.25 s × TTS words/s** and keep each shot between 0.6 and 2.0 s.
  Allow up to ≈ 2.4 s only for a long establishing line or a held reaction. The final shot may
  last 2.5–3 s.
- Shot count ≈ runtime / 1.22 → **≈ 115–145 shots** for 140–180 s.
- **Where to cut:**
  1. At every sentence start (100 % of sentences start a new shot, except 2–3-word fragments,
     which may share a shot with the next fragment).
  2. Inside long sentences, at clause or conjunction boundaries: "and", "but", "when", "until",
     "across the lake", "the next day/morning", "a second later".
  3. **Right before the payoff word or phrase.** The previous shot may end on a dangling word
     ("…a sign that says" | "hi ME"; "…lifted his at" | "the exact same second").
  4. Always cut where the narration crosses to the other side ("across the lake/water", "Other …").
- Timing: the cut leads the first word of the shot by **0–4 frames, typically 2 (≈ 0.07 s)**.
  This matches ARCHITECTURE §10 (−0.05 s); −0.067 s is also fine.
- Ending: the reference ends **0.46 s after the last word starts**. The last shot carries the
  whole final sentence. Use `ending.hold` ≈ 0.6–1.0 s; 2.5 s is longer than the reference.
  Never fade out.

## 2. Framing and move defaults
- Framing mix to aim for: medium 39 %, wide 16 %, medium_close 13 %, close_up 9 %,
  over_shoulder/back 9 %, extreme_wide/establishing/aerial 7 %, two_shot 4 %, insert 3 %.
- Angle: eye 86 %, high 8 % (crowds, people lying, heads in water), low 6 % (buildings, empty
  streets, a kid holding a sign to the camera).
- **Move: `push_in` on every shot by default.** The reference zooms 1.00 → 1.05 linearly over
  every shot (measured). Use `pan_left`/`pan_right` (≈ 9 %) for rows of people, docks and
  walking lines. Use a strong push_in (total 1.10–1.35) for revelations, night windows and the
  final object. Use `pull_out` (2 %) when someone runs toward the camera. Never use orbit,
  shake or whip (the opening whip is the only exception: optional 0.2 s whip-zoom into shot 1).
- Composition: single subject centred horizontally, head between 30 and 45 % of frame height,
  nothing important below 65 % (captions at 72 %).

## 3. Sequencing patterns (measured)
- **Change something at every cut.** In 139 transitions the most common pairs are medium→medium
  (24, always a different subject, side or angle), medium↔medium_close (14), medium↔wide (15),
  medium↔close_up (12). The same subject in the same framing twice in a row happens only as a
  deliberate jump cut: in for a quote (shot 76), out after a POV close-up (84→85), or the
  identical-camera state change (lights off, 50→51).
- **Set runs are short:** 1.9 shots on average per set before switching (max 8, the night
  living-room conversation). The reel alternates between "our side" (lake_dock, street,
  house_front, interiors) and "their side" (lake_far_shore + binocular POV) every 1–3 shots in
  the first half.
- **Mirror pair (core pattern, ≈ 20×):** our character does X (medium, facing camera) →
  binocular POV of "Other" character doing X (medium, facing the lens). Optionally insert a
  "raises binoculars" shot before the POV (3×), or an extreme_wide of the far shore (5×).
  Binocular shots are preceded by medium (11/20), medium_close (3), close_up (2) or
  over_shoulder (2), and followed by medium (8), wide (3) or close_up (3).
- **Binocular budget:** ≈ 15 % of runtime (14 % of shots), spread from 0.6 s to ~78 % of the
  story. Not in night/interior sequences (one exception: a warm interior seen through a window
  at golden hour). None after the other side is gone.
- **Establishing:** the reel rarely opens a scene with an establishing shot. It drops straight
  into a medium shot. Use extreme_wide/aerial/establishing (7 %) for: the rule of the world
  ("same houses"), abstract sentences ("there's only one thing off about them"), "nobody
  moved", and the still lake.
- **Quotes:** the speaker appears in medium_close/close_up with face `talk` while the coloured
  quote is spoken. The tag ("he whispered") may stay on the same shot or cut to the listener.
- **Reaction shots:** after each revelation, a close_up of the narrator or a relative with
  scream/cry/scared (shots 94, 100, 120, 129, 138).
- **Faces to camera:** ≈ 76 % of shots with characters show the face toward the lens (copies
  ALWAYS face the lens). Backs/over-shoulder 9 %: used for "looking across" and for the
  narrator at a window.
- **Crowds (≥ 6 characters): 10 % of shots**, used for town rituals ("half the town sits on the
  dock"), "the whole town", walking into the water, and the far dock. Use `crowd.count` 6–25.
- **Time passing:** (a) the same subject and framing in 2–3 consecutive shots with changing
  weather (sunny → overcast → snow) under a countdown ("23 hours. 22 hours. By winter…");
  (b) night = exterior house with lit windows → interior; (c) an insert of the measuring
  object (stopwatch) with a number in the narration.
- **Ending staging:** wide/high shots of the other side walking into water → heads only →
  floating object with submerged figures → extreme_wide empty still lake → our side wading in
  (medium, cry/scream close-ups) → coloured-refrain callback on the elder (memory, earlier set)
  → abandoned object insert → narrator + family wading, depth increasing every shot
  (knees 1 → waist 2.5 → chest 3.5 → chin 4.3 units) → wide high shot of heads in the middle of
  the lake → **final insert of the recurring object floating, strong push_in, held to the end.**

## 4. Mapping: narration content → engine vocabulary

| narration content | set | framing / angle | move | actors (pose / face) / props |
|---|---|---|---|---|
| the rule / "this town" / "same houses" | lake_aerial, street | aerial, establishing (low) | push_in | none or 1 walker (walk / happy) |
| "across the lake/water", "over there", "them" | lake_far_shore | extreme_wide, or binocular POV | push_in (strong for emphasis) | tiny far people; crowd 6–10 |
| "Other X does Y" | lake_far_shore (`binoculars: true`) | medium / medium_close, eye | push_in | other_x: same pose as X, face smile/grin, facing camera |
| someone watches / lifts binoculars | lake_dock | medium (or back / over_shoulder) | push_in | pose binoculars, prop binoculars; next shot = POV |
| town ritual ("every morning half the town…") | lake_dock | wide | pan_left/right | crowd 6–10 sit on benches, some with binoculars |
| named character intro ("my little brother Toby") | street / lake_dock | medium or two_shot | push_in | stand, smile, facing camera |
| physical action (trips, eats, dances, drops) | where it happens | medium / medium_close (low for kids) | push_in or pan | fall, lie, jump, run, arms_up, custom eat; face grin/surprised |
| object noun (sign, stopwatch, wreath, plate) | current | close_up or insert | push_in | held prop to camera (hold_sign, stopwatch) |
| numbers / countdown / seasons | lake_dock | medium_close on the elder | push_in | sit, neutral/angry, stopwatch; weather overcast → snow |
| night, lights, sleeping | house_front (night), bedroom | establishing → over_shoulder at window | strong push_in | lit windows → dark (cut with identical camera), back to camera |
| elder quote / lore | lake_dock bench, living_room | close_up / medium_close | push_in | talk face; coloured caption |
| question and answer | living_room (night) | two_shot → medium_close ↔ over_shoulder | push_in | stand/sit; worried / surprised / sad |
| authority's announcement | park (gazebo) | medium, low | push_in | talk; audience over_shoulder, sad |
| "nobody moved", empty town | road_night, street | establishing (low, dusk) | strong push_in | no characters |
| family indoors | living_room / kitchen | wide | push_in | sit on sofa / table, sad |
| fear, crying, realisation | anywhere | close_up | push_in | scream / cry / scared |
| hug, comfort | lake_dock | medium → close_up | push_in | hug, cry (ours) vs smile (copies) |
| "walked into the lake", "holding hands" | shore_water | wide, high | pan | crowd walk / wade, depth 1–3 |
| "nobody came back up", "still" | lake_far_shore / shore_water | insert (floating object), extreme_wide | push_in | 0 characters, submerged figures |
| water rising "to my knees / chest / chin" | shore_water | medium → medium_close → close_up | push_in, pull_out | wade, depth 1 → 2.5 → 3.5 → 4.3, scream |
| last line | lake_far_shore | insert, high | strong push_in | the recurring object floating alone |

## 5. Shot fields: practical rules
- `say`: the exact words, with punctuation allowed. Concatenated, all `say` fields = the
  narration.
- `subject`: the character whose action the words describe. For abstract lines use
  `poi:across` with an extreme_wide, or the listener's reaction.
- `actors[].facing`: `"camera"` by default (the reel's look). Use `"poi:across"` or `"away"`
  only for backs/over-shoulder "looking" shots.
- Copies: declare them as their own cast entries (e.g. `other_toby`) with the **same spec** as
  the original. Their face is usually `smile`/`grin`, even in tragic moments.
- `time`/`weather` change only at beat boundaries (night block, season montage).
- Binocular shots: set `binoculars: true`, subject on `lake_far_shore`, and frame as
  medium/medium_close. The director narrows the FOV (≈ 25°).

## 6. Caption highlights
Only **quoted direct speech** is coloured, by speaker: elder yellow #F7DE72, little brother
blue #74CAF8, mother pink #F7A5C0 (pick one colour per speaking character, from a palette of
pastel yellow / sky blue / pink / mint). Names are **not** highlighted. The current
`captions.highlight: ["Toby","Grandpa"]` format colours names, which the reference never does.
Suggested format (needs post-module support): `"captions": {"highlight": [{"text": "whatever
we do", "color": "#F7DE72"}, …]}`, matched in order against the narration tokens.

## 7. Worked example: reference shots 21–30 (22.40–34.80 s) as `shots[]`

```json
{
  "cast": {
    "me":    { "name": "Me", "build": "kid", "hair": { "style": "spiky", "color": "#f2d232" },
               "shirt": { "pattern": "stripes_h", "colors": ["#e7c43f", "#151515"] },
               "pants": { "style": "pants", "color": "#151515" }, "face": "smile" },
    "toby":  { "name": "Toby", "build": "kid", "hair": { "style": "messy", "color": "#6b3f22" },
               "shirt": { "pattern": "stripes_h", "colors": ["#cf4b3c", "#e2b84a"] },
               "pants": { "style": "pants", "color": "#2a4fa0" }, "face": "grin" },
    "other_toby": { "...": "identical to toby" }
  },
  "shots": [
    { "id": "021", "say": "My little brother Toby", "set": "street", "time": "day", "weather": "clear",
      "framing": "two_shot", "angle": "eye", "move": "push_in", "subject": "toby", "binoculars": false,
      "actors": [ { "id": "me",   "mark": "A", "facing": "right",  "pose": "stand", "face": "smile" },
                  { "id": "toby", "mark": "B", "facing": "camera", "pose": "stand", "face": "smile" } ],
      "note": "intro of the sibling, lamp post behind" },
    { "id": "022", "say": "ate a worm once.", "set": "street", "time": "day", "weather": "clear",
      "framing": "medium_close", "angle": "low", "move": "push_in", "subject": "toby", "binoculars": false,
      "actors": [ { "id": "toby", "mark": "A", "facing": "camera", "pose": "point", "face": "grin", "prop": null } ],
      "note": "head tilted back, worm dangling above open mouth (custom 'eat' pose: one arm raised)" },
    { "id": "023", "say": "The next day Other Toby ate a worm.", "set": "lake_far_shore", "time": "day", "weather": "clear",
      "framing": "medium_close", "angle": "eye", "move": "push_in", "subject": "other_toby", "binoculars": true,
      "actors": [ { "id": "other_toby", "mark": "A", "facing": "camera", "pose": "point", "face": "grin" } ],
      "note": "mirror of 022 through the binoculars" },
    { "id": "024", "say": "Every morning he holds up a sign that says", "set": "lake_dock", "time": "day", "weather": "clear",
      "framing": "medium", "angle": "eye", "move": "push_in", "subject": "toby", "binoculars": false,
      "actors": [ { "id": "toby", "mark": "A", "facing": "camera", "pose": "hold_sign", "face": "grin",
                    "prop": { "type": "sign", "text": "HI ME!" } } ],
      "note": "cut lands before the payoff words" },
    { "id": "025", "say": "hi ME.", "set": "lake_dock", "time": "day", "weather": "clear",
      "framing": "close_up", "angle": "low", "move": "push_in", "subject": "toby", "binoculars": false,
      "actors": [ { "id": "toby", "mark": "A", "facing": "camera", "pose": "hold_sign", "face": "grin",
                    "prop": { "type": "sign", "text": "HI ME!" } } ],
      "note": "sign fills the lower half, 0.6 s" },
    { "id": "026", "say": "And every next morning", "set": "lake_far_shore", "time": "day", "weather": "clear",
      "framing": "extreme_wide", "angle": "eye", "move": "push_in", "subject": "poi:across", "binoculars": false,
      "actors": [ { "id": "other_toby", "mark": "A", "facing": "camera", "pose": "hold_sign", "face": "grin",
                    "prop": { "type": "sign", "text": "HI ME!" } } ],
      "crowd": { "count": 6, "pose": "stand", "area": "crowd" },
      "note": "across-the-water view of the light-blue house and far dock, people tiny" },
    { "id": "027", "say": "Other Toby holds up the same sign.", "set": "lake_far_shore", "time": "day", "weather": "clear",
      "framing": "medium", "angle": "eye", "move": "push_in", "subject": "other_toby", "binoculars": true,
      "actors": [ { "id": "other_toby", "mark": "A", "facing": "camera", "pose": "hold_sign", "face": "grin",
                    "prop": { "type": "sign", "text": "HI ME!" } } ] },
    { "id": "028", "say": "There's only one thing off about them.", "set": "lake_far_shore", "time": "day", "weather": "clear",
      "framing": "extreme_wide", "angle": "eye", "move": "push_in", "subject": "poi:across", "binoculars": false,
      "actors": [], "crowd": { "count": 8, "pose": "stand", "area": "crowd" },
      "note": "abstract line -> far-shore view; strong push_in (1.0 -> 1.18)" },
    { "id": "029", "say": "Whatever they're doing,", "set": "street", "time": "day", "weather": "clear",
      "framing": "wide", "angle": "eye", "move": "push_in", "subject": "extra:1", "binoculars": false,
      "actors": [ { "id": "extra:1", "mark": "A", "facing": "camera", "pose": "run",   "face": "smile" },
                  { "id": "extra:2", "mark": "B", "facing": "camera", "pose": "jump",  "face": "smile" },
                  { "id": "extra:3", "mark": "C", "facing": "camera", "pose": "stand", "face": "smile" } ],
      "note": "everyday activity on the far side; all heads turned to camera" },
    { "id": "030", "say": "their faces are always turned toward us.", "set": "lake_far_shore", "time": "day", "weather": "clear",
      "framing": "close_up", "angle": "eye", "move": "push_in", "subject": "extra:4", "binoculars": true,
      "actors": [ { "id": "extra:4", "mark": "A", "facing": "camera", "pose": "stand", "face": "smile" } ],
      "note": "the first wrong detail: a copy staring into the lens, 2.0 s" }
  ]
}
```
