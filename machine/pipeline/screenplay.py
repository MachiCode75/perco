"""Compact screenplay → episode.json (cuts the writing cost of an episode by ~6× with the same detail).

python3 pipeline/screenplay.py episodes/<slug>/story.screen [--out episodes/<slug>/episode.json]

FORMAT (see docs/CHEATSHEET.md for the full reference)
----------------------------------------------------
    title: The 13th Bell
    lang: en
    voice: young_storyteller          # optional: provider:voice, e.g. edge:en-US-ChristopherNeural
    hold: 0.8                         # optional ending hold (s)

    cast:
    me      kid   messy #5a3a22 | hoodie #3f8f5a #2f6e45 | pants #2d3b55
    grandpa elder bald          | cardigan #8a5a3c #f2efe6 | pants #6b6b6b | glasses beard
            ^build ^hair style+colour ^shirt pattern+colours ^pants style+colour ^accessories (any order after |)

    == church_front night             # scene header: set, time [weather]; lasts until the next header
    In our town, the church   | est push
    bell rings 13 times.      | low
    == bedroom night
    Not 12. 13.               | cu me:surprised
    "Count with me," he said. | two grandpa:talk>me me:worried q:grandpa

One line = one shot: `<spoken words> | <directives>`. Directives (any order):
  framing  est wide xwide aer med mcu cu xcu ots pov two ins low high back   (default: med, or est if no actor)
  move     push pull panl panr drift orbit tiltu tiltd follow shake static     (default: static = gentle 5 % zoom)
  bino     binocular POV (mask added in post)
  actor    id[:pose][:face][:prop][@mark][>facing][~depth]   e.g. lily:carry:smile:flashlight@A>window~waist
           id = cast key, or extra / extra2 … for random townsfolk; the FIRST actor is the camera subject
           bare face/pose/prop words after an actor apply to that actor ("cu me scared")
           sign text: sign=HI_ME!  (underscores → spaces)
  crowd    crowd:12[:pose][:face][>poi][@area]
  target   standalone >poi or >actor (for ots / pov / two); attached id>x = that actor's facing
  subject  s:<actor>|s:set|s:poi:<name>  (override)
  q:<speaker>  colour the quoted words of this line with that speaker's caption colour
  t:<time> w:<weather> set:<set>  per-shot overrides
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FRAMING = {"est": "establishing", "wide": "wide", "xwide": "extreme_wide", "aer": "aerial", "med": "medium",
           "mcu": "medium_close", "cu": "close_up", "xcu": "extreme_close_up", "ots": "over_shoulder", "pov": "pov",
           "two": "two_shot", "ins": "insert", "low": "low_angle", "high": "high_angle", "back": "back"}
MOVE = {"push": "push_in", "pull": "pull_out", "panl": "pan_left", "panr": "pan_right", "drift": "drift", "orbit": "orbit",
        "tiltu": "tilt_up", "tiltd": "tilt_down", "follow": "follow", "shake": "shake", "static": "static"}
PLACE_FRAMINGS = {"establishing", "wide", "extreme_wide", "aerial", "low_angle", "high_angle"}
TIMES = {"day", "golden", "dusk", "night"}
WEATHERS = {"clear", "overcast", "snow", "rain", "fog"}
PALETTE = ["#F7DE72", "#74CAF8", "#F7A5C0", "#9BE8B4", "#C9A8F5"]  # reference speaker colours (+2 extras)
DEPTH = {"ankle": 0.4, "knee": 1.0, "waist": 2.0, "chest": 3.0, "neck": 3.8, "chin": 4.2, "under": 6.0}
BUILDS = {"kid", "adult", "elder"}
PANTS = {"pants", "shorts", "skirt", "none"}


def vocab():
    p = os.path.join(ROOT, "data", "vocab.json")
    v = json.load(open(p)) if os.path.exists(p) else {}
    return {k: set(v.get(k) or []) for k in ("FACES", "POSES", "PROPS_HELD", "HAIR_STYLES", "SHIRT_PATTERNS")}, v.get("SETS", {})


def parse_cast_line(line, V):
    parts = [p.strip() for p in line.split("|")]
    head = parts[0].split()
    key, spec = head[0], {"name": head[0].replace("_", " ").title()}
    rest = head[1:]
    if rest and rest[0] == "creature" and len(rest) > 1:  # e.g. "moon creature sky_face"
        spec["creature"] = rest[1]; rest = rest[2:]
    for tok in list(rest):
        if tok in BUILDS:
            spec["build"] = tok; rest.remove(tok)
    if rest:  # hair: style [colour]
        hair = {"style": rest[0]}
        if len(rest) > 1 and rest[1].startswith("#"):
            hair["color"] = rest[1]
        spec["hair"] = hair
    for p in parts[1:]:
        toks = p.split()
        if not toks:
            continue
        cols = [t for t in toks if t.startswith("#")]
        word = toks[0]
        if word == "scale" and len(toks) > 1:
            spec["scale"] = float(toks[1])
        elif word == "stretch":
            spec["stretch"] = {k: float(v) for k, v in (t.split("=") for t in toks[1:] if "=" in t)}
        elif word == "eyes" and len(toks) > 1:
            spec["eyes"] = toks[1]
            if cols:
                spec["glowColor"] = cols[0]
        elif word in PANTS:
            spec["pants"] = {"style": word, **({"color": cols[0]} if cols else {})}
        elif word == "skin" and cols:
            spec["skin"] = cols[0]
        elif word in V["SHIRT_PATTERNS"] or (cols and "shirt" not in spec):
            spec["shirt"] = {"pattern": word if not word.startswith("#") else "solid", "colors": cols or ["#cccccc"]}
        else:  # accessories
            spec["accessories"] = spec.get("accessories", []) + [t for t in toks if not t.startswith("#")]
    return key, spec


def parse_actor(tok, cast, V, poses_faces_props):
    m = re.match(r"^([a-z0-9_]+)((?::[^@>~]+)*)(?:@([^>~]+))?(?:>([^~]+))?(?:~(.+))?$", tok)
    if not m:
        return None
    aid = m.group(1)
    if aid.startswith("extra"):
        n = aid[5:] or "1"
        aid = f"extra:{n}"
    elif aid not in cast:
        return None
    a = {"id": aid}
    for part in [p for p in (m.group(2) or "").split(":") if p]:
        if not apply_word(a, part, V):
            a.setdefault("_unknown", []).append(part)
    if m.group(3):
        a["mark"] = m.group(3)
    if m.group(4):
        a["facing"] = facing_ref(m.group(4), cast)
    if m.group(5):
        d = m.group(5)
        a["depth"] = DEPTH.get(d, None) if d in DEPTH else float(d)
    return a


def facing_ref(x, cast):
    if x in ("camera", "away", "left", "right"):
        return x
    if re.match(r"^-?\d+(\.\d+)?$", x):
        return float(x)
    if x in cast or x.startswith("extra"):
        return "actor:" + (x if x in cast else "extra:" + (x[5:] or "1"))
    return x if ":" in x else "poi:" + x


def apply_word(a, w, V):
    if w.startswith("sign="):
        a["prop"] = {"type": "sign", "text": w[5:].replace("_", " ")}
        a.setdefault("pose", "hold_sign")
    elif w in V["PROPS_HELD"] and w in V["POSES"]:  # e.g. binoculars: pose + prop, unless a pose is already set
        a["prop"] = {"type": w}
        a.setdefault("pose", w)
    elif w in V["FACES"] and w in V["POSES"]:  # e.g. talk: animated pose + talking face
        if "pose" not in a:
            a["pose"] = w
        a.setdefault("face", w)
    elif w in V["FACES"]:
        a["face"] = w
    elif w in V["POSES"]:
        a["pose"] = w
    elif w in V["PROPS_HELD"]:
        a["prop"] = {"type": w}
        if w == "binoculars":
            a.setdefault("pose", "binoculars")
        if w == "sign":
            a.setdefault("pose", "hold_sign")
    else:
        return False
    return True


def compile_screenplay(text, V, SETS):
    meta, cast, shots, errors = {}, {}, [], []
    scene = {"set": None, "time": "day", "weather": "clear"}
    speakers = {}
    mode = "meta"
    for ln, raw in enumerate(text.splitlines(), 1):
        line = raw.split("  #")[0].rstrip() if "  #" in raw else raw.rstrip()
        if not line.strip() or line.lstrip().startswith("//"):
            continue
        if line.strip() == "cast:":
            mode = "cast"; continue
        if line.startswith("=="):
            mode = "shots"
            toks = line[2:].split()
            scene = {"set": toks[0], "time": "day", "weather": "clear"}
            for t in toks[1:]:
                if t in TIMES:
                    scene["time"] = t
                elif t in WEATHERS:
                    scene["weather"] = t
            if SETS and scene["set"] not in SETS:
                errors.append(f"line {ln}: unknown set '{scene['set']}'")
            continue
        if mode == "meta":
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip(); continue
        if mode == "cast":
            if line.startswith((" ", "\t")) and not line.strip().split()[0][0].isalpha():
                continue
            k, spec = parse_cast_line(line.strip(), V)
            cast[k] = spec; continue
        # shot line
        say, _, dirs = line.partition("|")
        say = say.strip()
        if not say:
            errors.append(f"line {ln}: empty spoken text"); continue
        shot = {"id": f"{len(shots) + 1:03d}", "say": say, "set": scene["set"], "time": scene["time"],
                "weather": scene["weather"], "framing": None, "angle": "eye", "move": "static",
                "binoculars": False, "actors": []}
        last, subject, quote_speaker = None, None, None
        import shlex
        try:
            toks = shlex.split(dirs, posix=True)
        except ValueError as e:
            errors.append(f"line {ln}: bad quotes in directives ({e})"); toks = dirs.split()
        for tok in toks:
            if tok.startswith("card:"):  # full-frame text card: card:<style> text="..." title="..." drawing=<id>
                shot["set"] = "card"; shot["setOptions"] = {"style": tok[5:]}
                shot["framing"] = shot["framing"] or "establishing"
            elif tok.startswith(("text=", "title=", "drawing=")) and shot.get("setOptions") is not None:
                k, _, v = tok.partition("="); shot["setOptions"][k] = v
            elif tok.startswith("pov:"):
                shot["pov"] = tok[4:]
            elif tok in FRAMING:
                shot["framing"] = FRAMING[tok]
            elif tok in MOVE:
                shot["move"] = MOVE[tok]
            elif tok == "bino":
                shot["binoculars"] = True; shot["pov"] = "binoculars"
            elif tok.startswith("crowd"):
                parts = tok.split(":")
                c = {"count": 10, "pose": "stand", "area": "crowd"}
                for p in parts[1:]:
                    p2, _, fac = p.partition(">")
                    p2, _, area = p2.partition("@")
                    if p2.isdigit():
                        c["count"] = int(p2)
                    elif p2 in V["POSES"]:
                        c["pose"] = p2
                    elif p2 in V["FACES"]:
                        c["face"] = p2
                    if area:
                        c["area"] = area
                    if fac:
                        c["facing"] = facing_ref(fac, cast)
                shot["crowd"] = c
            elif tok.startswith("q:"):
                quote_speaker = tok[2:]
            elif tok.startswith("s:"):
                subject = tok[2:]
            elif tok.startswith("t:"):
                shot["time"] = tok[2:]
            elif tok.startswith("w:"):
                shot["weather"] = tok[2:]
            elif tok.startswith("set:"):
                shot["set"] = tok[4:]
            elif tok.startswith(">"):  # standalone → shot target (attached id>x is an actor's facing)
                shot["target"] = facing_ref(tok[1:], cast)
            elif last is not None and apply_word(last, tok, V):
                pass
            else:
                a = parse_actor(tok, cast, V, None)
                if a is None:
                    errors.append(f"line {ln}: unknown directive '{tok}'")
                    continue
                for u in a.pop("_unknown", []):
                    errors.append(f"line {ln}: '{u}' is not a known pose/face/prop for {a['id']} (see data/vocab.json)")
                shot["actors"].append(a); last = a
        # defaults
        acts = shot["actors"]
        if shot["framing"] is None:
            shot["framing"] = "medium" if acts else "establishing"
        if subject:
            shot["subject"] = subject if subject in ("set",) or subject.startswith("poi:") else (subject if subject in cast else "extra:" + subject[5:])
        elif acts and shot["framing"] not in ("establishing", "aerial", "extreme_wide") :
            shot["subject"] = acts[0]["id"]
        else:
            shot["subject"] = "set"
        if shot["subject"] == "set" and shot["framing"] not in PLACE_FRAMINGS:
            shot["framing"] = "establishing"
        used = {a.get("mark") for a in acts if a.get("mark")}
        free = [m for m in "ABCDE" if m not in used]
        for a in acts:
            if "mark" not in a:
                a["mark"] = free.pop(0) if free else "A"
            a.setdefault("pose", "stand")
            if shot["framing"] == "over_shoulder" and a is acts[0] and "facing" not in a and shot.get("target"):
                a["facing"] = shot["target"]
            a.setdefault("facing", "camera")
        if shot["framing"] in ("two_shot",) and len(acts) >= 2 and "target" not in shot:
            shot["target"] = acts[1]["id"]
        if shot["framing"] == "over_shoulder" and "target" not in shot:
            errors.append(f"line {ln}: ots needs a target (>poi or >actor)")
        if quote_speaker:
            q = re.findall(r"[\"“]([^\"”]+)[\"”]?", say) or ([say.strip('"“” ')] if say.strip().startswith(("\"", "“")) else [])
            if not q and say.strip().endswith(("\"", "”")):
                q = [say.strip().rstrip('"” ')]
            col = speakers.setdefault(quote_speaker, PALETTE[len(speakers) % len(PALETTE)])
            shot["_quotes"] = [(t.strip(), col) for t in q if t.strip()]
        shots.append(shot)
    # assemble
    highlight = []
    for s in shots:
        for t, col in s.pop("_quotes", []):
            highlight.append({"text": t, "color": col})
    voice = meta.get("voice", "young_storyteller")
    prov, _, vname = voice.partition(":") if ":" in voice else ("kokoro", "", voice)
    title = meta.get("title", "untitled")
    slug = meta.get("id") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    ep = {"version": 1, "id": slug, "title": title, "language": meta.get("lang", "en"),
          "voice": {"provider": prov, "voice": vname}, "music": None,
          "captions": {"highlight": highlight}, "cast": cast, "shots": shots,
          "ending": {"hold": float(meta.get("hold", 0.8))}}
    return ep, errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("screen")
    ap.add_argument("--out")
    a = ap.parse_args()
    V, SETS = vocab()
    ep, errors = compile_screenplay(open(a.screen, encoding="utf-8").read(), V, SETS)
    for e in errors:
        print("ERROR", e)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.screen)), "episode.json")
    json.dump(ep, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    script = os.path.join(os.path.dirname(out), "script.md")
    open(script, "w", encoding="utf-8").write(f"# {ep['title']}\n\n" + " ".join(s["say"] for s in ep["shots"]) + "\n")
    n = len(" ".join(s["say"] for s in ep["shots"]).split())
    print(f"screenplay: {len(ep['shots'])} shots, {n} words, {len(ep['cast'])} cast, {len(ep['captions']['highlight'])} coloured quotes → {out}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
