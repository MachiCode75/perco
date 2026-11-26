"""Chatterbox TTS source/baseline candidates for the voice study (raw output, no post chain).

  python3 audio/experiments/voice_study/cbx_tts_gen.py --cid cbx_old --prompt assets/voice/narrator_ref_prompt.wav \
      [--keys H1 ...] [--exaggeration 0.7 --cfg 0.5 --temperature 0.8 --seed 7] \
      [--import-job WAV JSON]   # reuse an existing chatterbox_worker output (gap 0) for the sentences it holds

Calls the production worker (audio/chatterbox_worker.py, read-only) in the models/cbx venv with one group
per sentence and gap 0, then cuts the result into the standard candidate format (24 kHz).
"""
from __future__ import annotations

import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

# This folder holds a module named profile.py (stdlib name): keep the folder off sys.path and load cand.py by path.
_HERE = Path(__file__).resolve().parent
sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _HERE]
import importlib.util as _ilu  # noqa: E402
_spec = _ilu.spec_from_file_location("vs_cand", _HERE / "cand.py")
cand = _ilu.module_from_spec(_spec); _spec.loader.exec_module(cand)

VENV_PY = cand.ROOT / "models" / "cbx" / "bin" / "python"
WORKER = cand.ROOT / "audio" / "chatterbox_worker.py"


def cut(wav_path, meta_path):
    x, sr = sf.read(wav_path, dtype="float32")
    meta = json.loads(Path(meta_path).read_text())
    return sr, {g["text"]: x[int(g["start"] * sr):int(g["end"] * sr)] for g in meta["groups"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cid", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--keys", nargs="*")
    ap.add_argument("--exaggeration", type=float, default=0.7)
    ap.add_argument("--cfg", type=float, default=0.5)
    ap.add_argument("--temperature", type=float, default=0.8)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--import-job", nargs=2, metavar=("WAV", "JSON"))
    ap.add_argument("--root", default=str(cand.STUDY / "cands"))
    a = ap.parse_args()

    params = {"prompt": str(a.prompt), "exaggeration": a.exaggeration, "cfg_weight": a.cfg,
              "temperature": a.temperature, "seed": a.seed, "one_sentence_per_generation": True}
    c = cand.Candidate(a.cid, "chatterbox", a.label or f"Chatterbox {a.cid}", "MIT", params, 24000, a.root)
    sents = cand.all_sentences(a.keys)
    if a.import_job:
        sr, by_text = cut(*a.import_job)
        for k, t in sents.items():
            if t in by_text and not c.has(k):
                c.add(k, t, by_text[t], sr)
        c.meta["params"]["imported_from"] = a.import_job[0]
        c.save()
    todo = [k for k in sents if not c.has(k)]
    if todo:
        with tempfile.TemporaryDirectory() as td:
            out = os.path.join(td, "out.wav")
            job = {"groups": [sents[k] for k in todo], "prompt": str(Path(a.prompt).resolve()),
                   "exaggeration": a.exaggeration, "cfg_weight": a.cfg, "temperature": a.temperature,
                   "seed": a.seed, "gap": 0.0, "threads": a.threads, "out": out}
            jp = os.path.join(td, "job.json")
            Path(jp).write_text(json.dumps(job))
            env = {**os.environ, "OMP_NUM_THREADS": str(a.threads)}
            subprocess.run([str(VENV_PY), str(WORKER), jp], check=True, env=env)
            sr, by_text = cut(out, out[:-4] + ".json")
            for k in todo:
                c.add(k, sents[k], by_text[sents[k]], sr)
    print(json.dumps({"cid": a.cid, "dir": str(c.dir)}))


if __name__ == "__main__":
    main()
