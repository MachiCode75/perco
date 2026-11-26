# perco — handoff notes for Claude (read first)

Written at the end of a long cloud session so a new session (cloud or the user's PC) starts with the same context.

## How to work with this user
- Reply in **French**, short and concrete. The user is not a developer: explain steps plainly when they ask how to do something.
- The user's Claude usage is **limited**. Do not run workflows or spawn agents unless they ask. Run long jobs in the background,
  without polling. Read only the docs you need. Never re-generate what is already cached.
- Ask before spending paid credits (ElevenLabs). Test with 2–3 sentences, not full scripts.
- The user declined to give a Gemini API key. Do not ask for one again.

## Repository map
- `machine/`: the video machine (story → vertical Roblox-style horror reel, narrated). Entry point: the `video-machine` skill
  (`.claude/skills/video-machine/SKILL.md`) and `machine/docs/CHEATSHEET.md`. `machine/build/` and `machine/out/` are not in git.
- `danse-test/`: a separate one-off test (three.js dance on a Roblox-style platform). Keep it separate from `machine/`.
- `recherche/`: research notes.

## Standing rules for videos
- Never copy a reference reel's story; take only its production style. Held-out reference sentences are for voice A/B tests only.
- No music bed unless asked (the user adds music).
- Never use time-varying pitch DSP on the voice (rubberband and similar). The user found it "affreusement robotique".
  Plain speed-up with the pitch rising (`asetrate`) is fine.
- Check outputs (frames, QA json, listening) before claiming success.

## Narrator voice: PINNED (2026-11-26)
- Preset `narrator_adam` in `machine/audio/voices.json`. Listen: `machine/assets/voice/narrator_adam_sample.mp3` (the user said "PARFAITE").
- Recipe: ElevenLabs premade voice "Adam - Dominant, Firm" (`pNInz6obpgDQGcFmaJgB`), model **`eleven_v4`**, default voice settings,
  then played **×1.3 faster with the pitch rising** (`ffmpeg -af asetrate=44100*1.3,aresample=44100`).
  This is how the user's original reels were made. Measured speaker similarity: 90 % (the reference ceiling is 92.5 %).
  Local clones (Chatterbox, F5-TTS) only reached about 83–87 %, and the user found them flat.
- **Not yet wired into the pipeline.** Next step, once the user says go:
  - Add an `elevenlabs` provider to the TTS step, keeping the sentence grouping and timings the pipeline already uses.
  - Cache each sentence by (text, voice, model), so a re-render never pays twice.
  - Make `narrator_adam` the default voice.
- Budget: Starter plan, 40 000 credits/month. 1 credit per character on every model, so about 3 500 credits per 2 min 40 episode.
- API key:
  - Cloud sessions: a network secret on `api.elevenlabs.io` (header `xi-api-key`). Requests send a dummy key, and the proxy injects the real one.
  - On the user's PC: `ELEVENLABS_API_KEY` in `/.env`, which is gitignored.
  - Never print or cat `.env`. Never ask for the key in chat.

## Voice study (finished, kept for reference)
- Scripts: `machine/audio/experiments/voice_study/`. Data lived in `machine/build/voice_study/` (cloud only, not in git).
- Tuner artifact: https://claude.ai/artifact/HGPYPjK9pfzaK5zDbBwr73. It is superseded by the ElevenLabs voice.

## Episodes
- `the-3am-neighbor` v4 is done and the user praised it. `the-13th-bell` also exists.

## Running on the user's PC (Windows: Ryzen 9950X3D, 32 GB, RTX 5070 Ti)
- Prefer WSL2 (Ubuntu), then run `cd machine && bash setup.sh`.
- The RTX 5070 Ti (Blackwell, sm_120) needs PyTorch built for CUDA ≥ 12.8 (cu128 wheels). Older wheels fail on this GPU.
- Rendering currently forces software WebGL (SwiftShader flags in `machine/engine/browser.js` and the `engine/tools/*` renderers).
  On the PC, try GPU WebGL instead and compare a test frame before switching.
- The cloud branch was `claude/instagram-video-research-dkzgo0`. Ask the user which branch to use locally.
