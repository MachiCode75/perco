# post/ — final assembly, captions, mix, QA

```
python3 post/assemble.py --episode episodes/<slug>/episode.json --timeline build/<slug>/timeline.json \
   --words build/<slug>/audio/words.json --shots build/<slug>/shots \
   --narration build/<slug>/audio/narration.wav --music build/<slug>/audio/music.wav --out out/<slug>.mp4
python3 post/qa.py --video out/<slug>.mp4 --timeline build/<slug>/timeline.json \
   --words build/<slug>/audio/words.json --out out/<slug>_qa.json
```

| File | Role |
|---|---|
| `assemble.py` | validate → captions → audio mix → one ffmpeg graph (concat, scale, binocular mask, libass) → verify → contact sheet |
| `captions.py` | words.json + episode → ASS (1080×1920), one event per word, measured reference style |
| `contact_sheet.py` | middle frame of every shot, tiled with id / time range / BINO flag → `out/<slug>_contact.jpg` |
| `qa.py` | format, frame count, durations, A/V sync, loudness, mix balance, black frames → `out/<slug>_qa.json` (exit 1 on error) |
| `caption_compare.py` | developer tool: reference frame vs our caption, side by side → `docs/img/post_captions_compare.jpg` |
| `requirements.txt` | numpy, scipy, soundfile, Pillow, fonttools (+ brotli to convert woff2) |

Outputs: `out/<slug>.mp4` (H.264 High yuv420p CRF 18 preset medium, 1080×1920 @ 30, BT.709 tags,
AAC 192 kb/s 44.1 kHz stereo, `+faststart`) and `out/<slug>_contact.jpg`. Work files are in
`build/<slug>/post/` (`captions.ass`, `concat.txt`, `graph.txt`, `assemble.stamp`).
A second run with unchanged inputs and code does nothing (`--force` rebuilds). Errors → exit 1 with a message.

## Assembly steps
1. **Validate**: timeline ids == episode ids; words.json tokens == episode narration (`pipeline/text.py`);
   every `shots/<id>.mp4` exists, is H.264 yuv420p 720×1280 @ 30 with exactly `frames` frames (counted
   packets). An error of ≤ 3 frames, or a wrong size/fps/format, is repaired (re-encode, trim or clone the
   last frame) with a WARNING; larger errors stop the run unless `--lenient`. The narration and the last
   word must end before the video does.
2. **Captions** → `build/<slug>/post/captions.ass` (see below).
3. **Audio** (numpy, deterministic): narration → −16 LUFS (measured as dual-mono stereo); music looped
   with a crossfade if too short, trimmed to the video, fade-in 0.4 s and fade-out 2 s, set to
   **voice −6 LU** (`--music-rel`), **ducked 4 dB** (`--duck-db`) while the narrator speaks (10 ms RMS
   envelope of the narration, gaps < 250 ms bridged, attack 80 ms / release 350 ms); then a look-ahead
   limiter on 4×-oversampled peaks, repeated until the gain to −14 LUFS keeps the true peak under the target,
   so the final **two-pass `loudnorm` (I −14, TP −1.5, linear)** stays linear. AAC adds ~0.3 dB → ≤ −1 dBTP.
4. **Video**, one ffmpeg command: concat demuxer → `setpts=N/(30*TB)` (re-stamps every frame: no
   drop or duplicate) → `scale=1080:1920` lanczos with BT.601 → BT.709 → `overlay` of
   `assets/jumelles_1080x1920.png` with `enable='between(n,a,b)+…'` (exact frame ranges of the
   `binoculars: true` shots, neighbours merged) → `ass=…:fontsdir=assets/fonts` → x264 + AAC.
   The caption is drawn after the mask, so on binocular shots it sits on the black below the holes, like the reel.
5. **Verify** the output frame count == sum of timeline frames and the size; write the contact sheet.

Speed: about 25–30 fps encoding at 1080×1920 with preset medium on 4 shared cores (about 3–4 min for a 170 s
episode); the audio steps take about 10 s.

## Caption style (measured on the reel, see `docs/img/post_captions_compare.jpg`)
Measured on the 720×1280 reel at 30 fps; values below are at 1080×1920 (×1.5).

| Parameter | Reference measurement | Ours |
|---|---|---|
| Font | Arial Bold (21 free fonts fitted on 27 words: Arimo/Liberation best, mean mask IoU 0.79 with anisotropic fit, 0.74 isotropic; width-derived size constant across words, CV 0.7 % → same advance widths as Arial) | **Arimo Bold** (OFL, from npm `@fontsource/arimo` 5.3.0, latin + latin-ext woff2 merged into `assets/fonts/Arimo-Bold.ttf`, licence `assets/fonts/Arimo-OFL.txt`) |
| Size | em 61.7 px @720; 'lake' fill 114 × 46 px | ASS `Fontsize 134` (em 92.6 px); 'lake' fill 304–417 × 877–922 at 720 vs reference 304–417 × 877–923 |
| Position | centred at x = 360; baseline y = 923 / 1280 | `\an2\pos(540, 1384.5 + 0.2652 × size)` → baseline 1384.5 / 1920 |
| Fill | white (253,252,253) | `#FFFFFF` |
| Outline | black, about 3.9 px, crisp, about 90 % opaque | 5.8 px, `\blur0.6`, alpha 10 % |
| Shadow | black, soft, offset about (+1.7, +4.5) px, 4 px ramp | separate layer: same text + border, offset (+3.4, +7.5), `\blur3`, 90 % opacity |
| Colour words | yellow (250,222,111), blue (112,202,249), pink (251,164,193); whole key phrases, not names ("Grandpa", "Toby" are white) | palette `yellow #F9DE72`, `blue #74CBFA`, `pink #FBA4C1` (+ green, orange, red); fills measured back from our render: (248,219,114), (114,202,250), (250,163,193) |
| Text | case kept, edge punctuation removed, inner apostrophes kept (`don't`, `Mrs`, `twice`) | same (`captions.caption_text`) |
| Animation | none: hard switch, constant size | none |

Halo extents (dark outline + shadow, px @720, top/bottom/left/right), reference → ours:
'lake' 5/10/4/7 → 5/10/5/6; 'don't' 5/9/5/8 → 5/9/5/8; 'Grandpa' 5/9/–/7 → 5/10/5/7.
Run `python3 post/caption_compare.py` to rebuild the image and print these numbers. Add `--style outline=6`
and similar to try other values, or `--calibrate` after changing the font.

### Timing rules (30 fps scan of the caption band vs speech onsets after 137 pauses)
- A caption switches **on the word start**: median offset 0.000 s, IQR −0.033…+0.040 s (`lead` 0).
- **No blank between words**: a word stays until the next one appears, also through pauses (0.2 to 1.3 s in the
  reel). Pauses longer than `hold_gap_max` (2 s) clear the caption 0.6 s after the word ends.
- Nothing before the first word; the **last word stays to the end** of the video (`last_hold` null).
- Minimum time on screen 0.10 s (3 frames); the shortest reel words show for about 4 frames.
- Event times are frame-aligned (start frame k → floored centiseconds), so the change lands exactly on a frame.

### Episode options (`captions` block; only `highlight` is in the §8 contract)
```json
"captions": {
  "highlight": ["one day later", "Toby", {"text": "find out", "color": "pink"}],
  "highlight_color": "cycle",      // or a palette name / "#RRGGBB" for all plain entries
  "auto_proper_nouns": false,      // colour capitalised mid-sentence words (the reel does NOT)
  "palette": {"yellow": "#F9DE72"},
  "lead": 0.0, "hold_gap_max": 2.0, "last_hold": null
}
```
Entries are words or phrases, matched on normalised tokens. Each plain entry takes the next palette colour
(yellow, blue, pink, …), so it keeps the same colour every time it occurs, like the reel's yellow key line.

## Mix levels (reference reel measured)
Reel: −14.1 LUFS integrated, −0.7 dBTP, LRA 1.7 LU. Full-band level in speech frames is 7.2 dB above pause
frames (music only). The < 100 Hz band (mostly music) drops 3.3 dB under speech, so the music is lightly ducked.
Defaults: voice −16 LUFS, music −6 LU under the voice, 4 dB duck under speech, final −14 LUFS / ≤ −1 dBTP.
On the synthetic test this gives speech−pause 8.1 dB and LRA 1.5 LU. If `audio/README.md` recommends
other levels, pass them with `--music-rel` / `--duck-db` (or change the defaults).

## QA (`qa.py`)
Errors: codec/pix_fmt, 1080×1920, 30/1 fps, AAC 44.1 kHz stereo, moov before mdat, frame count == timeline,
video duration == timeline (±1 frame), audio == video (±50 ms), narration fits, stream start offset ≤ 1 frame,
**content A/V lag** (speech-band envelope cross-correlation of the final audio vs `narration.wav`) ≤ 40 ms,
integrated loudness −14 ± 1 LUFS, true peak ≤ −1 dBTP, no black segment ≥ 0.5 s.
Warnings: audio bitrate, loudness ±0.5, speech-vs-pause difference outside 4–14 dB. Info: LRA, ending hold.

## Test with synthetic inputs
```
python3 episodes/_post_test/make_inputs.py     # espeak-ng narration (exact word timings), real pipeline/timing.py,
                                               # testsrc2 shots with frame counters, procedural music
python3 post/assemble.py --episode episodes/_post_test/episode.json --timeline build/_post_test/timeline.json \
  --words build/_post_test/audio/words.json --shots build/_post_test/shots \
  --narration build/_post_test/audio/narration.wav --music build/_post_test/audio/music.wav --out out/_post_test.mp4
python3 post/qa.py --video out/_post_test.mp4 --timeline build/_post_test/timeline.json \
  --words build/_post_test/audio/words.json --out out/_post_test_qa.json
```
The shot clips print their own frame number. At the 003 → 004 cut, output frame 297 shows "SHOT 003 frame 54"
(its last frame) and frame 298 shows "frame 0" of 004 with the mask on. No frame is lost or duplicated.
