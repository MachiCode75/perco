import sys, json, re, subprocess, torch, torchaudio
torch.set_num_threads(4)
from chatterbox.tts import ChatterboxTTS
S, prompt, ex, tag = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
ids = [int(x) for x in sys.argv[5].split(",")]
SLOW = float(sys.argv[6]) if len(sys.argv) > 6 else 1.05
m = ChatterboxTTS.from_pretrained(device="cpu")
refdur = {1: 10.97, 3: 12.49, 5: 12.29}

def chunks(txt, maxw=10, minw=3):
    """Phrase-sized chunks of ≤ maxw words, cut at punctuation (sentence ends, commas), tiny bits glued."""
    pieces = [p for p in re.split(r"(?<=[.!?,])\s+", txt.strip()) if p]
    out = []
    for p in pieces:
        n = len(p.split())
        if out and (len(out[-1].split()) + n <= maxw or (n < minw and len(out[-1].split()) + n <= maxw + 3)):
            out[-1] += " " + p
        else:
            out.append(p)
    return out

def trim(w, sr, db=-40):
    import torch
    x = w[0]; env = x.abs().unfold(0, int(0.01 * sr), int(0.01 * sr)).max(dim=1).values
    thr = env.max() * 10 ** (db / 20); idx = (env > thr).nonzero().flatten()
    if len(idx) == 0: return w
    a = max(0, int(idx[0]) * int(0.01 * sr) - int(0.01 * sr)); b = min(len(x), (int(idx[-1]) + 1) * int(0.01 * sr) + int(0.03 * sr))
    return w[:, a:b]

for i in ids:
    txt = json.load(open(f"{S}/intro/ep{i}.json"))["shots"][0]["say"]
    cs = chunks(txt)
    print(i, cs, flush=True)
    parts = []
    for c in cs:
        w = m.generate(c, audio_prompt_path=prompt, exaggeration=ex, cfg_weight=0.3, temperature=0.8)
        parts += [trim(w, m.sr), torch.zeros(1, int(0.07 * m.sr))]
    wav = torch.cat(parts, dim=1)
    raw = f"{S}/cbx/{tag}_raw{i}.wav"; torchaudio.save(raw, wav, m.sr)
    dur = wav.shape[-1] / m.sr
    ratio = dur / ((refdur[i] - 0.3) * SLOW)
    out = f"{S}/cbx/{tag}_{i}.wav"
    subprocess.run(["rubberband", "-q", "--fine", "-T", f"{max(ratio, 1.0):.3f}", raw, out], check=True)
    print(i, f"raw {dur:.2f}s → tempo x{ratio:.2f}", flush=True)
