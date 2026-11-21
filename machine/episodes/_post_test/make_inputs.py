"""Synthetic inputs for testing post/ alone (the real audio/engine modules are not needed).

python3 episodes/_post_test/make_inputs.py
  → build/_post_test/audio/narration.wav + words.json   (espeak-ng, one word at a time → exact timings)
  → build/_post_test/timeline.json                        (pipeline/timing.py, the real one)
  → build/_post_test/shots/<id>.mp4                       (testsrc2, 720x1280 @ 30, exact frame counts)
  → build/_post_test/audio/music.wav                      (procedural chord pad + pink noise)
"""
import json, os, subprocess, sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import text as T  # noqa: E402

SR = 44100
EP = os.path.join(HERE, "episode.json")
B = os.path.join(ROOT, "build", "_post_test")
FONT = os.path.join(ROOT, "assets", "fonts", "Arimo-Bold.ttf")


def sh(cmd):
    subprocess.run(cmd, check=True)


def say_word(word, tmp):
    sh(["espeak-ng", "-v", "en-us", "-s", "160", "-w", tmp, word])
    x, sr = sf.read(tmp)
    x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)  # → 44.1 kHz
    env = np.abs(x) > 0.02
    i0, i1 = np.argmax(env), len(env) - np.argmax(env[::-1])
    return x[max(0, i0 - 200):i1 + 200]


def main():
    ep = json.load(open(EP, encoding="utf-8"))
    os.makedirs(os.path.join(B, "audio"), exist_ok=True)
    os.makedirs(os.path.join(B, "shots"), exist_ok=True)
    toks = T.words(T.narration(ep))
    tmp = os.path.join(B, "audio", "_w.wav")
    chunks, words, t = [np.zeros(int(0.25 * SR))], [], 0.25
    for i, tok in enumerate(toks):
        clean = T.norm(tok).replace("'", "") or tok
        y = 0.8 * say_word(clean if clean != "im" else "I'm", tmp)
        words.append({"i": i, "text": tok, "start": round(t, 3), "end": round(t + len(y) / SR, 3)})
        t += len(y) / SR
        gap = 0.55 if tok.endswith((".", "!", "?")) else 0.32 if tok.endswith((",", ":")) else 0.04
        chunks += [y, np.zeros(int(gap * SR))]
        t += gap
    os.remove(tmp)
    x = np.concatenate(chunks)
    sf.write(os.path.join(B, "audio", "narration.wav"), x.astype(np.float32), SR, subtype="PCM_16")
    json.dump({"duration": round(len(x) / SR, 3), "words": words},
              open(os.path.join(B, "audio", "words.json"), "w"), indent=1)
    print(f"narration {len(x) / SR:.2f}s, {len(words)} words")
    tl_path = os.path.join(B, "timeline.json")
    sh([sys.executable, os.path.join(ROOT, "pipeline", "timing.py"), "--episode", EP, "--words",
        os.path.join(B, "audio", "words.json"), "--out", tl_path])
    tl = json.load(open(tl_path))
    for k, s in enumerate(tl["shots"]):
        hue = (k * 45) % 360
        vf = (f"hue=h={hue},drawtext=fontfile={FONT}:text='SHOT {s['id']}':fontsize=110:fontcolor=white:"
              f"x=(w-text_w)/2:y=200:box=1:boxcolor=black@0.5:boxborderw=20,"
              f"drawtext=fontfile={FONT}:text='frame %{{n}}':fontsize=60:fontcolor=yellow:x=(w-text_w)/2:y=360")
        sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=720x1280:r=30", "-vf", vf,
            "-frames:v", str(s["frames"]), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p",
            os.path.join(B, "shots", f"{s['id']}.mp4")])
    d = tl["duration"] + 0.5
    pad = ("0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.8*t)+0.06*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.2*t))"
           "+0.05*sin(2*PI*261.6*t)*(0.5+0.5*sin(2*PI*0.13*t))")
    sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{pad}|{pad.replace('110', '110.5')}':s={SR}:d={d}",
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.04:r={SR}:d={d}",
        "-filter_complex", "[1]lowpass=f=1500,aformat=channel_layouts=stereo[n];[0][n]amix=inputs=2:normalize=0",
        os.path.join(B, "audio", "music.wav")])
    print(f"shots: {len(tl['shots'])} clips, {sum(s['frames'] for s in tl['shots'])} frames; music {d:.2f}s")


if __name__ == "__main__":
    main()
