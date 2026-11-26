"""Chatterbox voice conversion (S3Gen re-synthesis) of a candidate onto a target voice prompt.

Runs in the models/cbx venv:
  OMP_NUM_THREADS=2 models/cbx/bin/python audio/experiments/voice_study/cbx_vc.py \
      --src build/voice_study/cands/f5_pa --target PROMPT.wav --cid vc_cbx_f5_pa [--keys H1 ...]

How it works: the source is tokenized into S3 speech tokens (25 Hz semantic tokens: words, timing and a
part of the prosody survive) and re-decoded by Chatterbox's flow-matching S3Gen decoder conditioned on the
target prompt (first 10 s), so the output carries the target's timbre. Pitch is NOT copied frame by frame:
the decoder re-predicts it from tokens + speaker conditioning. Output 24 kHz (Perth watermark, inaudible).
Licence: MIT.
"""
from __future__ import annotations

import argparse, json, sys, time
from pathlib import Path

# This folder holds a module named profile.py (stdlib name): keep the folder off sys.path and load cand.py by path.
_HERE = Path(__file__).resolve().parent
sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _HERE]
import importlib.util as _ilu  # noqa: E402
_spec = _ilu.spec_from_file_location("vs_cand", _HERE / "cand.py")
cand = _ilu.module_from_spec(_spec); _spec.loader.exec_module(cand)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="source candidate folder (manifest.json)")
    ap.add_argument("--target", required=True, help="target voice prompt wav")
    ap.add_argument("--cid", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--keys", nargs="*")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--root", default=str(cand.STUDY / "cands"))
    a = ap.parse_args()

    import torch
    torch.set_num_threads(a.threads)
    from chatterbox.vc import ChatterboxVC

    src = json.loads((Path(a.src) / "manifest.json").read_text())
    t0 = time.time()
    vc = ChatterboxVC.from_pretrained("cpu")
    vc.set_target_voice(a.target)
    params = {"source": src["id"], "source_engine": src["engine"], "source_params": src.get("params", {}),
              "target": str(a.target)}
    lic = "MIT (VC)" + ("" if src.get("license", "MIT") == "MIT" else f" + source: {src['license']}")
    c = cand.Candidate(a.cid, f"chatterbox-vc<{src['engine']}", a.label or f"VC Chatterbox sur {src['id']}",
                       lic, params, vc.sr, a.root)
    for s in src["sentences"]:
        if a.keys and s["key"] not in a.keys:
            continue
        t1 = time.time()
        w = vc.generate(str(Path(a.src) / s["file"]))
        c.add(s["key"], s["text"], w[0].numpy(), vc.sr)
        print(f"[cbx-vc] {a.cid} {s['key']} ({time.time() - t1:.1f}s)", file=sys.stderr, flush=True)
    print(json.dumps({"cid": a.cid, "dir": str(c.dir), "seconds": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
