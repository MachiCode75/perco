"""F5-TTS (zero-shot flow-matching TTS) candidate generator for the voice study.

Runs in the models/f5 venv (f5-tts 1.1.22, torch 2.6 CPU borrowed from models/cbx through a .pth file):
  OMP_NUM_THREADS=2 models/f5/bin/python audio/experiments/voice_study/f5_gen.py \
      --cid f5_pa --prompt P.wav --prompt-text "exact transcript" [--keys H1 H2 ...] \
      [--nfe 32 --cfg 2 --sway -1 --speed 1.0 --seed 7 --takes 1]

Writes build/voice_study/cands/<cid>/ in the standard candidate format (raw 24 kHz output, edge
silence trimmed). With --takes N > 1 every sentence is generated with N seeds (seed, seed+1, ...) and
the take whose duration is closest to the median is kept (cheap guard against rushed/dragged takes).
Weights: SWivid/F5-TTS F5TTS_v1_Base (CC-BY-NC 4.0, code MIT) + charactr/vocos-mel-24khz (MIT).
F5 needs the prompt transcript; the prompt should be < 12 s (it is clipped otherwise).
"""
from __future__ import annotations

import argparse, json, os, re, sys, time
from pathlib import Path

# This folder holds a module named profile.py (stdlib name): keep the folder off sys.path and load cand.py by path.
_HERE = Path(__file__).resolve().parent
sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _HERE]
import importlib.util as _ilu  # noqa: E402
_spec = _ilu.spec_from_file_location("vs_cand", _HERE / "cand.py")
cand = _ilu.module_from_spec(_spec); _spec.loader.exec_module(cand)


NUM_WORDS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
             "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve"}


def syllables(text):
    """Rough English syllable count (vowel groups, silent final e, digits spelled, AM/PM = 2)."""
    n = 0
    for w in re.findall(r"[A-Za-z']+|\d+", text):
        if w.isdigit():
            w = NUM_WORDS.get(w, "number number")
            n += sum(syllables(x) for x in w.split()) if " " in w else len(re.findall(r"[aeiouy]+", w)) or 1
            continue
        if w.isupper() and len(w) <= 3:  # acronyms: one syllable per letter (AM = "ay em")
            n += len(w); continue
        lw = w.lower().replace("'", "")
        k = len(re.findall(r"[aeiouy]+", lw))
        if lw.endswith("e") and not lw.endswith(("le", "ee", "ye")) and k > 1:
            k -= 1
        n += max(1, k)
    return n


class Synth:
    """One F5 generation per sentence, in the calling thread (f5_tts.api runs it in a worker thread, where a
    CPU bf16 autocast set by the caller would not apply). Mirrors utils_infer.infer_batch_process for a single
    text batch; the vocoder always runs in fp32."""

    def __init__(self, tts, ref_wav, ref_text, nfe, cfg, sway, speed, bf16):
        import torch, torchaudio
        from f5_tts.infer.utils_infer import hop_length, target_sample_rate
        self.torch, self.hop, self.sr = torch, hop_length, target_sample_rate
        audio, sr = torchaudio.load(ref_wav)
        audio = audio.mean(dim=0, keepdim=True)
        self.rms = float(torch.sqrt(torch.mean(torch.square(audio))))
        if self.rms < 0.1:
            audio = audio * 0.1 / self.rms
        if sr != target_sample_rate:
            audio = torchaudio.transforms.Resample(sr, target_sample_rate)(audio)
        self.audio = audio
        self.ref_text = ref_text if len(ref_text[-1].encode()) != 1 else ref_text + " "
        self.ref_text = self.ref_text if self.ref_text.endswith(" ") else self.ref_text + " "
        self.ref_frames = audio.shape[-1] // hop_length
        self.ref_sec = self.ref_frames * hop_length / target_sample_rate
        self.tts, self.nfe, self.cfg, self.sway, self.speed, self.bf16 = tts, nfe, cfg, sway, speed, bf16

    def __call__(self, text, seed, fix_duration=None):
        import contextlib
        from f5_tts.infer.utils_infer import convert_char_to_pinyin
        from f5_tts.model.utils import seed_everything
        torch = self.torch
        seed_everything(seed)
        if fix_duration is not None:
            duration = int(fix_duration * self.sr / self.hop)
        else:  # F5's own estimate: prompt speaking rate in UTF-8 bytes per frame
            duration = self.ref_frames + int(self.ref_frames / len(self.ref_text.encode()) * len(text.encode()) / self.speed)
        ctx = torch.autocast("cpu", dtype=torch.bfloat16) if self.bf16 else contextlib.nullcontext()
        with torch.inference_mode():
            with ctx:
                mel, _ = self.tts.ema_model.sample(cond=self.audio, text=convert_char_to_pinyin([self.ref_text + text]),
                                                   duration=duration, steps=self.nfe, cfg_strength=self.cfg,
                                                   sway_sampling_coef=self.sway)
            mel = mel.to(torch.float32)[:, self.ref_frames:, :].permute(0, 2, 1)
            wav = self.tts.vocoder.decode(mel)
            if self.rms < 0.1:
                wav = wav * self.rms / 0.1
        return wav.squeeze().cpu().numpy(), self.sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cid", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--prompt-text", required=True)
    ap.add_argument("--keys", nargs="*")
    ap.add_argument("--nfe", type=int, default=32)
    ap.add_argument("--cfg", type=float, default=2.0)
    ap.add_argument("--sway", type=float, default=-1.0)
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--takes", type=int, default=1)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--model", default="F5TTS_v1_Base")
    ap.add_argument("--root", default=str(cand.STUDY / "cands"))
    ap.add_argument("--force", action="store_true", help="regenerate sentences already present")
    ap.add_argument("--bf16", action="store_true", help="run the DiT under CPU bf16 autocast (AMX: much faster)")
    ap.add_argument("--sps", type=float, default=0.0,
                    help="if > 0: fix the generated duration to syllables / sps (+0.15 s) instead of F5's byte-ratio estimate")
    a = ap.parse_args()

    import numpy as np
    import torch
    torch.set_num_threads(a.threads)
    from f5_tts.api import F5TTS
    from f5_tts.infer.utils_infer import preprocess_ref_audio_text

    t0 = time.time()
    tts = F5TTS(model=a.model, device="cpu")
    print(f"[f5] model loaded in {time.time() - t0:.1f}s", file=sys.stderr, flush=True)
    params = {"model": a.model, "prompt": str(a.prompt), "prompt_text": a.prompt_text, "nfe_step": a.nfe,
              "cfg_strength": a.cfg, "sway_sampling_coef": a.sway, "speed": a.speed, "seed": a.seed,
              "takes": a.takes, "cross_fade_duration": 0.15, "target_rms": 0.1, "bf16": a.bf16, "sps": a.sps}
    ref_proc, ref_text = preprocess_ref_audio_text(a.prompt, a.prompt_text, show_info=lambda *x: None)
    synth = Synth(tts, ref_proc, ref_text, a.nfe, a.cfg, a.sway, a.speed, a.bf16)
    c = cand.Candidate(a.cid, "f5-tts", a.label or f"F5-TTS {a.cid}",
                       "code MIT, weights CC-BY-NC-4.0 (non-commercial)", params, tts.target_sample_rate, a.root)
    sents = cand.all_sentences(a.keys)
    for k, text in sents.items():
        if c.has(k) and not a.force:
            continue
        takes = []
        for j in range(a.takes):
            t1 = time.time()
            fix = synth.ref_sec + syllables(text) / a.sps + 0.15 if a.sps > 0 else None
            wav, sr = synth(text, a.seed + j, fix)
            w = cand.trim(np.asarray(wav, dtype=np.float32), sr)
            takes.append(w)
            print(f"[f5] {a.cid} {k} take{j} {len(w) / sr:5.2f}s ({time.time() - t1:.1f}s) {text[:50]}",
                  file=sys.stderr, flush=True)
        durs = np.array([len(w) for w in takes])
        best = int(np.argmin(np.abs(durs - np.median(durs))))
        c.add(k, text, takes[best], sr)
    print(json.dumps({"cid": a.cid, "dir": str(c.dir), "seconds": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
