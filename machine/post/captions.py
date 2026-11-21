"""One-word-at-a-time burned-in captions (ASS) in the style of the reference reel.

python3 post/captions.py --words build/<slug>/audio/words.json --episode episodes/<slug>/episode.json \
    --duration 172.4 --out build/<slug>/post/captions.ass [--fps 30] [--auto-proper-nouns]

Style and timing values were MEASURED on the reference reel (720x1280, see post/README.md and
post/caption_compare.py); they are expressed here at the 1080x1920 output resolution.

Episode options (all optional, `captions` block of episode.json):
  "highlight": ["Toby", "one day later", {"text": "it's a baby", "color": "pink"}]
        words or multi-word phrases (matched case/punctuation-insensitively on the narration tokens);
        a plain string takes the next palette colour (yellow, blue, pink, ...) so each entry keeps
        one colour everywhere it occurs; an object may force "color" (palette name or "#RRGGBB").
  "highlight_color": "cycle" | "<palette name>" | "#RRGGBB"   default colour rule for plain strings
  "auto_proper_nouns": false     also colour capitalised mid-sentence words (one colour per name)
  "palette": {"yellow": "#F9DE72", ...}   override/extend the palette
  "lead": 0.0                    seconds the caption change precedes the word start
  "hold_gap_max": 2.0            a word stays on screen through pauses shorter than this
  "last_hold": null              seconds the last word stays after it ends (null = until the end)
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import text as T  # noqa: E402

FONT_FILE = os.path.join(ROOT, "assets", "fonts", "Arimo-Bold.ttf")
FONTS_DIR = os.path.dirname(FONT_FILE)

# ---------------------------------------------------------------------------------------------
# Measured style (reference 720x1280 → output 1080x1920, factor 1.5)
#   font        Arial-Bold metrics/design → Arimo Bold (OFL, metric-compatible with Arial).
#               Fitted over 27 reference words: mean mask IoU 0.74 (best of 21 candidates), the
#               width-derived size is constant across words (CV 0.7 %) i.e. same advance widths.
#   size        em 61.7 px @720 → 92.6 px @1080; x-height 33-34 px @720, cap/ascender 46 px @720
#   baseline    y = 923 / 1280 → 1384.5 / 1920, horizontally centred (x = 360 / 720)
#   outline     black, ~3.9 px @720 → 6 px, crisp outer edge
#   shadow      black, soft, offset ~(+1.7, +4.5) px @720, ramp ~4 px; nearly opaque at the outline
#   colours     white fill #FFFFFF; highlight fills sampled from the reel (median of glyph cores):
#               yellow (250,222,111) blue (112,202,249) pink (251,164,193)
# ---------------------------------------------------------------------------------------------
STYLE = {
    "font": "Arimo",
    "size": 134.0,          # ASS Fontsize (libass scales em = size * upem / (winAscent+winDescent))
    "bold": True,
    "color": "#FFFFFF",
    "outline": 5.8,         # border width, px @1080
    "outline_color": "#000000",
    "outline_opacity": 0.9,
    "edge_blur": 0.6,       # libass \blur on the main layer (anti-aliasing of the border edge)
    "shadow": True,
    "shadow_dx": 3.4,       # px @1080
    "shadow_dy": 7.5,
    "shadow_blur": 3.0,     # libass \blur of the shadow layer
    "shadow_color": "#000000",
    "shadow_opacity": 0.9,
    "x": 540,               # horizontal centre
    "baseline_y": 1384.5,   # text baseline
    "max_width": 980,       # longer words are squeezed (fscx/fscy) to fit
    "letter_spacing": 0.0,
}
PALETTE = {"yellow": "#F9DE72", "blue": "#74CBFA", "pink": "#FBA4C1",
           "green": "#8EE07A", "orange": "#FFB25B", "red": "#FF6B6B", "white": "#FFFFFF"}
PALETTE_CYCLE = ["yellow", "blue", "pink", "green", "orange"]

# Measured timing (30 fps scan of the reel vs speech onsets after 137 pauses):
#   caption change - speech onset: median 0.000 s, IQR [-0.033, +0.040] → captions switch ON the word;
#   no blank between words: a word stays until the next word appears, including through pauses
#   (reel pauses 0.2-1.3 s); no caption before the first word; the last word stays to the end;
#   hard switches (no pop/scale/fade animation); shortest words on screen ~4 frames.
TIMING = {"lead": 0.0, "min_dur": 0.10, "hold_gap_max": 2.0, "gap_tail": 0.6, "last_hold": None}

# libass: anchor (\an2 = bottom-centre of the line box) sits this far below the baseline, as a
# fraction of the font size. Calibrated with post/caption_compare.py --calibrate for Arimo-Bold.ttf.
ANCHOR_BELOW_BASELINE = 0.2652

_STRIP = ".,;:!?…\"“”«»()[]{}<>—–-*/\\_~`"


def caption_text(word):
    """Display form of a narration token: case kept, surrounding punctuation removed, inner
    apostrophes/hyphens kept (the reel shows `don't`, `it's`, `Mrs`, and `twice` for `twice.`)."""
    w = word.strip().strip(_STRIP)
    if w[:1] in "‘'":                       # quoted word: drop both quotes ('dogs’' keeps its ’)
        w = w[1:].rstrip("’'").strip(_STRIP)
    return w.replace("{", "(").replace("}", ")").replace("\\", "/")


def _hex_to_ass(color, alpha=0):
    c = color.lstrip("#")
    if len(c) != 6:
        raise ValueError(f"bad colour {color!r}")
    r, g, b = c[0:2].upper(), c[2:4].upper(), c[4:6].upper()
    return f"&H{alpha:02X}{b}{g}{r}"


def _ass_time(t):
    """Centisecond timestamp, floored: a frame-aligned time k/fps maps to a value <= k/fps so libass
    shows the event from exactly frame k (and the previous event ends exactly there)."""
    cs = int(t * 100 + 1e-6)
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def resolve_palette(cfg):
    pal = dict(PALETTE)
    pal.update((cfg or {}).get("palette") or {})
    return pal


def _color_value(name, pal):
    if name is None:
        return None
    if isinstance(name, str) and name.startswith("#"):
        return name
    if name in pal:
        return pal[name]
    raise ValueError(f"unknown caption colour {name!r} (palette: {', '.join(pal)})")


def highlight_colors(tokens, cfg):
    """→ list (per token) of '#RRGGBB' or None."""
    cfg = cfg or {}
    pal = resolve_palette(cfg)
    default_rule = cfg.get("highlight_color", "cycle")
    keys = [T.norm(t) for t in tokens]
    colors = [None] * len(tokens)
    cyc = 0

    def next_cycle():
        nonlocal cyc
        name = PALETTE_CYCLE[cyc % len(PALETTE_CYCLE)]
        cyc += 1
        return pal.get(name, PALETTE[name])

    for entry in cfg.get("highlight") or []:
        if isinstance(entry, dict):
            text, col = entry.get("text", ""), entry.get("color")
        else:
            text, col = str(entry), None
        phrase = [T.norm(w) for w in T.words(text)]
        phrase = [p for p in phrase if p]
        if not phrase:
            continue
        if col is not None:
            color = _color_value(col, pal)
        elif default_rule == "cycle":
            color = next_cycle()
        else:
            color = _color_value(default_rule, pal)
        n = len(phrase)
        for i in range(len(keys) - n + 1):
            if keys[i:i + n] == phrase:
                for j in range(i, i + n):
                    if colors[j] is None:
                        colors[j] = color
    if cfg.get("auto_proper_nouns"):
        names = {}
        sentence_start = True
        for i, tok in enumerate(tokens):
            core = caption_text(tok)
            is_name = (not sentence_start and core[:1].isupper() and core not in ("I", "I'm", "I'll", "I've", "I'd")
                       and not core.isupper())
            if is_name and colors[i] is None:
                k = T.norm(core)
                if k not in names:
                    names[k] = next_cycle()
                colors[i] = names[k]
            sentence_start = tok.rstrip("\"”’'»)").endswith((".", "!", "?", "…", ":"))
    return colors


def build_events(words, duration, fps=30, timing=None):
    """words: [{text,start,end}] → [(frame_start, frame_end, word_index)] with frame_end exclusive.
    Rules measured on the reel (see TIMING)."""
    tm = dict(TIMING)
    tm.update({k: v for k, v in (timing or {}).items() if k in TIMING})
    total = int(round(duration * fps))
    items = [(i, w) for i, w in enumerate(words) if caption_text(w["text"])]
    starts = []
    prev = -1
    min_f = max(1, int(round(tm["min_dur"] * fps)))
    for i, w in items:
        f = int(round((float(w["start"]) - tm["lead"]) * fps))
        f = max(f, 0, prev + min_f if prev >= 0 else 0)
        starts.append(f)
        prev = f
    events = []
    for k, (i, w) in enumerate(items):
        f0 = starts[k]
        if f0 >= total:
            break
        if k + 1 < len(items):
            nxt = starts[k + 1]
            gap = float(items[k + 1][1]["start"]) - float(w["end"])
            if gap > tm["hold_gap_max"]:
                f1 = min(nxt, int(round((float(w["end"]) + tm["gap_tail"]) * fps)))
            else:
                f1 = nxt
        else:
            f1 = total if tm["last_hold"] is None else int(round((float(w["end"]) + tm["last_hold"]) * fps))
        f1 = min(max(f1, f0 + 1), total)
        events.append((f0, f1, i))
    return events


def _text_width(text, em_px):
    try:
        from PIL import ImageFont
        f = ImageFont.truetype(FONT_FILE, max(1, int(round(em_px))))
        return f.getlength(text) * em_px / max(1, int(round(em_px)))
    except Exception:
        return 0.55 * em_px * len(text)


def _em_from_size(size):
    try:
        from fontTools.ttLib import TTFont
        t = TTFont(FONT_FILE, lazy=True)
        os2 = t["OS/2"]
        return size * t["head"].unitsPerEm / (os2.usWinAscent + os2.usWinDescent)
    except Exception:
        return size * 0.70


def dialogue_lines(text, color, t0, t1, style):
    """ASS Dialogue lines (shadow layer + main layer) for one word."""
    st = style
    x = st["x"]
    y = st["baseline_y"] + ANCHOR_BELOW_BASELINE * st["size"]
    em = _em_from_size(st["size"])
    w = _text_width(text, em)
    scale = ""
    if w > st["max_width"]:
        s = int(100 * st["max_width"] / w)
        scale = f"\\fscx{s}\\fscy{s}"
    fill = _hex_to_ass(color or st["color"])
    out = []
    a, b = _ass_time(t0), _ass_time(t1)
    if st.get("shadow"):
        alpha = int(round(255 * (1 - st["shadow_opacity"])))
        sc = _hex_to_ass(st["shadow_color"])
        tags = (f"\\an2\\pos({x + st['shadow_dx']:.1f},{y + st['shadow_dy']:.1f}){scale}"
                f"\\bord{st['outline']:.2f}\\shad0\\blur{st['shadow_blur']:.2f}"
                f"\\1c{sc}\\3c{sc}\\1a&H{alpha:02X}&\\3a&H{alpha:02X}&")
        out.append(f"Dialogue: 0,{a},{b},CaptionShadow,,0,0,0,,{{{tags}}}{text}")
    oa = int(round(255 * (1 - st["outline_opacity"])))
    tags = f"\\an2\\pos({x:.1f},{y:.1f}){scale}\\blur{st['edge_blur']:.2f}\\1c{fill}\\3a&H{oa:02X}&"
    out.append(f"Dialogue: 1,{a},{b},Caption,,0,0,0,,{{{tags}}}{text}")
    return out


def ass_header(style):
    st = style
    bold = -1 if st["bold"] else 0
    white = _hex_to_ass(st["color"])
    oc = _hex_to_ass(st["outline_color"])
    fields = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, " \
             "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, " \
             "MarginR, MarginV, Encoding"
    main = (f"Style: Caption,{st['font']},{st['size']:.1f},{white},{white},{oc},&H00000000,{bold},0,0,0,100,100,"
            f"{st['letter_spacing']:.1f},0,1,{st['outline']:.2f},0,2,0,0,0,1")
    shadow = (f"Style: CaptionShadow,{st['font']},{st['size']:.1f},&H00000000,&H00000000,&H00000000,&H00000000,{bold},0,0,0,"
              f"100,100,{st['letter_spacing']:.1f},0,1,{st['outline']:.2f},0,2,0,0,0,1")
    return "\n".join([
        "[Script Info]",
        "; Generated by post/captions.py — one word at a time, reference-reel style",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: None",
        "",
        "[V4+ Styles]",
        fields,
        main,
        shadow,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])


def build_ass(words, episode, duration, fps=30, style=None, auto_proper_nouns=None):
    """→ (ass_text, events) where events = [(f0, f1, word_index, text, color)]."""
    st = dict(STYLE)
    st.update(style or {})
    cfg = dict((episode or {}).get("captions") or {})
    if auto_proper_nouns is not None:
        cfg["auto_proper_nouns"] = auto_proper_nouns
    tokens = [w["text"] for w in words]
    colors = highlight_colors(tokens, cfg)
    evs = build_events(words, duration, fps, timing=cfg)
    lines, events = [ass_header(st)], []
    for f0, f1, i in evs:
        text = caption_text(words[i]["text"])
        t0, t1 = f0 / fps, f1 / fps
        lines.extend(dialogue_lines(text, colors[i], t0, t1, st))
        events.append((f0, f1, i, text, colors[i]))
    return "\n".join(lines) + "\n", events


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--words", required=True)
    ap.add_argument("--episode", help="episode.json (captions.highlight etc.)")
    ap.add_argument("--duration", type=float, help="video duration in seconds (default: words.json duration)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--auto-proper-nouns", action="store_true", default=None)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    wd = json.load(open(a.words, encoding="utf-8"))
    ep = json.load(open(a.episode, encoding="utf-8")) if a.episode else {}
    dur = a.duration or float(wd.get("duration") or wd["words"][-1]["end"])
    ass, events = build_ass(wd["words"], ep, dur, a.fps, auto_proper_nouns=a.auto_proper_nouns)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(ass)
    ncol = sum(1 for e in events if e[4])
    print(f"captions: {len(events)} word events ({ncol} highlighted) → {a.out}")


if __name__ == "__main__":
    main()
