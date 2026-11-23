"""Runs INSIDE the Chatterbox venv (models/cbx). Synthesizes text groups → one raw WAV + group offsets.

models/cbx/bin/python audio/chatterbox_worker.py job.json
job = {"groups": [...], "prompt": path, "exaggeration": 1.0, "cfg_weight": 0.5, "temperature": 0.8,
       "seed": 7, "gap": 0.05, "out": path.wav}
Writes out.wav (model sample rate) and out.json {"sr": …, "groups": [{"text", "start", "end"}]}.
"""
import json, sys, time

import torch
import torchaudio


def trim(w, sr, db=-45.0):
    x = w[0]
    hop = int(0.01 * sr)
    env = x.abs().unfold(0, hop, hop).max(dim=1).values
    idx = (env > env.max() * 10 ** (db / 20)).nonzero().flatten()
    if len(idx) == 0:
        return w
    a = max(0, int(idx[0]) * hop - hop)
    b = min(len(x), (int(idx[-1]) + 1) * hop + 3 * hop)
    return w[:, a:b]


def main(job_path):
    job = json.load(open(job_path))
    torch.set_num_threads(job.get("threads", 4))
    from chatterbox.tts import ChatterboxTTS
    t0 = time.time()
    m = ChatterboxTTS.from_pretrained(device="cpu")
    torch.manual_seed(job.get("seed", 7))
    parts, meta, cursor = [], [], 0
    gap = torch.zeros(1, int(job.get("gap", 0.05) * m.sr))
    for i, g in enumerate(job["groups"]):
        g = g if isinstance(g, dict) else {"text": g}  # per-group overrides (intonation tags)
        text = g["text"]
        w = m.generate(text, audio_prompt_path=job["prompt"], exaggeration=g.get("exaggeration", job.get("exaggeration", 1.0)),
                       cfg_weight=g.get("cfg_weight", job.get("cfg_weight", 0.5)), temperature=g.get("temperature", job.get("temperature", 0.8)))
        w = trim(w, m.sr)
        meta.append({"text": text, "start": cursor / m.sr, "end": (cursor + w.shape[-1]) / m.sr})
        parts += [w, gap]
        cursor += w.shape[-1] + gap.shape[-1]
        print(f"[chatterbox] {i + 1}/{len(job['groups'])} {w.shape[-1] / m.sr:5.2f}s  {text[:60]}", file=sys.stderr, flush=True)
    wav = torch.cat(parts, dim=1)
    torchaudio.save(job["out"], wav, m.sr)
    json.dump({"sr": m.sr, "groups": meta, "seconds": round(time.time() - t0, 1)},
              open(job["out"].rsplit(".", 1)[0] + ".json", "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
