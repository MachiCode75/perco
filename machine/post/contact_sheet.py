"""QA contact sheet: the middle frame of every shot, tiled with shot id / time range / flags.

python3 post/contact_sheet.py --video out/<slug>.mp4 --timeline build/<slug>/timeline.json \
    [--episode episodes/<slug>/episode.json] [--out out/<slug>_contact.jpg] [--cols 8]
"""
import argparse, json, os, subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "assets", "fonts", "Arimo-Bold.ttf")


def mid_frames(video, indices, w, h):
    """Decode the given frame indices (one pass, select filter) → list of HxWx3 arrays."""
    expr = "+".join(f"eq(n\\,{i})" for i in indices)
    cmd = ["ffmpeg", "-v", "error", "-i", video, "-vf", f"select={expr},scale={w}:{h}:flags=area",
           "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"contact sheet decode failed: {r.stderr.decode()[-800:]}")
    n = len(r.stdout) // (w * h * 3)
    return [np.frombuffer(r.stdout[k * w * h * 3:(k + 1) * w * h * 3], np.uint8).reshape(h, w, 3) for k in range(n)]


def make_contact(video, timeline, episode, out, cols=8, tw=216, th=384):
    tl = timeline if isinstance(timeline, dict) else json.load(open(timeline, encoding="utf-8"))
    ep = episode if isinstance(episode, dict) else (json.load(open(episode, encoding="utf-8")) if episode else {})
    fps = tl.get("fps", 30)
    info = {s["id"]: s for s in ep.get("shots", [])}
    idx, f = [], 0
    for s in tl["shots"]:
        idx.append(f + s["frames"] // 2)
        f += s["frames"]
    frames = mid_frames(video, idx, tw, th)
    n = len(tl["shots"])
    rows = (n + cols - 1) // cols
    lab = 44
    head = 40
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 6, head + rows * (th + lab + 6) + 6), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    try:
        fb, fs = ImageFont.truetype(FONT, 18), ImageFont.truetype(FONT, 13)
    except OSError:
        fb = fs = ImageFont.load_default()
    d.text((8, 10), f"{os.path.basename(video)} — {n} shots, {f} frames, {f / fps:.2f}s (middle frame of each shot)",
           fill=(230, 230, 230), font=fb)
    for k, s in enumerate(tl["shots"]):
        x = 6 + (k % cols) * (tw + 6)
        y = head + (k // cols) * (th + lab + 6)
        if k < len(frames):
            sheet.paste(Image.fromarray(frames[k]), (x, y + lab))
        else:
            d.rectangle([x, y + lab, x + tw, y + lab + th], outline=(255, 0, 0))
        e = info.get(s["id"], {})
        flag = "  BINO" if e.get("binoculars") else ""
        d.text((x + 2, y + 2), f"{s['id']}  {s['start']:.2f}-{s['end']:.2f}s  {s['frames']}f{flag}",
               fill=(255, 210, 90) if flag else (235, 235, 235), font=fs)
        say = e.get("say", "")
        d.text((x + 2, y + 22), (say[:30] + "…") if len(say) > 31 else say, fill=(170, 170, 170), font=fs)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out, quality=88)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--episode")
    ap.add_argument("--out")
    ap.add_argument("--cols", type=int, default=8)
    a = ap.parse_args()
    out = a.out or os.path.splitext(a.video)[0] + "_contact.jpg"
    print("contact sheet →", make_contact(a.video, a.timeline, a.episode, out, cols=a.cols))


if __name__ == "__main__":
    main()
