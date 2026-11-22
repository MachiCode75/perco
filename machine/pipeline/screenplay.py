"""Compact screenplay → episode.json (cuts the writing cost of an episode by ~6× with the same detail).

python3 pipeline/screenplay.py episodes/<slug>/story.screen [--out episodes/<slug>/episode.json]

FORMAT (see docs/CHEATSHEET.md for the full reference)
----------------------------------------------------
    title: The 13th Bell
    lang: en
    voice: narrator_c2                # default (user-approved Chatterbox voice); or kokoro:young_storyteller
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

v4 (coherence: show exactly what is said)
  home: wall=#9fc4e8 roof=#4a3b5a door=#c8323c trim=#ffffff   # meta: "our house", same look in house_front,
                                                              # suburban_street, rooftops_sky
  speak: 3:00=3 AM; 2:59=2 59 AM     # meta: how the voice says a caption token (default H:00 → "H AM")
  places:                            # named places = a set + options; use them in scene headers
  my_room   bedroom variant=boy curtains=1
  bea_room  bedroom variant=girl sill=cookie
  == bea_room night dark             # header: place or set, time, weather, `dark` (= power off), key=value opts
  prop     +<type>[@poi|@mark][:k=v…]   e.g. +fur_tuft@pole_top  +giant_hand@outside:pose=tap
           (keys yaw scale name offset=x,y,z; other keys → prop opts; `_` → space in text values).
           Each prop becomes a poi named after it (cookie, cookie2…) → frame it with `ins s:cookie`.
  walk     actor^<mark|poi|actor>     e.g. dad:walk^C   (pose run → runs)
  wear     actor:+<accessory>[=TEXT]  e.g. mayor:+sleep_mask=NOT_LOOKING:+sleep_mask2=NOT_LOOKING
  held     actor:<prop>=on|TEXT       e.g. bea:flashlight=on   me:note=You_looked.
  opt:k=v  per-shot set option (opt:curtains.animate=close, opt:boarded, opt:windowOpen)
  dark / lit  per-shot power off / on
  cam:<hint>  use a named camera hint of the set (e.g. cam:to_forest)
  Coherence check: data/visual_lexicon.json — a WARN when a line names something (cookie, curtain,
  mask, fur, footprint, note, pole, flashlight…) that nothing in the shot shows.
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


def parse_actor(tok, cast, V, _unused=None):
    """id followed by any of :part @mark >facing ~depth segments, in any order."""
    m = re.match(r"^([a-z0-9_]+)(.*)$", tok)
    if not m:
        return None
    aid, rest = m.group(1), m.group(2)
    if aid.startswith("extra"):
        aid = f"extra:{aid[5:] or '1'}"
    elif aid not in cast:
        return None
    if rest and rest[0] not in ":@>~^":
        return None
    a = {"id": aid}
    for kind, val in re.findall(r"([:@>~^])([^:@>~^]+)", rest):
        if kind == ":":
            if not apply_word(a, val, V):
                a.setdefault("_unknown", []).append(val)
        elif kind == "@":
            a["mark"] = val
        elif kind == ">":
            a["facing"] = facing_ref(val, cast)
        elif kind == "~":
            a["depth"] = DEPTH[val] if val in DEPTH else float(val)
        elif kind == "^":
            a["walk"] = {"to": walk_ref(val, cast)}
    return a


def walk_ref(x, cast):
    if x in cast or x.startswith("extra"):
        return "actor:" + (x if x in cast else "extra:" + (x[5:] or "1"))
    return x  # mark or poi name (the runtime resolves marks first, then pois)


def opt_value(v):
    if v in ("true", "yes", ""):
        return True
    if v in ("false", "no"):
        return False
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    if "," in v and not v.startswith("#"):
        return [opt_value(x) for x in v.split(",")]
    return v.replace("_", " ") if not v.startswith("#") else v


def set_opt(d, key, val):
    """dotted keys + shorthands: curtains=3 → curtains.layers=3; sill=cookie → ['cookie']."""
    if key == "curtains" and not isinstance(val, dict):
        key, val = "curtains.layers", val
    if key == "sill" and not isinstance(val, list):
        val = [val] if val is not True else []
    if key in ("dark", "power") :
        d["power"] = "off" if (key == "dark" or val in ("off", False)) else "on"; return
    parts = key.split(".")
    for k in parts[:-1]:
        d = d.setdefault(k, {}) if isinstance(d.get(k), dict) or k not in d else d[k]
    d[parts[-1]] = val


def parse_opts(tokens):
    d = {}
    for t in tokens:
        k, eq, v = t.partition("=")
        set_opt(d, k, opt_value(v) if eq else True)
    return d


def deep_merge(a, b):
    out = json.loads(json.dumps(a))
    for k, v in b.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def parse_prop(tok):
    """+type[@ref][:k=v…] → shot prop dict."""
    body = tok[1:]
    segs = body.split(":")
    head, _, at = segs[0].partition("@")
    p = {"type": head}
    if at:
        p["at"] = at if ":" in at else ("poi:" + at if not (len(at) <= 2 and at[:1].isupper()) else "mark:" + at)
    opts = {}
    for sg in segs[1:]:
        k, eq, v = sg.partition("=")
        val = opt_value(v) if eq else True
        if k == "yaw" or k == "scale":
            p[k] = float(val)
        elif k == "name":
            p["name"] = str(v)
        elif k == "offset":
            p["offset"] = [float(x) for x in v.split(",")]
        elif k == "at":
            p["at"] = v
        else:
            set_opt(opts, k, val)
    if opts:
        p["opts"] = opts
    return p


def facing_ref(x, cast):
    if x in ("camera", "away", "left", "right"):
        return x
    if re.match(r"^-?\d+(\.\d+)?$", x):
        return float(x)
    if x in cast or x.startswith("extra"):
        return "actor:" + (x if x in cast else "extra:" + (x[5:] or "1"))
    return x if ":" in x else "poi:" + x


def apply_word(a, w, V):
    if w.startswith("+"):  # per-shot accessory: +sleep_mask=NOT_LOOKING
        k, eq, v = w[1:].partition("=")
        acc = {"type": k}
        if k == "sleep_mask2":
            acc = {"type": "sleep_mask", "slot": "forehead"}
        if eq:
            acc["text"] = v.replace("_", " ")
        a.setdefault("wear", []).append(acc)
        return True
    if "=" in w and w.split("=")[0] in V["PROPS_HELD"] and not w.startswith("sign="):
        k, _, v = w.partition("=")
        a["prop"] = {"type": k, **({"on": True} if v == "on" else {"text": v.replace("_", " ")})}
        if k == "binoculars":
            a.setdefault("pose", "binoculars")
        return True
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


HOME_SETS = {"house_front", "suburban_street", "rooftops_sky"}
HOME = {}
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def speak_map(meta_value):
    """'3:00=3 AM; 2:59=2 59 AM' → {caption token: spoken words}."""
    m = {}
    for part in (meta_value or "").split(";"):
        k, eq, v = part.partition("=")
        if eq and k.strip():
            m[k.strip()] = v.strip()
    return m


def compile_screenplay(text, V, SETS):
    HOME.clear()
    meta, cast, shots, errors = {}, {}, [], []
    places, warns = {}, []
    scene = {"set": None, "time": "day", "weather": "clear", "opts": {}, "place": None}
    speakers = {}
    mode = "meta"
    for ln, raw in enumerate(text.splitlines(), 1):
        line = raw.split("  #")[0].rstrip() if "  #" in raw else raw.rstrip()
        if not line.strip() or line.lstrip().startswith("//"):
            continue
        if line.strip() == "cast:":
            mode = "cast"; continue
        if line.strip() == "places:":
            mode = "places"; continue
        if line.startswith("=="):
            mode = "shots"
            toks = line[2:].split()
            name = toks[0]
            if name in places:
                scene = {"set": places[name]["set"], "time": "day", "weather": "clear",
                         "opts": json.loads(json.dumps(places[name]["opts"])), "place": name}
            else:
                scene = {"set": name, "time": "day", "weather": "clear", "opts": {}, "place": name}
            extra = []
            for t in toks[1:]:
                if t in TIMES:
                    scene["time"] = t
                elif t in WEATHERS:
                    scene["weather"] = t
                else:
                    extra.append(t)
            scene["opts"] = deep_merge(scene["opts"], parse_opts(extra))
            if SETS and scene["set"] not in SETS:
                errors.append(f"line {ln}: unknown set or place '{name}'")
            continue
        if mode == "places":
            toks = line.split()
            if len(toks) < 2:
                errors.append(f"line {ln}: place needs '<name> <set> [k=v…]'"); continue
            places[toks[0]] = {"set": toks[1], "opts": parse_opts(toks[2:])}
            if SETS and toks[1] not in SETS:
                errors.append(f"line {ln}: place '{toks[0]}' uses unknown set '{toks[1]}'")
            continue
        if mode == "meta":
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
            if k.strip() == "home":
                HOME.clear(); HOME.update(parse_opts(v.split()))
            continue
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
        if scene["opts"]:
            shot["setOptions"] = json.loads(json.dumps(scene["opts"]))
        shot["_place"] = scene["place"]
        shot_opts, props = {}, []
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
            elif tok.startswith("+"):
                props.append(parse_prop(tok))
            elif tok.startswith("opt:"):
                k, eq, v = tok[4:].partition("=")
                set_opt(shot_opts, k, opt_value(v) if eq else True)
            elif tok.startswith("cam:"):  # named camera hint of the set (vocab.json cameraHints)
                shot["camera"] = {"hint": tok[4:]}
            elif tok in ("dark", "lit"):
                shot_opts["power"] = "off" if tok == "dark" else "on"
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
        if shot["set"] != "card":
            if shot_opts:
                shot["setOptions"] = deep_merge(shot.get("setOptions") or {}, shot_opts)
            if HOME and shot["set"] in HOME_SETS:
                shot["setOptions"] = deep_merge(shot.get("setOptions") or {}, {"home": HOME})
            if (shot.get("setOptions") or {}).get("power") == "off":
                shot["power"] = "off"
        if props:
            shot["props"] = props
        # defaults
        acts = shot["actors"]
        if shot["framing"] is None:
            shot["framing"] = "medium" if acts else "establishing"
        if subject:
            if subject in ("set",) or subject.startswith("poi:") or subject in cast:
                shot["subject"] = subject
            elif subject.startswith("extra"):
                shot["subject"] = "extra:" + (subject[5:] or "1")
            else:  # a prop or set poi name
                shot["subject"] = "poi:" + subject
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
        if shot["set"] == "card" and acts:
            errors.append(f"line {ln}: a text card takes no actors — start a new '== <set>' scene before this line")
        giants = [a["id"] for a in acts if cast.get(a["id"], {}).get("creature") in ("furry_giant", "sky_face")
                  or float(cast.get(a["id"], {}).get("scale", 1)) > 2]
        sinfo = SETS.get(shot["set"], {}) if SETS else {}
        if giants and sinfo.get("interior"):
            errors.append(f"line {ln}: giant {giants} inside interior set '{shot['set']}' — use an exterior scene (e.g. rooftops_sky)")
        if quote_speaker:
            q = re.findall(r"[\"“]([^\"”]+)[\"”]?", say) or ([say.strip('"“” ')] if say.strip().startswith(("\"", "“")) else [])
            if not q and say.strip().endswith(("\"", "”")):
                q = [say.strip().rstrip('"” ')]
            col = speakers.setdefault(quote_speaker, PALETTE[len(speakers) % len(PALETTE)])
            shot["_quotes"] = [(t.strip(), col) for t in q if t.strip()]
        shots.append(shot)
    # coherence + place checks (WARN)
    warns += coherence_warnings(shots, cast)
    seen_places = set()
    for s in shots:
        pl = s.pop("_place", None)
        if pl and pl != "card" and s["set"] != "card" and pl not in seen_places:
            seen_places.add(pl)
            if s["framing"] not in PLACE_FRAMINGS and s["framing"] != "insert":
                warns.append(f"shot {s['id']}: first shot in '{pl}' is a {s['framing']} — establish the place first (est/wide)")
    # assemble
    highlight = []
    for s in shots:
        for t, col in s.pop("_quotes", []):
            highlight.append({"text": t, "color": col})
    voice = meta.get("voice", "narrator_c2")
    presets = json.load(open(os.path.join(ROOT, "audio", "voices.json"))) if os.path.exists(os.path.join(ROOT, "audio", "voices.json")) else {}
    if ":" in voice:
        prov, _, vname = voice.partition(":")
    elif voice in presets:
        prov, vname = presets[voice].get("provider", "chatterbox"), voice
    else:
        prov, vname = "kokoro", voice
    title = meta.get("title", "untitled")
    slug = meta.get("id") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    ep = {"version": 1, "id": slug, "title": title, "language": meta.get("lang", "en"),
          "voice": {"provider": prov, "voice": vname}, "music": None,
          "captions": {"highlight": highlight}, "cast": cast, "shots": shots,
          "ending": {"hold": float(meta.get("hold", 0.8))}}
    sp = speak_map(meta.get("speak"))
    if sp:
        ep["speak"] = sp
    return ep, errors, warns


LEX = None


def evidence(shot, cast):
    ev = set()
    so = shot.get("setOptions") or {}
    ev.add("set:" + str(shot.get("set")))
    if shot.get("set") == "card":
        ev.add("card"); ev.add("card:" + str(so.get("style")))
    for k, v in so.items():
        ev.add("opt:" + k)
        if k == "sill":
            for it in (v if isinstance(v, list) else [v]):
                ev.add("sill:" + str(it))
    if shot.get("move"):
        ev.add("move:" + shot["move"])
    if shot.get("pov"):
        ev.add("pov:" + str(shot["pov"]))
    if (shot.get("camera") or {}).get("hint"):
        ev.add("cam:" + shot["camera"]["hint"])
    for ref in (shot.get("subject"), shot.get("target")):
        if isinstance(ref, str) and ref.startswith("poi:"):
            ev.add(ref)
    for a in shot.get("actors", []):
        aid = a["id"]
        ev.add("actor:" + aid)
        c = cast.get(aid, {}).get("creature")
        if c:
            ev.add("creature:" + c)
        for k in ("pose", "face"):
            if a.get(k):
                ev.add(f"{k}:{a[k]}")
        pr = a.get("prop")
        if pr:
            ev.add("held:" + (pr if isinstance(pr, str) else pr.get("type", "")))
        for w in a.get("wear", []) + list(cast.get(aid, {}).get("accessories", [])):
            ev.add("wear:" + (w if isinstance(w, str) else w.get("type", "")))
        if a.get("walk"):
            ev.add("walk")
        for k in ("mark", "facing"):
            v = a.get(k)
            if isinstance(v, str):
                ev.add(("mark:" if k == "mark" else "") + v)
    for p in shot.get("props", []):
        ev.add("prop:" + p["type"])
        if isinstance(p.get("at"), str):
            ev.add(p["at"])
        h = (p.get("opts") or {}).get("holding")
        if h:
            ev.add("holding:" + str(h))
    return ev


def coherence_warnings(shots, cast):
    global LEX
    if LEX is None:
        path = os.path.join(ROOT, "data", "visual_lexicon.json")
        LEX = json.load(open(path))["entries"] if os.path.exists(path) else []
    out = []
    names = {k: (v.get("name") or k).lower() for k, v in cast.items()
             if not v.get("creature") and k != "me" and len(v.get("name") or k) > 2}
    for s in shots:
        say = s["say"]; low = say.lower()
        ev = evidence(s, cast)
        so = s.get("setOptions") or {}
        card_text = (str(so.get("text", "")) + " " + str(so.get("title", ""))).lower() if s.get("set") == "card" else ""
        for e in LEX:
            m = re.search(e["re"], low)
            if not m:
                continue
            word = m.group(0)
            if card_text and word in card_text:
                continue
            if not any(x in ev for x in e["any"]):
                out.append(f"shot {s['id']} \"{say}\": says '{word}' but nothing shows it → {e['hint']}")
            elif e.get("count_opt"):
                n = re.search(r"(\d+)\s+" + re.escape(word), low)
                if n:
                    cur = so
                    for k in e["count_opt"].split("."):
                        cur = cur.get(k) if isinstance(cur, dict) else None
                    if cur is not None and int(n.group(1)) != int(cur):
                        out.append(f"shot {s['id']}: says {n.group(1)} {word} but {e['count_opt']}={cur}")
        for key, nm in names.items():
            if re.search(r"\b" + re.escape(nm) + r"\b(?!'s)", low) and ("actor:" + key) not in ev and "card" not in ev:
                out.append(f"shot {s['id']} \"{say}\": names {nm.title()} but {key} is not in the shot")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("screen")
    ap.add_argument("--out")
    a = ap.parse_args()
    V, SETS = vocab()
    ep, errors, warns = compile_screenplay(open(a.screen, encoding="utf-8").read(), V, SETS)
    for e in errors:
        print("ERROR", e)
    for w in warns:
        print("WARN ", w)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.screen)), "episode.json")
    json.dump(ep, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    script = os.path.join(os.path.dirname(out), "script.md")
    open(script, "w", encoding="utf-8").write(f"# {ep['title']}\n\n" + " ".join(s["say"] for s in ep["shots"]) + "\n")
    n = len(" ".join(s["say"] for s in ep["shots"]).split())
    print(f"screenplay: {len(ep['shots'])} shots, {n} words, {len(ep['cast'])} cast, {len(ep['captions']['highlight'])} coloured quotes → {out}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
