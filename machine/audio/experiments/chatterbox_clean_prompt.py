import sys, json, re, subprocess, torch, torchaudio
torch.set_num_threads(4)
from chatterbox.tts import ChatterboxTTS
S = sys.argv[1]
m = ChatterboxTTS.from_pretrained(device="cpu")
txt = json.load(open(f"{S}/intro/ep5.json"))["shots"][0]["say"]
target = (12.29 - 0.3) * 1.05
sents = re.split(r"(?<=[.!?])\s+", txt)
g, cur = [], ""
for s in sents:
    if cur and len((cur + " " + s).split()) > 22: g.append(cur); cur = s
    else: cur = (cur + " " + s).strip()
g.append(cur)
for pname in ("p45", "p12"):
    torch.manual_seed(7)
    parts = []
    for u in g:
        w = m.generate(u, audio_prompt_path=f"{S}/cbx/prompt_{pname}/narration.wav", exaggeration=1.0, cfg_weight=0.5, temperature=0.8)
        parts += [w, torch.zeros(1, int(0.05 * m.sr))]
    wav = torch.cat(parts, dim=1); raw = f"{S}/cbx/c_{pname}_raw.wav"; torchaudio.save(raw, wav, m.sr)
    print(pname, f"raw {wav.shape[-1]/m.sr:.2f}s ratio {wav.shape[-1]/m.sr/target:.3f}", flush=True)
