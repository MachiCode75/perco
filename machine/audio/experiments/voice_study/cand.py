"""Shared helpers for voice-study candidates (STANDARD CANDIDATE FORMAT).

A candidate is a folder build/voice_study/cands/<cid>/ holding
  manifest.json = {"id", "engine", "label", "license", "params", "sr",
                   "sentences": [{"key", "text", "file"}, ...]}
  one mono WAV per sentence (raw engine output, edge silence trimmed to <= 60 ms).

Sentence keys: H1..H4 = held-out reference sentences (build/voice_study/analysis/heldout.json, A/B
testing ONLY, never used in production), T1..T7 = our own test passage (below).
Pure numpy/soundfile: importable from any venv.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
STUDY = ROOT / "build" / "voice_study"
HELDOUT = STUDY / "analysis" / "heldout.json"

T_SENTENCES = {
    "T1": "In this town, the power goes out at 3 AM every night.",
    "T2": "For exactly 11 minutes.",
    "T3": "My little sister Bea is 6, and she's not scared of anything.",
    "T4": "Every night, she leaves a cookie on her windowsill.",
    "T5": "So of course, I looked.",
    "T6": "Something was standing in the street. Taller than the power poles.",
    "T7": "And it was smiling at me.",
}


def heldout_sentences(path=HELDOUT):
    """{"H1": text, ...} from heldout.json (accepts a list of {key,text} / {text} or a dict)."""
    p = Path(path)
    if not p.exists():
        return {}
    d = json.loads(p.read_text())
    if isinstance(d, dict) and "sentences" in d:
        d = d["sentences"]
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            if isinstance(v, str):
                out[k] = v
            elif isinstance(v, dict) and "text" in v:
                out[k] = v["text"]
    else:
        for i, s in enumerate(d):
            if isinstance(s, str):
                out[f"H{i + 1}"] = s
            else:
                out[s.get("key", f"H{i + 1}")] = s["text"]
    return out


def all_sentences(keys=None, heldout=HELDOUT):
    """Ordered {key: text} for H1..H4 + T1..T7, optionally restricted to `keys`."""
    s = {**heldout_sentences(heldout), **T_SENTENCES}
    order = sorted(s, key=lambda k: (k[0] != "H", int(k[1:]) if k[1:].isdigit() else 99))
    if keys:
        order = [k for k in order if k in set(keys)]
    return {k: s[k] for k in order}


def trim(x, sr, db=-45.0, keep=0.05):
    """Trim leading/trailing silence (frames below peak+db), keeping `keep` s of margin."""
    x = np.asarray(x, dtype=np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    hop = max(1, int(0.01 * sr))
    n = len(x) // hop
    if n == 0:
        return x
    env = np.abs(x[: n * hop]).reshape(n, hop).max(axis=1)
    idx = np.nonzero(env > env.max() * 10 ** (db / 20))[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] * hop - int(keep * sr))
    b = min(len(x), (idx[-1] + 1) * hop + int(keep * sr))
    return x[a:b]


class Candidate:
    """Collects sentence WAVs into a candidate folder and writes manifest.json."""

    def __init__(self, cid, engine, label, license, params, sr, root=STUDY / "cands"):
        self.dir = Path(root) / cid
        self.dir.mkdir(parents=True, exist_ok=True)
        self.meta = {"id": cid, "engine": engine, "label": label, "license": license,
                     "params": params, "sr": int(sr), "sentences": []}
        old = self.dir / "manifest.json"
        if old.exists():  # keep sentences already generated (resumable runs)
            prev = json.loads(old.read_text())
            self.meta["sentences"] = [s for s in prev.get("sentences", []) if (self.dir / s["file"]).exists()]

    def has(self, key):
        return any(s["key"] == key for s in self.meta["sentences"])

    def add(self, key, text, wav, sr=None, do_trim=True):
        sr = int(sr or self.meta["sr"])
        if sr != self.meta["sr"]:
            raise ValueError(f"{key}: sr {sr} != candidate sr {self.meta['sr']}")
        w = trim(wav, sr) if do_trim else np.asarray(wav, dtype=np.float32)
        peak = float(np.abs(w).max()) if len(w) else 0.0
        if peak > 0.999:
            w = w * (0.999 / peak)
        f = f"{key}.wav"
        sf.write(self.dir / f, w, sr, subtype="PCM_16")
        self.meta["sentences"] = [s for s in self.meta["sentences"] if s["key"] != key]
        self.meta["sentences"].append({"key": key, "text": text, "file": f})
        self.meta["sentences"].sort(key=lambda s: (s["key"][0] != "H", int(s["key"][1:])))
        self.save()

    def save(self):
        (self.dir / "manifest.json").write_text(json.dumps(self.meta, indent=1, ensure_ascii=False))
