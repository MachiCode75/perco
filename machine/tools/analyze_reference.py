"""Measure a reference reel (reusable for any new reference video).

python3 tools/analyze_reference.py <video.mp4> <outdir> [--name refN]

Writes to <outdir>: analysis.json (cuts, shot stats, caption band, words with times, wpm, audio
levels, voice pitch, masked-POV shots), contact.jpg (one labelled frame per shot), words.tsv.
"""
import argparse, json, os, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def sh(cmd, **k):
    return subprocess.run(cmd, capture_output=True, text=True, **k)


def probe(path):
    j = json.loads(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height,codec_type",
                       "-of", "json", path]).stdout)
    v = [s for s in j["streams"] if s["codec_type"] == "video"][0]
    return float(j["format"]["duration"]), v["width"], v["height"]


def cuts(path, thr=9.0, min_gap=0.25):
    out = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vf", "scdet=threshold=6:sc_pass=0", "-an", "-f", "null", "-"]).stderr
    ev = [(float(a), float(b)) for a, b in re.findall(r"lavfi\.scd\.score: ([0-9.]+), lavfi\.scd\.time: ([0-9.]+)", out)]
    res = []
    for s, t in ev:
        if s >= thr and t > 0.1 and (not res or t - res[-1] >= min_gap):
            res.append(t)
    return res


def frames_at(path, times, w, h, scale_w=None):
    """Grab frames at given times (fast seek per frame) → list of HxWx3 uint8."""
    out = []
    for t in times:
        vf = f"scale={scale_w}:-2" if scale_w else "null"
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", vf,
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        ww = scale_w or w
        hh = len(raw) // (ww * 3)
        out.append(np.frombuffer(raw, np.uint8)[: hh * ww * 3].reshape(hh, ww, 3))
    return out


def caption_band(frames):
    """Rows where white glyph pixels sit next to dark outline pixels (burned-in captions)."""
    acc = None
    for f in frames:
        if f.size == 0:
            continue
        g = f.astype(int)
        white = (g.min(axis=2) > 225)
        dark = (g.max(axis=2) < 50)
        near = np.zeros_like(dark)
        for d in (2, 3, 4):
            near |= np.roll(dark, d, axis=1) | np.roll(dark, -d, axis=1) | np.roll(dark, d, axis=0) | np.roll(dark, -d, axis=0)
        row = (white & near).sum(axis=1).astype(float)
        acc = row if acc is None else acc + row
    acc /= len(frames)
    k = np.convolve(acc, np.ones(9) / 9, mode="same")
    top = int(np.argmax(k))
    thr = k[top] * 0.25
    a, b = top, top
    while a > 0 and k[a] > thr:
        a -= 1
    while b < len(k) - 1 and k[b] > thr:
        b += 1
    a, b = max(a, top - 70), min(b, top + 70)  # captions are one line: cap the band (keeps OCR fast)
    return a, b


def ocr_words(path, band, dur, w, work):
    y0, y1 = max(0, band[0] - 12), band[1] + 12
    d = os.path.join(work, "cap"); os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf",
                    f"fps=10,crop={w}:{y1 - y0}:0:{y0},scale=1080:-1,format=gray,lutyuv=y='if(gt(val,200),0,255)'",
                    os.path.join(d, "c_%05d.png")], check=True)
    files = sorted(os.listdir(d))
    keep, prev = [], None
    for f in files:
        a = np.asarray(Image.open(os.path.join(d, f)).convert("L").resize((270, 28)), dtype=np.int16)
        if prev is None or np.abs(a - prev).mean() > 6:
            keep.append(f)
        prev = a
    H = int(Image.open(os.path.join(d, files[0])).size[1]) + 40
    rows = []
    for b in range(0, len(keep), 40):
        batch = keep[b:b + 40]
        canvas = Image.new("L", (1080, H * len(batch)), 255)
        for i, f in enumerate(batch):
            canvas.paste(Image.open(os.path.join(d, f)), (0, i * H + 20))
        p = os.path.join(work, f"batch{b}.png"); canvas.save(p)
        tsv = sh(["tesseract", p, "stdout", "--psm", "6", "tsv"]).stdout
        words = {}
        for line in tsv.splitlines()[1:]:
            c = line.split("\t")
            if len(c) < 12 or not c[11].strip() or float(c[10]) < 50:
                continue
            words.setdefault(int((int(c[7]) + int(c[9]) / 2) // H), []).append(c[11].strip())
        for i, f in enumerate(batch):
            n = int(re.search(r"(\d+)", f)[1]); t = (n - 1) / 10
            txt = re.sub(r"[^\w'’\-]", "", " ".join(words.get(i, [])))
            rows.append((round(t, 2), txt))
    seq = []
    for t, x in rows:
        if x and (not seq or seq[-1][1] != x):
            seq.append((t, x))
    return seq


def audio_stats(path, work):
    wav = os.path.join(work, "a.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", wav], check=True)
    eb = sh(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    I = re.findall(r"I:\s+(-?[0-9.]+) LUFS", eb); LRA = re.findall(r"LRA:\s+([0-9.]+) LU", eb)
    import soundfile as sf
    x, sr = sf.read(wav)
    hop = int(0.05 * sr)
    rms = np.sqrt(np.array([np.mean(x[i:i + hop] ** 2) for i in range(0, len(x) - hop, hop)]) + 1e-12)
    db = 20 * np.log10(rms)
    import librosa
    seg = x[int(5 * sr): int(45 * sr)].astype(np.float32)
    f0, vf, _ = librosa.pyin(seg, fmin=70, fmax=450, sr=sr, frame_length=1024)
    f = f0[vf]
    return {"lufs": float(I[-1]) if I else None, "lra": float(LRA[-1]) if LRA else None,
            "rms_db_median": round(float(np.median(db)), 1), "rms_db_p5": round(float(np.percentile(db, 5)), 1),
            "silence_share": round(float((db < np.median(db) - 25).mean()), 3),
            "f0_median": round(float(np.median(f))) if len(f) else None, "wav": wav}


def masked_pov(frame):
    """Black-masked POV (binoculars/scope/keyhole): dark corners + bright centre."""
    g = frame.astype(float).mean(axis=2); h, w = g.shape
    c = [g[: h // 8, : w // 6].mean(), g[: h // 8, -w // 6:].mean(), g[-h // 8:, : w // 6].mean(), g[-h // 8:, -w // 6:].mean()]
    centre = g[int(h * .35): int(h * .5), int(w * .35): int(w * .65)].mean()
    return max(c) < 14 and centre > 35


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out"); ap.add_argument("--name", default=None)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    work = tempfile.mkdtemp(dir=a.out)
    dur, w, h = probe(a.video)
    cs = cuts(a.video)
    bounds = [0.0] + cs + [dur]
    shots = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]
    lens = np.diff(bounds)
    mids = [min((s + e) / 2, dur - 0.1) for s, e in shots]
    thumbs = frames_at(a.video, mids, w, h, scale_w=180)
    full = frames_at(a.video, [mids[i] for i in range(0, len(mids), max(1, len(mids) // 40))], w, h)
    band = caption_band(full)
    print(f"caption band {band}", flush=True)
    pov = [i + 1 for i, f in enumerate(thumbs) if f.size and masked_pov(f)]
    thumbs = [f if f.size else np.zeros((320, 180, 3), np.uint8) for f in thumbs]
    words = ocr_words(a.video, band, dur, w, work)
    au = audio_stats(a.video, work)
    speech = (words[-1][0] - words[0][0]) if len(words) > 1 else dur
    # contact sheet
    cols = 8; th = thumbs[0].shape[0]
    rowsn = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 182, rowsn * (th + 2)), "white")
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(thumbs):
        x, y = (i % cols) * 182, (i // cols) * (th + 2)
        sheet.paste(Image.fromarray(f), (x, y))
        dr.rectangle([x, y, x + 62, y + 12], fill="black")
        dr.text((x + 2, y), f"{i + 1} {shots[i][0]:.1f}", fill="yellow")
    sheet.save(os.path.join(a.out, "contact.jpg"), quality=80)
    with open(os.path.join(a.out, "words.tsv"), "w") as fh:
        for t, x in words:
            fh.write(f"{t}\t{x}\n")
    res = {"name": a.name or os.path.basename(a.out), "duration": round(dur, 2), "size": [w, h],
           "shots": len(shots), "shot_len": {"mean": round(float(lens.mean()), 2), "median": round(float(np.median(lens)), 2),
                                              "min": round(float(lens.min()), 2), "max": round(float(lens.max()), 2)},
           "cuts": [round(c, 3) for c in cs], "caption_band_px": band, "caption_band_rel": [round(band[0] / h, 3), round(band[1] / h, 3)],
           "caption_changes": len(words), "wpm_est": round(len(words) / max(1, speech) * 60),
           "masked_pov_shots": pov, "masked_pov_share": round(len(pov) / len(shots), 3), "audio": {k: v for k, v in au.items() if k != "wav"}}
    json.dump(res, open(os.path.join(a.out, "analysis.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "cuts"}))


if __name__ == "__main__":
    main()
