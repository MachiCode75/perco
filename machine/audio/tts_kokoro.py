"""Kokoro-82M (ONNX, local, free) provider with exact phoneme timings.

The stock kokoro-v1.0.onnx only outputs audio. On first use we derive two graphs from it:
  * kokoro-v1.0-timed.onnx : same model + an extra `duration` output (the integer number of
    600-sample frames the duration predictor gives every phoneme token — the very alignment the
    decoder is driven with), so word times come from the model itself, not from a guess;
  * kokoro-v1.0-dur.onnx   : just the text encoder + duration predictor (fast), used to pick the
    speed that hits the requested words/min before synthesizing.
"""
from __future__ import annotations

import os
import sys
import threading
import urllib.request
from pathlib import Path

import numpy as np

import align

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent / "models" / "kokoro"
BASE_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL_FILE, VOICES_FILE = "kokoro-v1.0.onnx", "voices-v1.0.bin"
TIMED_FILE, DUR_FILE = "kokoro-v1.0-timed.onnx", "kokoro-v1.0-dur.onnx"
SR = 24000
HOP = 600                 # samples per duration frame (24 kHz / 40 frames per second)
MAX_TOKENS = 500          # model context is 510 incl. the two pad tokens
# Measured (audio/validate_timing.py): sound starts ~2 frames before the predicted phoneme
# boundary (energy onsets after silence lead by 47 ms median). We shift word starts by this.
ONSET_LEAD = 0.045

# Named presets: voice blend + pitch (semitones, tape-style resampling which also raises formants)
PRESETS = {
    # closest match to the reference narrator (speaker-embedding similarity 0.82-0.83, see README)
    "young_storyteller": {"voice": "am_fenrir*0.7+am_michael*0.3", "pitch": 4.5, "lang": "en-us"},
    "teen_storyteller": {"voice": "am_fenrir*0.7+am_michael*0.3", "pitch": 3.0, "lang": "en-us"},
    "adult_calm": {"voice": "am_michael", "pitch": 0.0, "lang": "en-us"},
    "fr_storyteller": {"voice": "ff_siwis", "pitch": 0.0, "lang": "fr-fr"},
    "fr_young_male": {"voice": "ff_siwis*0.4+am_fenrir*0.6", "pitch": 3.0, "lang": "fr-fr"},
}
DEFAULT_PRESET = {"en": "young_storyteller", "fr": "fr_storyteller"}

LANG_BY_PREFIX = {"a": "en-us", "b": "en-gb", "f": "fr-fr", "e": "es", "i": "it", "p": "pt-br", "h": "hi"}
ESPEAK_LANG = {"en": "en-us", "fr": "fr-fr", "es": "es", "it": "it", "pt": "pt-br", "hi": "hi", "de": "de"}


# ---------------------------------------------------------------- model files

def _download(url, dest):
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"[kokoro] downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    tmp.rename(dest)


def ensure_models(models_dir: Path = MODELS):
    """Download the model files once and derive the timed / duration-only graphs."""
    models_dir.mkdir(parents=True, exist_ok=True)
    timed, dur, voices, base = (models_dir / TIMED_FILE, models_dir / DUR_FILE,
                                models_dir / VOICES_FILE, models_dir / MODEL_FILE)
    if not voices.exists():
        _download(BASE_URL + VOICES_FILE, voices)
    if timed.exists() and dur.exists():
        return timed, dur, voices
    if not base.exists():
        _download(BASE_URL + MODEL_FILE, base)
    import onnx
    from onnx import TensorProto, helper
    print("[kokoro] deriving timed + duration graphs (one-off)…", file=sys.stderr)
    m = onnx.load(str(base))
    g = m.graph
    # '/encoder/Gather_output_0' = pred_dur (int64 [tokens]) right before the alignment matrix is built
    dur_tensor = next(n.output[0] for n in g.node if n.op_type == "Gather"
                      and n.input[0] == next(c.output[0] for c in g.node if c.op_type == "Cast"
                                             and c.input[0] == next(r.output[0] for r in g.node if r.op_type == "Clip"
                                                                    and r.input[0] == next(x.output[0] for x in g.node if x.op_type == "Round"))))
    g.node.append(helper.make_node("Identity", [dur_tensor], ["duration"], name="duration_out"))
    g.output.append(helper.make_tensor_value_info("duration", TensorProto.INT64, ["tokens_len"]))
    if not timed.exists():
        onnx.save(m, str(timed))
    if not dur.exists():
        onnx.utils.extract_model(str(timed), str(dur), ["tokens", "style", "speed"], ["duration"])
    try:
        base.unlink()  # the timed graph is a strict superset; save 325 MB
    except OSError:
        pass
    return timed, dur, voices


# ---------------------------------------------------------------- voice spec

def parse_voice(spec: str):
    """'am_michael' | 'am_fenrir*0.7+am_michael*0.3' | 'am_fenrir:0.7,am_michael:0.3' → [(name, w)]."""
    parts = []
    for p in spec.replace(",", "+").split("+"):
        p = p.strip()
        if not p:
            continue
        for sep in ("*", ":"):
            if sep in p:
                n, w = p.split(sep, 1)
                parts.append((n.strip(), float(w)))
                break
        else:
            parts.append((p, 1.0))
    return parts


def resolve_voice(voice: str | None, language: str, pitch=None):
    """Return dict(voice=blend spec, pitch=semitones, lang=espeak code, preset=name|None)."""
    lang2 = (language or "en").split("-")[0].lower()
    if not voice or voice in ("default", "auto"):
        voice = DEFAULT_PRESET.get(lang2, "young_storyteller")
    if voice in PRESETS:
        p = dict(PRESETS[voice], preset=voice)
    else:
        first = parse_voice(voice)[0][0]
        p = {"voice": voice, "pitch": 0.0, "preset": None,
             "lang": ESPEAK_LANG.get(lang2) or LANG_BY_PREFIX.get(first[:1], "en-us")}
        # British voices read English with British phonemes
        if lang2 == "en" and first.startswith("b"):
            p["lang"] = "en-gb"
    if lang2 in ESPEAK_LANG and not p["lang"].startswith(lang2):
        p["lang"] = ESPEAK_LANG[lang2]
    if pitch is not None:
        p["pitch"] = float(pitch)
    return p


# ---------------------------------------------------------------- provider

class KokoroProvider:
    name = "kokoro"

    def __init__(self, voice=None, language="en", pitch=None, threads=None, models_dir: Path = MODELS):
        import onnxruntime as ort
        timed, dur, voices = ensure_models(models_dir)
        self.cfg = resolve_voice(voice, language, pitch)
        threads = int(threads or os.environ.get("AUDIO_THREADS", 2))
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        self.sess = ort.InferenceSession(str(timed), so, providers=["CPUExecutionProvider"])
        self.dur_sess = ort.InferenceSession(str(dur), so, providers=["CPUExecutionProvider"])
        allv = np.load(str(voices))
        blend = parse_voice(self.cfg["voice"])
        missing = [n for n, _ in blend if n not in allv.files]
        if missing:
            raise SystemExit(f"[kokoro] unknown voice(s) {missing}; available: {', '.join(sorted(allv.files))}")
        tot = sum(w for _, w in blend)
        self.style_table = sum(allv[n] * (w / tot) for n, w in blend).astype(np.float32)  # (510,1,256)
        from kokoro_onnx.config import DEFAULT_VOCAB
        self.vocab = DEFAULT_VOCAB
        self._init_espeak()
        self.ratio = 2.0 ** (self.cfg["pitch"] / 12.0)   # playback-rate factor of the pitch trick
        self.sample_rate = SR * self.ratio                # chunk audio is to be read at this rate
        self.speed = 1.0

    # -- phonemes
    def _init_espeak(self):
        import espeakng_loader
        from phonemizer.backend import EspeakBackend
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        lib = os.environ.get("PHONEMIZER_ESPEAK_LIBRARY") or espeakng_loader.get_library_path()
        EspeakWrapper.set_library(lib)
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        self._lock = threading.Lock()
        self.backend = EspeakBackend(self.cfg["lang"], preserve_punctuation=True, with_stress=True,
                                     language_switch="remove-flags", words_mismatch="ignore")
        self.backend_words = EspeakBackend(self.cfg["lang"], preserve_punctuation=False, with_stress=True,
                                           language_switch="remove-flags", words_mismatch="ignore")

    @staticmethod
    def clean_text(text):
        t = (text.replace("’", "'").replace("‘", "'").replace("…", "...")
             .replace("–", ", ").replace(" — ", ", ").replace("—", ", "))
        return t

    def phonemize(self, text: str) -> str:
        with self._lock:
            ph = self.backend.phonemize([self.clean_text(text)], strip=True)[0]
        ph = " ".join(ph.split())
        return "".join(c for c in ph if c in self.vocab).strip()

    def word_refs(self, words):
        """Isolated pronunciation of each token ('' for tokens without letters/digits)."""
        idx = [i for i, w in enumerate(words) if any(ch.isalnum() for ch in w)]
        refs = [""] * len(words)
        if idx:
            with self._lock:
                out = self.backend_words.phonemize([self.clean_text(words[i]) for i in idx], strip=True)
            for i, p in zip(idx, out):
                refs[i] = "".join(c for c in p if c in self.vocab)
        return refs

    def tokens(self, ph):
        return [self.vocab[c] for c in ph if c in self.vocab]

    def _style(self, n_tokens):
        return self.style_table[min(n_tokens, len(self.style_table)) - 1]

    # -- pace
    def durations(self, ph: str, speed=1.0):
        toks = self.tokens(ph)
        out = self.dur_sess.run(None, {"tokens": np.array([[0, *toks, 0]], dtype=np.int64),
                                       "style": self._style(len(toks)),
                                       "speed": np.array([speed], dtype=np.float32)})
        return np.asarray(out[0]).ravel()

    def estimate_speech_seconds(self, chunk_texts, speed=1.0):
        """Predicted *trimmed* speech time of every chunk at kokoro speed `speed` (model seconds)."""
        total = []
        for text in chunk_texts:
            ph = self.phonemize(text)
            d = self.durations(ph, speed)
            known = ph
            last = max((i for i, c in enumerate(known) if c not in align.PUNCT), default=len(known) - 1)
            start = d[0]
            end_last_start = d[: last + 1].sum()  # start frame of the last phoneme (d index = char+1)
            # the final phoneme's predicted span includes the trailing release/silence: count ~4 frames
            frames = end_last_start - start + min(int(d[last + 1]), 4) + 2
            total.append(frames * HOP / SR)
        return total

    def set_pace(self, speed):
        self.speed = float(speed)

    # -- synthesis
    def synth(self, text: str, words):
        """Synthesize one chunk. Returns (audio float32 @ self.sample_rate, [(start,end)|None per word]).

        Times are in output seconds (already divided by the pitch ratio).
        """
        ph = self.phonemize(text)
        if len(ph) > MAX_TOKENS:
            raise ValueError(f"chunk too long for kokoro ({len(ph)} phonemes): {text[:60]}…")
        toks = self.tokens(ph)
        audio, dur = self.sess.run(None, {"tokens": np.array([[0, *toks, 0]], dtype=np.int64),
                                          "style": self._style(len(toks)),
                                          "speed": np.array([self.speed], dtype=np.float32)})
        audio = np.asarray(audio, dtype=np.float32).ravel()
        dur = np.asarray(dur).ravel()
        edges = np.concatenate([[0], np.cumsum(dur)]) * (len(audio) / max(1, dur.sum()))
        # char j of `ph` is token j+1 → spans [edges[j+1], edges[j+2])
        spans = align.word_spans(self.word_refs(words), ph)
        sr = self.sample_rate
        times = []
        for sp in spans:
            if sp is None:
                times.append(None)
                continue
            s = edges[sp[0] + 1] / SR / self.ratio
            e = edges[sp[1] + 1] / SR / self.ratio   # end of last char = start of char sp[1]
            times.append((max(0.0, s - ONSET_LEAD / self.ratio * 1.0), e))
        self.last_phonemes = ph
        return audio, times
