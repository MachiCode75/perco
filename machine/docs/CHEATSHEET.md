# CHEATSHEET — everything needed to turn a story into a video (read this + docs/06, not docs 01–05)

## 1. Targets (6 references measured)
- Length **110–170 s**. Narration with the user-tuned default voice `narrator_ref` ≈ **3.35 words/s (≈ 200 wpm)** → words ≈ seconds × 3.35 (170 s ≈ 570 words).
- **1 shot per 1.2–1.5 s** → shots ≈ words ÷ 5.2 (630 words ≈ 120 shots). A shot = 2–11 words (median 5).
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
### 3.0 Show exactly what is said (user rule, v4 — the #1 quality criterion)
A human editor illustrates every line. A shot of a character standing there is NOT an illustration.
- **Every noun/action spoken is on screen in that shot**: "3 curtains" → 3 layered curtains (`opt:curtains=3`);
  "a sleep mask that says NOT LOOKING" → a mask with that text (`:+sleep_mask=NOT_LOOKING`); "he wears 2" → 2 masks;
  "fur on the pole" → `+fur_tuft@pole_top` framed close; "cookie" → the cookie; "tapped the window" → the tap.
- **Numbers and comparisons are literal**: "taller than the poles" → giant and pole in the same frame (`@by_pole`);
  "23 footprints" → a trail of footprints (+ a notebook card for the count).
- **Inserts** (`ins s:<prop or poi>`) on objects ≈ 15–25 % of shots; reaction close-ups ≤ 20 % (only on fear/emotion words).
- **Motion in every shot**: someone walks (`id^mark`), acts (tap knock hammer pull_curtain peek look_around rock
  offer count bend step spread…), a prop animates (curtains closing, eyes approaching/closing, hand tapping), or the
  camera moves. No dead "stand" shots.
- **Clear geography**: name the places (`places:` my_room / bea_room / …: distinct variants), establish each place
  with est/wide the first time, show exterior → interior when entering a building, keep "our house" identical
  everywhere (`home:`), blackout = `dark` (no lit window, no street light) whenever the power is out.
- Interactions across a window: inside shots use `+giant_hand@outside` / `+window_face@outside`; outside shots
  use the creature at `by_home`/`neighbor1` bending to the window.
- `screenplay.py` prints `WARN … says 'X' but nothing shows it → hint` (data/visual_lexicon.json) and
  `first shot in '<place>' …`: **fix every coherence WARN** (only a deliberate absence — "the cookie was gone" —
  may stay).

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
title: …            lang: en|fr          voice: narrator_ref (default)       hold: 0.8
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

v4 additions (full list in the docstring of `pipeline/screenplay.py`):
```
home: wall=#9fc4e8 roof=#3f4a63 door=#c8323c trim=#ffffff      # our house, same in house_front/suburban_street/rooftops_sky
speak: 2:59=2 59 AM                                            # voice reading of a caption token (default H:00 → "H AM")
places:
my_room   bedroom variant=boy curtains=3
bea_room  bedroom variant=girl curtains=3
== bea_room night dark                                         # place + time + dark (power off) + k=v options
She leaves a cookie | med bea:offer:cookie>window
on her windowsill.  | ins s:sill opt:sill=cookie push
Tap. Tap. Tap.      | ins s:giant_hand +giant_hand@outside:pose=tap
Dad walks in.       | wide dad:walk@D^A                        # ^ = walk to a mark/poi/actor during the shot
He wears 2.         | med mayor:wave:+sleep_mask=NOT_LOOKING:+sleep_mask2=NOT_LOOKING
Click.              | ots bea:carry:flashlight=on >outside
At the end of the street, | cam:to_forest                      # a named camera hint of the set
```

## 5. Engine lessons
- Places/landmarks: subject `set` with est/wide/aer/low (uses the set's camera hints); never a `poi:`
  subject with wide/low for big objects.
- Crowds: street → `est`; lake_dock/shore → `wide`. Interiors fit ~3 actors.
- `ots` needs `>target`. Two-shot: two actors, second = partner.
- Voice: `narrator_ref` (default since v4.1: Chatterbox cloned from the user's own original reel, settings tuned by the user in the voice tuner artifact; EN; synthesis ≈ 6× real time). `narrator_c2` = previous voice. Fallback/FR: `kokoro:young_storyteller` / `kokoro:fr_storyteller`.

## 6. Procedure (cheap path)
1. Write `story.screen` directly (the script = the spoken column). 2. `python3 pipeline/screenplay.py
episodes/<slug>/story.screen` → fix ERRORs. 3. `python3 pipeline/validate.py episodes/<slug>/episode.json`.
4. Storyboard once at small size, fix only broken shots. 5. `python3 pipeline/make_video.py
episodes/<slug>/episode.json --workers 3` in the background. 6. Check `out/<slug>_contact.jpg` + QA json,
send the MP4.
