# Audio module

Narration (TTS + word timings) and the ambient music bed. Contracts: ARCHITECTURE.md §8–§9.
Install: `pip install -r audio/requirements.txt` (models download themselves on first use into
`models/` — git-ignored — from GitHub releases only).

```
python3 audio/tts.py   --episode episodes/<slug>/episode.json --out build/<slug>/audio \
                       [--provider kokoro|elevenlabs|espeak] [--voice …] [--speed 1.0] [--wpm 255] [--pitch st]
python3 audio/music.py --duration 172 --mood calm_to_eerie --seed 1 --out build/<slug>/audio/music.wav [--file user.mp3]
python3 audio/validate_timing.py --dir build/<slug>/audio [--asr]      # timing accuracy report
python3 -m unittest discover -s audio/tests                           # offline unit tests
```

Outputs of `tts.py`: `narration.wav` (mono 44.1 kHz 16-bit, **−16 LUFS integrated, true peak ≤ −1 dBTP**,
lookahead-limited), `words.json` (§9: `text` tokens == `pipeline/text.words(narration(episode))`, asserted),
`tts_info.json` (provider, voice, engine speed, measured wpm, loudness).

## Episode `voice` options

| key | default | meaning |
|---|---|---|
| `provider` | `kokoro` | `kokoro` · `elevenlabs` · `espeak` |
| `voice` | preset by language | kokoro preset / voice id / blend `"am_fenrir*0.7+am_michael*0.3"`; ElevenLabs name or voice_id |
| `wpm` | **255** | target overall words/min incl. pauses (reference reel ≈ 266). `0` = raw engine speed |
| `speed` | 1.0 | multiplier on `wpm` (1.1 → 280 wpm) |
| `pitch` | preset | kokoro only: semitones, tape-style (resampling: raises pitch *and* formants = younger) |
| `sentence_pause` / `ellipsis_pause` / `paragraph_pause` / `clause_pause` | 0.18 / 0.24 / 0.26 / 0.10 s | silence inserted at chunk joins (reference gaps: median 0.16 s, max 0.24 s) |

Paragraph = blank line inside a `say`. Pace is exact: the duration predictor is run first and the engine
speed is bisected so the speech fits `words/wpm − pauses`; the residual is absorbed by scaling the pauses
(bounded 0.6–1.4×). Measured: 255.0 wpm on every test.

## Providers

### kokoro (default — local, free, Kokoro-82M ONNX)
* Files: `models/kokoro/voices-v1.0.bin` + `kokoro-v1.0-timed.onnx` (stock model + an extra `duration`
  output) + `kokoro-v1.0-durf.onnx` (encoder + duration predictor only, for pacing). Derived once from
  `kokoro-v1.0.onnx` (downloaded from the kokoro-onnx GitHub release, deleted after derivation).
* Synthesis per sentence (sentences < 4 words are merged with the next one, sentences > 40 words split at a
  clause mark), silence trimmed by energy, pauses inserted, chunks joined. ~0.3–0.7× real time on 2 threads
  (`--threads` / `$AUDIO_THREADS`).
* Phonemes: espeak-ng (bundled with `espeakng-loader`), `language_switch=remove-flags` (no "(en)" garbage in
  French).

**Voice choice (cannot listen → measured).** The reference narrator measures F0 ≈ 185–205 Hz and formants
F1/F2/F3 ≈ 615/1900/3400 Hz — a *young/pitched-up* male voice (adult Kokoro males: F0 115–155 Hz,
F3 ≈ 2600–2750 Hz). Ranking every English voice, blends and pitch shifts by cosine similarity of two
speaker-verification embeddings (NeMo TitaNet + WeSpeaker ResNet34, sherpa-onnx) against 4 reference
excerpts (ref-vs-ref = 0.98):

| candidate | similarity |
|---|---|
| **am_fenrir 0.7 + am_michael 0.3, +4.5 st → preset `young_storyteller` (EN default)** | **0.83** |
| am_fenrir +4.5 st | 0.83 |
| am_fenrir 0.6 + af_sky 0.4, +4 st | 0.82 |
| am_puck +5 st | 0.80 |
| am_michael +0 st (natural adult) | 0.34 |
| best un-shifted voice (am_michael·am_puck blend) | 0.36 |

The michael share makes the blend calmer (F0 spread 3.9 st vs 4.6 for pure fenrir). Other presets:
`teen_storyteller` (same blend +3 st), `adult_calm` (am_michael, no shift — most natural, not young).
Any raw voice works too (`am_puck`, `bm_george`…); `pitch` defaults to 0 for raw voices — note the
ARCHITECTURE example `"am_michael"` gives the adult voice; omit `voice` (or use `young_storyteller`) for
the reference-like narrator.

**French:** Kokoro has a single French voice, `ff_siwis` (female, native) → preset `fr_storyteller`
(FR default). `fr_young_male` (ff_siwis 0.4 + am_fenrir 0.6, +3 st) is experimental (possible accent;
unverified by ear). For a native young male French narrator, use ElevenLabs.

### elevenlabs
`POST {ELEVENLABS_BASE_URL or https://api.elevenlabs.io}/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128`
with `model_id` (`eleven_multilingual_v2` default, `ELEVENLABS_MODEL=eleven_v3` possible), `voice_settings`
(stability 0.55, similarity 0.75, `speed` = pace multiplier clamped 0.7–1.2), `previous_text`/`next_text`
for continuity (not for v3). Chunks = paragraphs ≤ 220 words. Character alignment → word times
(first/last alphanumeric char of each token; difflib fallback if the returned characters differ).
Responses cached in `<out>/.cache/elevenlabs/` (re-runs are free). Retries on 429/5xx.

**To enable:** the host `api.elevenlabs.io` must be allowed by the network policy, and either
`export ELEVENLABS_API_KEY=…` (sent as `xi-api-key`) or let the egress proxy inject that header (the
request is sent without a key when the variable is unset). Then
`"voice": {"provider": "elevenlabs", "voice": "will"}` (names: will, liam, chris, charlie, brian, eric,
daniel, george, adam, josh, antoni — premade IDs, verify with `GET /v1/voices`; any other string is used
as a voice_id). Optional env: `ELEVENLABS_OUTPUT_FORMAT` (`pcm_24000`, …), `ELEVENLABS_LANGUAGE_CODE`.
Untested against the live API (blocked); parsing is unit-tested with synthetic responses.

### espeak (tests only)
libespeak-ng via ctypes (bundled lib; apt `espeak-ng` not needed). Word times = espeak's own WORD events.

## Word timing method and measured accuracy

Kokoro is non-autoregressive: its duration predictor assigns every phoneme token an integer number of
25 ms frames and the decoder is driven by exactly that alignment. We expose this tensor as an extra ONNX
output, phonemize each chunk in context, map phoneme groups back to the narration tokens with a small DP
(handles digits → several words, dropped symbols, merges), and take each word's first/last phoneme frame.
Corrections measured on the audio: sound fades in ≈ 2 frames before the predicted boundary (−45 ms lead
applied); the first word of each chunk is snapped to its detected energy onset.

`validate_timing.py`: (A) words after ≥120 ms silence vs. detected energy onset (exact ground truth);
(B) every word vs. an independent CTC recogniser (NeMo conformer, sherpa-onnx; its own ±40 ms frame
quantisation is included in the error).

| test | (A) median / p90 abs error | (B) median / p90 abs error (bias) |
|---|---|---|
| EN test, young_storyteller, 255 wpm | 13 / 28 ms (n=9) | 30 / 64 ms (−12 ms), 49/55 words |
| 192-word story, young_storyteller, 255 wpm | 13 / 13 ms (n=25) | 27 / 62 ms (−2 ms), 185/192 words |
| 192-word story, young_storyteller, 165 wpm | 36 / 89 ms (before onset snap) | 19 / 64 ms (−1 ms) |
| 192-word story, adult_calm, 165 wpm | 12 / 26 ms | 21 / 62 ms (−1 ms) |
| FR test, ff_siwis, 255 wpm | 12 / 22 ms (n=11) | (EN recogniser only) |
| espeak EN | 9 / 10 ms | 42 / 83 ms (robot voice: ASR worse) |

→ word-start error ≈ 20–30 ms median, < 80 ms at p90: well under the 80 ms median target.

## Music (`music.py`)

Procedural, numpy/scipy only, deterministic per `--seed`, beatless: detuned wavetable pad on a slow chord
progression (8–11 s per chord, 3.5 s crossfades), low drone, airy band-passed noise top with slow swells,
sparse soft celesta / music-box / piano figures (6 ms attacks, no clicks), generated stereo IR convolution
reverb (RT60 3.6–5 s), 2.5 s fade-in, up to 5 s fade-out. Output 44.1 kHz stereo **−20 LUFS**, TP ≤ −1.
Spectrum tuned to the reference bed (energy mostly < 300 Hz, little above 1 kHz). ~0.6× real time.

| mood | key / colour |
|---|---|
| `calm` | E minor: Em9 – Cmaj7 – G6 – Dsus2, celesta |
| `calm_to_eerie` (default) | `calm` for 65 %, then E: Em(maj7) – Caug – F phrygian – Edim, tritone drone, wider detune, sparse music box with minor-2nd rubs |
| `mystery` | E: Em(add9) – Cmaj7#11 – Am6 – B7sus4, music box |
| `sad` | A minor: Am9 – Fmaj7 – Cadd9 – Em7, soft piano |
| `hopeful` | C: Cadd9 – Am7 – Fmaj7 – G6, brighter celesta |
| `tense` | D: Dm – Bbmaj7#11 – D phrygian – A7sus4, slow 0.55 Hz throb, heavy detune |

`--file user.mp3`: decoded with ffmpeg, looped with 2 s crossfades, trimmed, 1 s / 3 s fades, −20 LUFS.

## Recommended final mix (for `post/`)

Reference reel (measured with ffmpeg ebur128 + gap analysis): **−14.1 LUFS integrated, LRA 1.7 LU,
true peak −0.7 dBTP**. Voice-only frames ≈ −11.8 LUFS(K) / −15.6 dB RMS; music-only gaps between phrases ≈
−25 dB RMS (−19 LUFS(K) incl. voice tails) → **music ≈ 9–10 dB under the voice**; the <80 Hz band is only
~1.5 dB lower under speech than in gaps → essentially no ducking. Mix RMS (400 ms): median −17, p10 −19.5.

1. narration.wav as delivered (−16 LUFS); music.wav (−20 LUFS) at **−6 to −7 dB** (≈ −26.5 LUFS, i.e.
   10 LU under the voice). Optional light sidechain duck ≤ 2 dB (attack 50 ms, release 400 ms) — never more,
   the bed must stay audible in the gaps.
2. Sum, then loudness-normalise to **−14 LUFS** with a true-peak limiter at **−1 dBTP** (target LRA ≈ 2 LU).
   e.g. ffmpeg: `[1:a]volume=-6.5dB[m];[0:a][m]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=4`.
3. The music should start with the video (2.5 s fade-in already baked in) and end with the hold.

Test outputs: `build/_audio_test/audio/{narration.wav,words.json,music.wav}` (EN, 55 words, 13.5 s,
255 wpm, −16.0 LUFS, LRA 1.5), `build/_audio_test/audio_fr/` (FR, 67 words, 16.3 s, 255 wpm, −16.2 LUFS),
`build/_audio_test/audio_espeak/`. Music test: 30 s calm_to_eerie, −20.0 LUFS, LRA 2.6, peak −7.9 dBFS.

## Limitations
* Voice choice is by objective proxies (pitch, formants, speaker embeddings); nobody has listened yet —
  audition `young_storyteller` vs `teen_storyteller` vs `adult_calm`.
* At 255 wpm the young preset runs Kokoro at speed ≈ 1.15–1.3 (after the +4.5 st resample); it stays
  intelligible to the ASR (96–98 % words recognised) but is fast by design (reference ≈ 266 wpm).
* Prosody resets per sentence (each sentence synthesized separately); no cross-sentence intonation.
* ElevenLabs path is untested live. French has only one native Kokoro voice (female).
