"""espeak-ng fallback provider (robotic; for tests only).

Talks to libespeak-ng through ctypes (the copy bundled with the `espeakng-loader` wheel, or the system
one from apt `espeak-ng`), so word timings are espeak's own WORD events — exact by construction.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import os

import numpy as np


class _Event(ctypes.Structure):
    _fields_ = [("type", ctypes.c_int), ("unique_identifier", ctypes.c_uint),
                ("text_position", ctypes.c_int), ("length", ctypes.c_int),
                ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p), ("id", ctypes.c_char * 8)]


_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(_Event))
EV_WORD, EV_LIST_END = 1, 0
ESPEAK_LANG = {"en": "en-us", "fr": "fr-fr", "es": "es", "it": "it", "de": "de", "pt": "pt-br"}


class EspeakProvider:
    name = "espeak"
    chunk_policy = "sentence"
    max_chunk_words = 60

    def __init__(self, voice=None, language="en", threads=None, **_):
        lib_path, data_path = None, None
        try:
            import espeakng_loader
            lib_path, data_path = espeakng_loader.get_library_path(), espeakng_loader.get_data_path()
        except ImportError:
            pass
        lib_path = os.environ.get("ESPEAK_LIBRARY") or lib_path or ctypes.util.find_library("espeak-ng")
        if not lib_path:
            raise SystemExit("[espeak] libespeak-ng not found: pip install espeakng-loader or apt-get install espeak-ng")
        self.lib = ctypes.cdll.LoadLibrary(lib_path)
        self.lib.espeak_Initialize.restype = ctypes.c_int
        sr = self.lib.espeak_Initialize(2, 0, data_path.encode() if data_path else None, 0x8000)
        if sr <= 0:
            raise SystemExit("[espeak] espeak_Initialize failed")
        self.sample_rate = float(sr)
        lang2 = (language or "en").split("-")[0]
        self.voice = voice if voice and voice not in ("default", "auto") else ESPEAK_LANG.get(lang2, "en-us")
        if self.lib.espeak_SetVoiceByName(self.voice.encode()) != 0:
            raise SystemExit(f"[espeak] unknown voice {self.voice}")
        self.rate = 175
        self._cb = _CB(self._callback)
        self.lib.espeak_SetSynthCallback(self._cb)

    def _callback(self, wav, n, events):
        if n > 0:
            self._pcm.append(np.ctypeslib.as_array(wav, shape=(n,)).copy())
        i = 0
        while events[i].type != EV_LIST_END:
            e = events[i]
            if e.type == EV_WORD:
                self._words.append((e.text_position, e.audio_position / 1000.0))
            i += 1
        return 0

    # target wpm handled by the caller: espeak rate is ≈ words/min of speech
    def estimate_speech_seconds(self, chunk_texts, speed=1.0):
        return [len(t.split()) / (175.0 * speed) * 60.0 for t in chunk_texts]

    def set_pace(self, speed):
        self.rate = int(np.clip(175 * speed, 80, 400))
        self.lib.espeak_SetParameter(1, self.rate, 0)  # espeakRATE

    def synth(self, text, words):
        self._pcm, self._words = [], []
        b = text.encode("utf-8")
        self.lib.espeak_Synth(b, len(b) + 1, 0, 1, 0, 1, None, None)  # POS_CHARACTER, espeakCHARS_UTF8
        self.lib.espeak_Synchronize()
        audio = (np.concatenate(self._pcm) if self._pcm else np.zeros(1, np.int16)).astype(np.float32) / 32768
        # char offset (0-based, in characters) of each token in `text`
        starts, pos = [], 0
        for w in words:
            starts.append(pos)
            pos += len(w) + 1
        tok_start = {}
        for tp, t in self._words:
            c = tp - 1
            k = max(i for i, s in enumerate(starts) if s <= max(c, 0))
            tok_start.setdefault(k, t)
        dur = len(audio) / self.sample_rate
        times, nxt = [None] * len(words), dur
        for k in range(len(words) - 1, -1, -1):
            if k in tok_start:
                times[k] = (tok_start[k], nxt)
                nxt = tok_start[k]
        return audio, times
