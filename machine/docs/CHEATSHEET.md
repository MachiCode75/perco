# CHEATSHEET — everything needed to turn a story into a video (read this + docs/06, not docs 01–05)

## 1. Targets (6 references measured)
- Length **110–170 s**. Narration **≈ 4.45 words/s (268 wpm, like the references)** → words ≈ seconds × 4.45 (170 s ≈ 750 words).
- **1 shot per 1.2–1.5 s** → shots ≈ words ÷ 5.2 (750 words ≈ 140 shots). A shot = 2–11 words (median 5).
- Hard cuts only; the engine adds the slow zoom. Cut just **before the payoff word** ("…a sign that says | HI ME").
- No music (user adds it). Captions are automatic (one word, white, ~70 % height).

## 2. Writing — READ `docs/06-storytelling.md` (the story engine, 1 page) and fill its §9 template first
- Open with **"In this town, <impossible rule as a boring fact>."** (6/6 references).
- Order: rule → the town copes (3 rituals with numbers + a comic townsperson + a local saying) →
  **attachment** (little sibling / pet / friend / parent ritual shown by small acts) → hero's stake →
  **"Then I started noticing things."** + 3–5 seeds → escalation → hero **breaks the taboo** (fast,
  onomatopoeia beats "Tug. Tug. Tug.") → **twist "X was never Y. It was Z."** + "That's why…" paying the
  seeds → payoff on the loved one → **last line = callback to an early line, inverted/completed**.
- Voice: kid 9–12, first person, deadpan, numbers as digits, ≤ 5 short iconic quotes (repeat one later),
  run-on action sentences + 1–3-word punches. No moral, nothing after the sting.
- Every sentence must be **picturable**: a cast member doing one visible action in a known set; seeds
  that are documents become text cards.

## 3. Visual grammar
- Hero of the channel (use unless the story says otherwise): `me kid spiky #f2d232 | stripes_h #e7c43f #151515 | pants #151515`.
- The **creature/anomaly is the star**: show it big (low angle, looming over houses, `rooftops_sky`),
  plus close-ups of its face; reveal gradually (silhouette/far → closer → face).
- Creatures (`<key> creature <id>`): `furry_giant` (≈12 tall, wide grin), `sky_face` (moon face, place
  on a high mark/`rooftops_sky`, `scale` 4–8), `shadow_eyes` (many glowing eyes), `tall_thin`, `stretched`
  (elongated version of a cast look, creepy_grin), `doll`, `scarecrow`. Poses `loom reach lean walk`.
  Scary faces for anyone: `creepy_grin wide_eyes hollow teeth blank`; `eyes glow|hollow|many`.
  Stage giants BEHIND the subject (never between subject and camera). In `rooftops_sky` put the giant on
  `@giant` (or sky_face on `@sky`) and use `low` or `cu`/`xcu` (its `est` view frames the houses only).
- Framing mix: med ~40 % · wide/est ~20 % · mcu ~13 % · cu ~10 % · ots/two/low/ins/aer the rest.
  ~3/4 of character shots face camera. Faces change on the emotional word.
- POV masks 5–15 % when someone watches/peeks/remembers: `bino`, `pov:vignette`, `pov:keyhole`, `pov:peephole`.
- 2–5 **text cards** per story (notes, signs, plaques, screens): `card:notebook text="…"`.
- Light = mood: day (normal) → golden/dusk (dread) → night (horror). Show seasons with `w:snow`.
- Reuse 4–7 places; establish each new place with `est` once.

## 4. Screenplay format (`episodes/<slug>/story.screen` → `python3 pipeline/screenplay.py …`)
```
title: …            lang: en|fr          voice: young_storyteller | edge:<voice>       hold: 0.8
cast:
<key> <build> <hair> <#hair> | <shirt pattern> <#c1> <#c2> | <pants style> <#c> | <accessories…>
<key> creature <id> | scale 4 | eyes glow #ffd84a          # creatures
<key> adult bun #222 | cardigan #f0a0b0 | pants #334 | stretch arms=2 legs=1.6   # creepy elongated
== <set> <time> [weather]   # scene header: EVERY following shot uses this set until the next header
<spoken words> | <directives>                                # one line = one shot
```
Directives: framing `est wide xwide aer med mcu cu xcu ots pov two ins low high back` · move `push pull
panl panr drift orbit tiltu tiltd shake` · actor `id[:pose][:face][:prop][@mark][>facing][~depth]`
(first actor = subject; `extra`, `extra2` = random townsfolk; `sign=HI_ME!`) · `>poi` shot target ·
`crowd:12:pose:face>poi@area` · `bino` / `pov:<mask>` · `card:<style> text="…" title="…" drawing=<id>` ·
`q:<speaker>` colours the quoted words · `t:`/`w:`/`set:` overrides · `s:` subject override.
Exact ids: `data/vocab.json` (sets → marks, pois, crowd areas; FACES, POSES, PROPS_HELD, CREATURES…).

## 5. Engine lessons
- Places/landmarks: subject `set` with est/wide/aer/low (uses the set's camera hints); never a `poi:`
  subject with wide/low for big objects.
- Crowds: street → `est`; lake_dock/shore → `wide`. Interiors fit ~3 actors.
- `ots` needs `>target`. Two-shot: two actors, second = partner.
- Voice: EN `young_storyteller` (Kokoro) or the chosen Edge voice; FR `fr_storyteller`.

## 6. Procedure (cheap path)
1. Write `story.screen` directly (the script = the spoken column). 2. `python3 pipeline/screenplay.py
episodes/<slug>/story.screen` → fix ERRORs. 3. `python3 pipeline/validate.py episodes/<slug>/episode.json`.
4. Storyboard once at small size, fix only broken shots. 5. `python3 pipeline/make_video.py
episodes/<slug>/episode.json --workers 3` in the background. 6. Check `out/<slug>_contact.jpg` + QA json,
send the MP4.
