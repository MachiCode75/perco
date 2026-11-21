"""ElevenLabs provider: POST /v1/text-to-speech/{voice_id}/with-timestamps.

API key: env ELEVENLABS_API_KEY if set (sent as `xi-api-key`); otherwise the request is sent without
a key so that an egress proxy can inject it. Base URL override: env ELEVENLABS_BASE_URL.
Responses are cached in <out>/.cache/elevenlabs/ (re-runs cost nothing).
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

import audiolib as al

# Premade voices (names → ids). Any other string is used as a voice_id as-is.
VOICES = {
    "will": "bIHbv24MWmeRgasZH58o",     # young American male, relaxed — default suggestion
    "liam": "TX3LPaxmHKxFdv7VOQHJ",     # young American male, articulate
    "chris": "iP95p4xoKVk53GoZ742B",
    "charlie": "IKne3meq5aSn9XLyUdCD",
    "brian": "nPczCjzI2devNBz1zQrb",
    "eric": "cjVigY5qzO86Huf0OWal",
    "daniel": "onwK4e9ZLuTAKqWW03F9",
    "george": "JBFqnCBsd6RMkjVDRZzb",
    "adam": "pNInz6obpgDQGcFmaJgB",
    "josh": "TxGEqnHWrfWFTfGW9XjX",
    "antoni": "ErXwobaYiN019PkySvjV",
}
DEFAULT_VOICE = "will"
DEFAULT_MODEL = "eleven_multilingual_v2"


def alignment_to_word_times(text, words, alignment):
    """Character alignment → [(start, end) | None] for each token of `words`.

    `text` must be " ".join(words) (what was sent). `alignment` is the response's
    {"characters": [...], "character_start_times_seconds": [...], "character_end_times_seconds": [...]}.
    """
    chars = alignment.get("characters") or []
    cs = alignment.get("character_start_times_seconds") or []
    ce = alignment.get("character_end_times_seconds") or []
    got = "".join(chars)
    # map each char index of `text` to an index of `chars` (None if not present)
    if got == text:
        cmap = list(range(len(text)))
    else:
        cmap = [None] * len(text)
        # characters may be multi-char strings in odd cases: expand
        flat, owner = [], []
        for k, c in enumerate(chars):
            for ch in c:
                flat.append(ch)
                owner.append(k)
        sm = difflib.SequenceMatcher(None, text, "".join(flat), autojunk=False)
        for a, b, n in sm.get_matching_blocks():
            for d in range(n):
                cmap[a + d] = owner[b + d]
    times, pos = [], 0
    for w in words:
        idx = [cmap[pos + j] for j, ch in enumerate(w) if ch.isalnum() and cmap[pos + j] is not None]
        if not idx:  # punctuation-only token, or unmatched: use any char of the token
            idx = [cmap[pos + j] for j in range(len(w)) if cmap[pos + j] is not None]
        times.append((float(cs[idx[0]]), float(ce[idx[-1]])) if idx else None)
        pos += len(w) + 1
    return times


class ElevenLabsProvider:
    name = "elevenlabs"
    chunk_policy = "paragraph"
    max_chunk_words = 220

    def __init__(self, voice=None, language="en", model=None, cache_dir=None, output_format=None, **_):
        v = (voice or DEFAULT_VOICE)
        self.voice_id = VOICES.get(v.lower(), v)
        self.model = model or os.environ.get("ELEVENLABS_MODEL", DEFAULT_MODEL)
        self.language = (language or "en").split("-")[0]
        self.output_format = output_format or os.environ.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")
        self.base = os.environ.get("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").rstrip("/")
        self.cache = Path(cache_dir) if cache_dir else None
        self.sample_rate = float(al.OUT_SR)
        self.speed = 1.0
        self.settings = {"stability": 0.5 if self.model == "eleven_v3" else 0.55,
                         "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True}
        self.context = {}  # chunk text → (previous_text, next_text)

    def estimate_speech_seconds(self, chunk_texts, speed=1.0):
        return [len(t.split()) / (175.0 * speed) * 60.0 for t in chunk_texts]

    def set_pace(self, speed):
        self.speed = float(np.clip(speed, 0.7, 1.2))  # API range

    def set_context(self, texts):
        for i, t in enumerate(texts):
            self.context[t] = (texts[i - 1] if i else None, texts[i + 1] if i + 1 < len(texts) else None)

    def request_body(self, text):
        body = {"text": text, "model_id": self.model,
                "voice_settings": dict(self.settings, speed=self.speed)}
        prev, nxt = self.context.get(text, (None, None))
        if self.model != "eleven_v3":
            if prev:
                body["previous_text"] = prev
            if nxt:
                body["next_text"] = nxt
        lc = os.environ.get("ELEVENLABS_LANGUAGE_CODE")
        if lc:
            body["language_code"] = lc
        return body

    def _post(self, body):
        url = f"{self.base}/v1/text-to-speech/{self.voice_id}/with-timestamps?output_format={self.output_format}"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        key = os.environ.get("ELEVENLABS_API_KEY")
        if key:
            headers["xi-api-key"] = key
        data = json.dumps(body).encode()
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, data=data, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                msg = e.read()[:500].decode("utf-8", "replace")
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(2 ** attempt * 2)
                    continue
                raise SystemExit(f"[elevenlabs] HTTP {e.code}: {msg}")
            except urllib.error.URLError as e:
                if attempt < 2:
                    time.sleep(3)
                    continue
                raise SystemExit(f"[elevenlabs] cannot reach {self.base}: {e.reason}")

    def decode(self, resp):
        raw = base64.b64decode(resp["audio_base64"])
        if self.output_format.startswith("pcm_"):
            sr = int(self.output_format.split("_")[1])
            a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
            return al.resample(a, sr, al.OUT_SR)
        return al.decode_bytes(raw, al.OUT_SR, 1)

    def synth(self, text, words):
        body = self.request_body(text)
        key = hashlib.sha256(json.dumps([self.voice_id, self.output_format, body], sort_keys=True).encode()).hexdigest()[:24]
        resp = None
        if self.cache:
            f = self.cache / f"{key}.json"
            if f.exists():
                resp = json.loads(f.read_text())
        if resp is None:
            print(f"[elevenlabs] synthesizing {len(text)} chars…", file=sys.stderr)
            resp = self._post(body)
            if self.cache:
                self.cache.mkdir(parents=True, exist_ok=True)
                (self.cache / f"{key}.json").write_text(json.dumps(resp))
        audio = self.decode(resp)
        align = resp.get("alignment") or resp.get("normalized_alignment") or {}
        return audio, alignment_to_word_times(text, words, align)
