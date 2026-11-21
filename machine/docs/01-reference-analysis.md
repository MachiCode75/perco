# 01 — Reference analysis (measured)

Source: the reference reel (720×1280, 30 fps, 170.73 s, HE-AAC stereo 44.1 kHz).
Data files: `data/reference_shots.json` (140 shots, all fields), `data/reference_words.json`
(756 caption tokens, frame-accurate start/end and highlight colour).
Everything below is measured unless marked **(est.)**.

## 1. Cut list: 140 shots, not 128

The original scene-cut pass (threshold 12) missed 12 hard cuts. They were found again by a
frame-difference re-scan and each one was checked by eye: 57.33, 88.40, 97.60, 100.70, 107.20,
139.13, 140.17, 141.73, 146.47, 159.03, 160.57 and 167.97 s. Most are water/sky shots cut to
other water/sky shots, so the colour histograms are almost the same. The cut at 57.33 s keeps
an **identical camera**: the house windows go dark exactly on the caption word "off". This is a
state-change cut.

**Transitions: 100 % hard cuts.** There are no dissolves, fades or wipes anywhere. The 139–141,
146 and 159–161 s areas are hard cuts. The only effect is the **opening**: frames 0–6
(0–0.20 s) are a motion-blurred whip-zoom into the first shot, and the first caption word slides
in with it. The video ends on a hard stop, with no fade-out.

| Stat (140 shots) | Value |
|---|---|
| mean / median | **1.22 s / 1.23 s** |
| min / max | 0.57 s / 2.77 s (the last shot; the longest non-final shot is 2.37 s) |
| p10 / p25 / p75 / p90 | 0.76 / 0.87 / 1.44 / 1.74 s |
| sd | 0.40 s |

| Duration bucket | 0.5–0.7 | 0.7–0.9 | 0.9–1.1 | 1.1–1.3 | 1.3–1.5 | 1.5–1.7 | 1.7–1.9 | 1.9–2.1 | 2.1–2.5 | >2.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| shots | 11 | 25 | 22 | 19 | 34 | 12 | 7 | 7 | 2 | 1 |

Pacing does not slow down toward the end. Shots in the last 40 s are as short as in the first 40 s.

## 2. Cut ↔ word alignment

- **Words per shot:** mean 5.4, median 5, min 2, max 11. Histogram: 2:11, 3:16, 4:23, 5:25,
  6:25, 7:21, 8:7, 9:6, 10:4, 11:2.
- **Each cut sits on a word onset.** The cut comes on average **2 frames (≈0.07 s) before** the
  caption word that starts the new shot (offset distribution: 0 f: 16, +1: 15, +2: 30, +3: 15,
  +4: 24, ≥+5: 18, negative: 21). In practice a shot = a phrase, and the cut leads the phrase by
  0–4 frames.
- Cuts fall on **phrase boundaries**, not only on sentence boundaries. Long sentences are split
  into 2–3 shots at clause breaks such as "…on his porch step | and the next morning across the
  water | Other Mr Lee trips on his". A shot often ends on a dangling function word
  ("…a sign that says |", "…Other Me lifted his at |"). The next shot then delivers the payoff
  ("hi ME", "the exact same second"). This is deliberate: **the image changes on the payoff word.**

## 3. Framing distribution (140 shots)

| framing | n | % | | framing | n | % |
|---|---|---|---|---|---|---|
| medium | 55 | 39 | | two_shot | 5 | 4 |
| wide | 23 | 16 | | back | 4 | 3 |
| medium_close | 18 | 13 | | insert | 4 | 3 |
| close_up | 13 | 9 | | establishing | 4 | 3 |
| over_shoulder | 8 | 6 | | aerial | 1 | 1 |
| extreme_wide | 5 | 4 | | | | |

Angle: eye 120 (86 %), high 11 (8 %), low 9 (6 %). Low angles are used for buildings and
empty streets (establishing) and for a kid's close-up. High angles are used for crowds, people
lying on the dock and heads in the water.
Characters in frame: 0 → 12 shots, 1 → 64 (46 %), 2 → 23, 3 → 23, 4–5 → 4, ≥6 (crowd) → 14 (10 %).
Example frames are in `docs/img/framings.jpg`.

## 4. Camera moves (measured with SIFT similarity transforms, first vs last frame of each shot)

**Every single shot has a slow, linear, centre-anchored zoom-in.** Median scale over a shot is
**1.039** (measured from frame +2 to frame −3, which is ≈1.045–1.05 over the full shot). The
zoom is linear in time (for example shot 10: 1.003, 1.007, 1.011, … 1.048 at 0.1 s steps). It
is nearly **independent of shot length**: 0.5–0.9 s shots reach 1.037, 1.5–3 s shots reach
1.047. The centre shift is about 0 (|dx|, |dy| < 0.01). This is an editor "zoom-in" applied to
every clip, and inside binocular shots the mask does not zoom.

On top of that zoom:

| move (ARCH vocab) | n | measured signature |
|---|---|---|
| push_in (digital 4–5 %, default) | 104 | scale 1.03–1.07, shift < 2 % |
| push_in strong (dolly + zoom) | 19 | scale 1.08–1.34 (night window 1.34, "nobody moved" 1.25, final sign 1.13, far-shore 1.18) |
| pan_left / pan_right | 8 / 5 | content shifts 4–28 % of width over the shot (slow truck/pan following people or along the dock) |
| pull_out (+ tilt) | 3 | scale 0.965–0.977 (Mom running toward camera ×2, Me chest-deep) |
| tilt_down | 1 | 22 % vertical shift (snow shot) |

There is no orbit, no handheld shake and no whip, except the one opening whip.

## 5. Binocular POV shots

- **20 / 140 shots (14 %), 27.1 s = 15.9 % of runtime.** Durations 0.57–2.0 s (mean 1.35 s,
  about the same as normal shots).
- Positions: 2, 5, 11, 14, 18, 20, 23, 27, 30, 38, 58, 62, 66, 84, 85, 93, 97, 102, 107, 111.
  That is one every ~7 shots in the first 40 s, sparse in the middle (lore/night/town
  sections), and back in the climax (84–111). **None after 133 s.** Once the other town has
  drowned, nothing is left to watch.
- **Grammar:** "our side" shot (event happens / someone looks across) → binocular POV of the
  copy doing the same thing (5 cases are a direct A→B pair: 4→5, 13→14, 22→23, 25→27, 65→66).
  Often the narration line itself switches sides: "…across the water | Other Mr Lee trips…".
  The "someone raises binoculars, then POV" setup is explicit only 3 times (17→18, 57→58,
  82/83→84). Mostly the POV just follows the action shot.
- **What they show:** always the **far side**. Copies of characters facing the lens (medium /
  medium-close), a door with a wreath (insert), a porch. Subjects usually **look straight into
  the binoculars**, which is the reel's creepy motif.
- **Mask geometry** (720×1280, averaged over all binocular frames, static overlay):
  two slightly elliptical circles, centres (230, 537) and (490, 537), rx ≈ 220, ry ≈ 208 px.
  Visible area is x 10–710, y 328–746, centre line y = 537 (42 % of height, *above* frame
  centre). Overlap ≈ 160 px. The edge is soft: black→full brightness over ≈ 30–36 px, with an
  extra inner darkening. Everything else is pure black (#000). The caption stays at its usual
  y on the black below the circles. See `docs/img/binocular_mask.jpg`.
- **Content inside:** framed like a medium or medium-close shot with a flattened telephoto look
  **(est. vertical FOV 20–30°)**. Content zooms 1.04–1.10 behind the static mask (two shots
  have a slight pan).

## 6. Time of day, weather, interiors

| time | shots | seconds | where |
|---|---|---|---|
| day | 124 | 152.3 | everything else |
| night | 13 | 14.0 | 56.6–61.4 (house front, bedroom window), 82.9–92.1 (street, living room, Grandpa) |
| golden | 2 | 2.6 | 64.2–66.8 (Me with binoculars, warm POV) |
| dusk | 1 | 1.7 | 79.7 empty road ("nobody moved") |

Weather: clear 137, overcast 2 (flashback at 40.6 s and "22 hours" at 53.7 s), snow 1 ("by
winter", 54.6 s). The seasons pass in **three consecutive shots** (sunny → overcast → snow)
during the countdown. Interiors: 16 shots / 19.2 s (kitchen 6, living room 8, bedroom 2).
Exteriors are 89 %. Set usage: lake_dock 54, lake_far_shore 31, shore_water 16, street 10,
house_front 8, living_room 8, kitchen 6, lake_aerial 2, bedroom 2, park (gazebo) 2, road_night 1.

## 7. Faces and poses used

Subject faces (140 shots): no face visible or no subject 41, smile 20 (+2 smile with worried
brows), grin (open mouth) 12, worried 11, neutral 9, cry 9, scream 7, talk 6, sad 6, happy (^^) 5,
angry 4, scared 4, surprised 3, calm closed eyes 1.
Arc: smile/happy/grin dominate 0–50 s. Angry/worried/sad dominate 43–92 s. Cry/scream dominate
from 104 s. The **copies stay smiling** while our side screams (107 Other Mom smiles while Mom
cries).
Poses: stand 37, sit 27, binoculars 10, wade 10, walk 7, talk 6, hug 6, hold_sign 5, lie (the
"worm") 4, run 3, arms_up 2, fall 2, plus non-vocab handstand 2, watering 2, eat-worm 2.

## 8. Image ↔ word relation

**≈ 85 % of shots illustrate the spoken phrase literally (est.)**. The image shows the noun or
action in that shot's words, or what the narrator is looking at: "same houses" → aerial of houses;
"Mr Lee trips" → Mr Lee falling; "Christmas lights" → wreath on a door; "23 hours" → stopwatch;
"curtains shut" → night street. The rest (≈ 15 %) cover abstract sentences ("there's only one thing
off about them", "they were never copying us") with an establishing view of the far shore or a
reaction close-up. Key nouns get an **insert** (wreath, stopwatch, abandoned binoculars, sign).

## 9. Recurring visual motifs

- **The far shore seen across water** (31 shots): light-blue house with red door, dock, tiny people.
- **Binoculars**: held, raised (0.2 s arm-raise animation), POV mask, finally lying abandoned
  on the dock (shot 134).
- **The sign**: "HI ME!" (24–27) → "BYE ME" (110–111) → floating sign (118, 119, 140 = last image).
- **The worm** dance (22, 56, 58, 90–91) is the action that is copied.
- **Grandpa + stopwatch on the dock bench** (43–49, 59, 63, 79–81) works as the countdown.
- **Faces turned to the lens**: copies look into the camera/binoculars.
- **Mirror re-use**: the same staging is shown twice for "us" and "them" (82/83 lifting
  binoculars, 101/103 Mom running down the dock).

## 10. Ending staging (last 37 s)

133.7 → far town lined up, backs turned, walks into the lake (wide, high angle, line of
people) → only heads → the BYE ME sign floating over submerged bodies → empty still lake
(extreme wide) → our shore: villagers wade in crying (medium, close-ups with red open mouths) →
memory callback to Grandpa (yellow rule caption) → empty dock, abandoned binoculars → Mom, Me,
Toby walk in holding hands, water at knees → waist → chest (close-up, slight pull-out) → two
heads in the middle of the lake (wide high) → **final insert: the BYE ME sign floating, strong
push-in (1.13), 2.77 s**. The last word "ME" appears at 170.27 s and the video ends 0.46 s
later. The ending is not slow and has no silence or fade. The last shot is simply the longest
shot of the reel.

## 11. Audio

- Integrated loudness of the mix **−14.1 LUFS**, LRA 1.7 LU (very compressed).
- Speech rate: **757 words in 170.6 s = 266 wpm (4.4 words/s)**. That is fast, like a sped-up TTS
  at ≈1.3×. The earlier "165 wpm" figure came from incomplete 8 fps OCR. Caption word
  display time: median 0.20 s, p90 0.43 s, p99 0.60 s.
- **Pauses are tiny:** only 21 level dips ≥ 0.12 s (8 dB under median), median 0.16 s, max 0.24 s.
  Sentence ends get 0.12–0.25 s. Total "silence" is about 3 s in 170 s. Pauses are edited out
  (jump-cut audio).
- Music bed: level inside speech gaps is ≈ **−28 dB RMS vs −17.4 dB median with speech → voice
  ≈ 10 dB above the bed (est.)**. The bed never stops, and its level is constant over the whole
  reel (20 s windows: −16.6 to −18.5 dB overall).
- Music character **(est. from spectra)**: soft sustained pad / ambient. In the gaps the energy
  is mostly < 300 Hz (warm low pad) and > 3 kHz (airy shimmer). Chroma peaks E, G (G#, A):
  E-minor-ish. A beat tracker gives ≈ 123 BPM, but there is no clear percussion. Treat it as a
  slow, beatless or soft-pulse ambient bed that turns eerie, not a song.

## 12. Captions (burned in, one word at a time)

Measured at 720×1280 (see `docs/img/caption_crop.png`):
- **Position:** horizontally centred (text centre x = 359.5 ± 1 px). Ascender/cap top at
  y = 877–878, **baseline y ≈ 923**, descender bottom y ≈ 935. The baseline sits at **72 % of
  frame height**. This is the same in every shot, including binocular shots, where the text
  sits on the black mask.
- **Size:** cap height ≈ 45 px, x-height ≈ 33 px (x/cap 0.73). Font size ≈ 62–64 px at 720
  wide (≈ 4.9 % of height). Lowercase advance ≈ 30–33 px per character.
- **Weight/look:** bold neo-grotesque sans (Helvetica/Arial/Proxima-like). Double-storey a,
  straight-tailed y, stem ≈ 8–9 px. Closest free fonts: **Arimo Bold** (already in
  `assets/fonts`), Inter Bold, Montserrat SemiBold/Bold.
- **Outline and shadow:** solid black outline ≈ 3–4 px, plus a soft black shadow/glow
  (≈ 6–8 px blur, offset ≈ 2 px down) that darkens the background around the word.
- **Case:** as spoken, lowercase except proper nouns, sentence-initial "Other", "I", and "ME"
  (the sign text). There is no punctuation in the captions, ever. A number is written as a
  digit ("23", "5", "3"). One caption once held two words ("on to").
- **Timing:** a word appears at its spoken onset and **stays until the next word appears**,
  so there are no gaps, no blank frames and no fade/pop animation (instant swap). The first word
  slides in during the opening whip. The last word stays to the end.
- **Highlighted words** (fill colour replaces white; same outline):

| colour | hex | words (time) | meaning |
|---|---|---|---|
| yellow | **#F7DE72** | "whatever we do" (37.6), "they do one day later" (39.5), "there's only room for one town" (88.5), "whatever we do" (155.5), "they do one day later" (157.2) | Grandpa's quoted words (the rule and the prophecy) |
| blue | **#74CAF8** | "I don't want to" (104.9) | Toby's quoted words |
| pink | **#F7A5C0** | "it's okay baby" (125.5) | Mom's quoted words |

Rule: **direct speech is coloured by speaker**, while the speech tag ("Grandpa always says",
"he whispered") stays white. The narrator's own words and the sign texts (hi ME / bye ME) stay
white. Only 22 / 756 tokens (2.9 %) are coloured.
