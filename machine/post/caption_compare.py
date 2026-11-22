"""Caption style check against the reference reel (developer tool).

python3 post/caption_compare.py [--ref <reel.mp4>] [--out docs/img/post_captions_compare.jpg]
python3 post/caption_compare.py --calibrate      # libass anchor/size calibration for the font

For a few reference frames (white / yellow / blue / pink words, busy and plain backgrounds,
binocular shot) it:
  1. extracts the 720x1280 frame, upscales it to 1080x1920 (lanczos, like assemble.py),
  2. removes the burned-in reference caption (column-wise interpolation of the band),
  3. burns OUR caption for the same word with libass (post/captions.py style, yuv420p like the
     final encode),
  4. measures both at 720x1280 (fill bbox, fill colour, outline/shadow extents) and
  5. writes a side-by-side image: reference | ours | 50/50 difference flicker strip.
"""
import argparse, os, subprocess, sys, tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import captions as C  # noqa: E402

REF = "/tmp/claude-0/-home-user-perco/8d4200ce-ee34-51a0-9c0c-f9edc8e74159/scratchpad/reel/src/reel.mp4"
# (time in the reel, word shown, colour name or None)
SAMPLES = [(48.5, "Grandpa", None), (100.0, "exact", None), (167.935, "lake", None),
           (39.8, "one", "yellow"), (105.2, "don't", "blue"), (126.2, "baby", "pink")]


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


def esc(path):
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


STYLE_OVERRIDE = {}


def burn(png_in, png_out, word, color, style=None, tmp="."):
    st = dict(C.STYLE)
    st.update(STYLE_OVERRIDE)
    st.update(style or {})
    lines = [C.ass_header(st)] + C.dialogue_lines(word, color, 0.0, 5.0, st)
    ass = os.path.join(tmp, "one.ass")
    open(ass, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    vf = f"format=yuv420p,ass=filename='{esc(ass)}':fontsdir='{esc(C.FONTS_DIR)}',format=rgb24"
    sh(["ffmpeg", "-v", "error", "-y", "-i", png_in, "-vf", vf, "-frames:v", "1", png_out])


def fill_mask(a, y0=850, y1=960):
    """Caption fill pixels (bright or saturated, enclosed by the black outline) in a 720-wide frame."""
    band = a[y0:y1].astype(int)
    mx, mn = band.max(2), band.min(2)
    bright = (mx > 170) & ((mn > 150) | ((mx - mn) > 60))
    dark = ndi.binary_dilation(mx < 60, iterations=5)
    lab, n = ndi.label(bright)
    keep = [i for i in range(1, n + 1) if (dark & (lab == i)).any() and (lab == i).sum() > 40]
    m = np.isin(lab, keep)
    # keep the centred word only
    cols = np.where(m.any(0))[0]
    if len(cols):
        c = cols[np.argmin(abs(cols - 360))]
        lo = hi = c
        occ = set(cols.tolist())
        while any(x in occ for x in range(lo - 20, lo)):
            lo = min(x for x in range(lo - 20, lo) if x in occ)
        while any(x in occ for x in range(hi + 1, hi + 21)):
            hi = max(x for x in range(hi + 1, hi + 21) if x in occ)
        m[:, :lo] = False
        m[:, hi + 1:] = False
    full = np.zeros(a.shape[:2], bool)
    full[y0:y1] = m
    return full


def edge_profiles(a, m, n=12):
    """Mean luminance / local background along the outward normal of the fill edge, offsets 1..n px
    (720 scale), for each side (top, bottom, left, right). Only columns/rows whose background
    (16 px away) is bright enough to see the dark outline/shadow are used."""
    L = (a.astype(float) * [0.299, 0.587, 0.114]).sum(2)
    ys, xs = np.where(m)
    prof = {}
    for side, step in (("top", -1), ("bottom", 1), ("left", -1), ("right", 1)):
        acc = []
        lines = range(xs.min(), xs.max() + 1) if side in ("top", "bottom") else range(ys.min(), ys.max() + 1)
        for u in lines:
            idx = np.where(m[:, u])[0] if side in ("top", "bottom") else np.where(m[u])[0]
            if not len(idx):
                continue
            e = idx.min() if step < 0 else idx.max()
            get = (lambda k: L[e + step * k, u]) if side in ("top", "bottom") else (lambda k: L[u, e + step * k])
            try:
                bg = np.mean([get(k) for k in (18, 19, 20)])
                if bg < 70:
                    continue
                # skip if another glyph part is within reach (inner counters, neighbouring letters)
                seg = [m[e + step * k, u] if side in ("top", "bottom") else m[u, e + step * k] for k in range(2, n + 6)]
                if any(seg):
                    continue
                acc.append([get(k) / bg for k in range(1, n + 1)])
            except IndexError:
                continue
        prof[side] = np.mean(acc, 0) if acc else None
    return prof


def extent(p, thr=0.5):
    """Offset (px @720) where the dark halo (outline + shadow) ends: first offset, after the first
    dark one, whose luminance is back above thr × background (linear interpolation)."""
    if p is None:
        return float("nan")
    dark = np.where(p < thr)[0]
    if not len(dark):
        return 0.0
    k = dark[0]
    while k < len(p) and p[k] < thr:
        k += 1
    if k >= len(p):
        return float(len(p))
    return float(k + (thr - p[k - 1]) / (p[k] - p[k - 1]))  # offsets are 1-based: index k ↔ offset k+1


def footprint(word, color, tmp):
    """Pixels (720 scale) touched by OUR caption (fill + outline + shadow), from a render on flat grey."""
    grey = os.path.join(tmp, "grey.png")
    Image.fromarray(np.full((1920, 1080, 3), 128, np.uint8)).save(grey)
    out = os.path.join(tmp, "fp.png")
    burn(grey, out, word, color, tmp=tmp)
    a = np.array(Image.open(out).convert("RGB").resize((720, 1280), Image.LANCZOS)).astype(int)
    return np.abs(a - 128).max(2) > 6


def inpaint(a, mask, iters=600):
    """Harmonic (diffusion) fill of the masked pixels from their surroundings."""
    out = a.astype(float).copy()
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    sub, m = out[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    # initialise with row-wise linear interpolation, then relax
    for c in range(3):
        ch = sub[..., c]
        for r in range(ch.shape[0]):
            row, mr = ch[r], m[r]
            if mr.any() and (~mr).any():
                row[mr] = np.interp(np.where(mr)[0], np.where(~mr)[0], row[~mr])
    for _ in range(iters):
        avg = (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
        sub[m] = avg[m]
    out[y0:y1, x0:x1] = sub
    return out.clip(0, 255).astype(np.uint8)


def measure(a, region=None):
    m = fill_mask(a)
    if region is not None:
        m &= region
    ys, xs = np.where(m)
    core = ndi.binary_erosion(m, iterations=2)
    col = np.median(a[core], 0) if core.any() else np.array([0, 0, 0])
    return m, {"x0": int(xs.min()), "x1": int(xs.max()), "y0": int(ys.min()), "y1": int(ys.max()),
               "w": int(xs.max() - xs.min() + 1), "fill": tuple(int(v) for v in col),
               "prof": edge_profiles(a, m)}


def calibrate(tmp):
    """Render 'lake' at a known anchor; report baseline offset and x-height."""
    st = dict(C.STYLE)
    img = np.full((1920, 1080, 3), 128, np.uint8)
    src = os.path.join(tmp, "grey.png")
    Image.fromarray(img).save(src)
    out = os.path.join(tmp, "cal.png")
    lines = [C.ass_header(st), f"Dialogue: 1,0:00:00.00,0:00:05.00,Caption,,0,0,0,,{{\\an2\\pos(540,1000)\\blur0}}lake"]
    open(os.path.join(tmp, "one.ass"), "w").write("\n".join(lines) + "\n")
    vf = f"ass=filename='{esc(os.path.join(tmp, 'one.ass'))}':fontsdir='{esc(C.FONTS_DIR)}'"
    sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", vf, "-frames:v", "1", out])
    a = np.array(Image.open(out).convert("RGB")).astype(int)
    white = a.min(2) > 200
    ys, xs = np.where(white)
    base = ys.max() + 1  # bottom of 'lake' (no descenders) = baseline
    top = ys.min()
    print(f"anchor y=1000 → baseline {base} (anchor-baseline = {1000 - base} px = {(1000 - base) / st['size']:.4f} × size)")
    print(f"fill height (l ascender) {base - top} px, width {xs.max() - xs.min() + 1} px at size {st['size']}")
    print("reference 'lake' @1080: height ~69 px (46 @720), width ~171 px (114 @720)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default=REF)
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "img", "post_captions_compare.jpg"))
    ap.add_argument("--calibrate", action="store_true")
    ap.add_argument("--style", action="append", default=[], help="override a STYLE value, e.g. --style outline=6")
    a = ap.parse_args()
    for kv in a.style:
        k, v = kv.split("=", 1)
        STYLE_OVERRIDE[k] = type(C.STYLE[k])(v) if not isinstance(C.STYLE[k], bool) else v.lower() in ("1", "true")
    tmp = tempfile.mkdtemp(prefix="capcmp_")
    if a.calibrate:
        calibrate(tmp)
        return
    if not os.path.exists(a.ref):
        raise SystemExit(f"reference video not found: {a.ref}")
    pal = C.resolve_palette({})
    rows, report = [], []
    for t, word, cname in SAMPLES:
        color = pal[cname] if cname else None
        f720 = os.path.join(tmp, f"ref_{t}.png")
        sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{t}", "-i", a.ref, "-frames:v", "1", f720])
        ref = np.array(Image.open(f720).convert("RGB"))
        fp = ndi.binary_dilation(footprint(word, color, tmp), iterations=3)
        _, mref = measure(ref, fp)
        clean = inpaint(ref, fp)
        up_path = os.path.join(tmp, f"clean_{t}.png")
        Image.fromarray(clean).resize((1080, 1920), Image.LANCZOS).save(up_path)
        ours_path = os.path.join(tmp, f"ours_{t}.png")
        burn(up_path, ours_path, word, color, tmp=tmp)
        ours1080 = Image.open(ours_path).convert("RGB")
        ours720 = np.array(ours1080.resize((720, 1280), Image.LANCZOS))
        _, mour = measure(ours720, fp)
        report.append((t, word, cname or "white", mref, mour))
        ref1080 = Image.fromarray(ref).resize((1080, 1920), Image.LANCZOS)
        box = (60, 1260, 1020, 1460)
        rows.append((word, cname, ref1080.crop(box), ours1080.crop(box)))
    # compose
    W, H = 960, 200
    lab = 34
    sheet = Image.new("RGB", (W * 2 + 30, (H + lab) * len(rows) + 60), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(C.FONT_FILE, 26)
    except Exception:
        font = None
    d.text((10, 14), "REFERENCE (720p reel, upscaled)", fill=(255, 255, 255), font=font)
    d.text((W + 40, 14), "OURS (post/captions.py + libass @1080)", fill=(255, 255, 255), font=font)
    for k, (word, cname, r, o) in enumerate(rows):
        y = 60 + k * (H + lab)
        t, _, _, mref, mour = report[k]
        d.text((10, y + 2), f"t={t}s  '{word}' {cname or 'white'}   ref fill bbox x{mref['x0']}-{mref['x1']} "
               f"y{mref['y0']}-{mref['y1']}  ours x{mour['x0']}-{mour['x1']} y{mour['y0']}-{mour['y1']} (@720)",
               fill=(200, 200, 200), font=ImageFont.truetype(C.FONT_FILE, 20) if font else None)
        sheet.paste(r, (0, y + lab))
        sheet.paste(o, (W + 30, y + lab))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    sheet.save(a.out, quality=90)
    print(f"{'t':>8} {'word':8} {'col':6} | {'fill bbox @720 ref':22} {'ours':22} | {'fill RGB ref':16} {'ours':16} | "
          f"dark extent T/B/L/R px@720 ref | ours")
    for t, word, cn, r, o in report:
        e = lambda m: "/".join(f"{extent(m['prof'][k]):.0f}" for k in ("top", "bottom", "left", "right"))
        print(f"{t:8.2f} {word:8} {cn:6} | {str((r['x0'], r['x1'], r['y0'], r['y1'])):22} "
              f"{str((o['x0'], o['x1'], o['y0'], o['y1'])):22} | {str(r['fill']):16} {str(o['fill']):16} | "
              f"{e(r):11} | {e(o)}")
    err = []
    for t, word, cn, r, o in report:
        for side in ("top", "bottom", "left", "right"):
            pr, po = r["prof"][side], o["prof"][side]
            if pr is not None and po is not None:
                err.append(np.mean((pr[1:] - po[1:]) ** 2))
    print(f"profile RMS error (all words/sides, offsets 2-12): {np.sqrt(np.mean(err)):.4f}")
    print("\nedge profiles (luminance / background, offsets 1..12 px @720 beyond the fill edge):")
    for t, word, cn, r, o in report:
        for side in ("top", "bottom", "left", "right"):
            pr, po = r["prof"][side], o["prof"][side]
            if pr is None or po is None:
                continue
            print(f"  {word:8} {side:6} ref  " + " ".join(f"{v:4.2f}" for v in pr))
            print(f"  {'':8} {'':6} ours " + " ".join(f"{v:4.2f}" for v in po))
    print(f"-> {a.out}")


if __name__ == "__main__":
    main()
