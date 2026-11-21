#!/usr/bin/env bash
# Install everything the video machine needs in a fresh cloud session (idempotent).
# Models (Kokoro TTS, ~400 MB) download automatically on first TTS run into machine/models/.
set -e
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install --no-audit --no-fund
pip install -q -r audio/requirements.txt -r post/requirements.txt 2>&1 | grep -v "WARNING: Running pip as" || true
command -v ffmpeg >/dev/null || (apt-get update -q && apt-get install -y -q ffmpeg)
node -e "require('./engine/browser').loadPlaywright()" 2>/dev/null && echo "playwright: ok" || echo "playwright: MISSING (Chromium/Playwright are pre-installed in Claude cloud sessions)"
[ -f data/vocab.json ] || node pipeline/vocab.js
echo "video machine ready"
