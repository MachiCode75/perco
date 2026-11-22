import sys, json, re, subprocess, torch, torchaudio
torch.set_num_threads(4)
from chatterbox.tts import ChatterboxTTS
S, prompt = sys.argv[1], sys.argv[2]
m = ChatterboxTTS.from_pretrained(device="cpu")
txt = json.load(open(f"{S}/intro/ep5.json"))["shots"][0]["say"]
target = (12.29 - 0.3) * 1.05
sents = re.split(r"(?<=[.!?])\s+", txt)
def groups22(ss):
    g, cur = [], ""
    for s in ss:
        if cur and len((cur + " " + s).split()) > 22: g.append(cur); cur = s
        else: cur = (cur + " " + s).strip()
    return g + [cur]
cfgs = {"A_phrase_ex1.0": (sents, 1.0, 0.5), "B_phrase_ex1.3": (sents, 1.3, 0.5), "C_blocs_ex1.0": (groups22(sents), 1.0, 0.5)}
for tag, (units, ex, cfg) in cfgs.items():
    torch.manual_seed(7)
    parts = []
    for u in units:
        w = m.generate(u, audio_prompt_path=prompt, exaggeration=ex, cfg_weight=cfg, temperature=0.8)
        parts += [w, torch.zeros(1, int(0.05 * m.sr))]
    wav = torch.cat(parts, dim=1); raw = f"{S}/cbx/m_{tag}_raw.wav"; torchaudio.save(raw, wav, m.sr)
    ratio = (wav.shape[-1] / m.sr) / target
    subprocess.run(["rubberband", "-q", "--fine", "-T", f"{max(1.0, ratio):.3f}", raw, f"{S}/cbx/m_{tag}.wav"], check=True)
    print(tag, f"raw {wav.shape[-1]/m.sr:.2f}s → x{ratio:.2f}", flush=True)
