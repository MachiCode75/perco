"""Shared narration tokenisation (ARCHITECTURE.md §9). Every module must use this."""
import re, unicodedata

def narration(episode):
    """Full narration text = all shot `say` fields joined with single spaces."""
    return " ".join(s["say"].strip() for s in episode["shots"] if s.get("say", "").strip())

def words(text):
    """Split on whitespace; punctuation stays attached to the word."""
    return [w for w in re.split(r"\s+", text.strip()) if w]

def norm(word):
    """Comparison key: lowercase, strip accents and punctuation (keep letters/digits/apostrophes)."""
    w = unicodedata.normalize("NFKD", word.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    w = w.replace("’", "'")
    return re.sub(r"[^a-z0-9']", "", w)

def shot_word_ranges(episode):
    """[(shot_id, first_word_index, last_word_index_inclusive)] for shots with text."""
    out, i = [], 0
    for s in episode["shots"]:
        n = len(words(s.get("say", "")))
        out.append((s["id"], i, i + n - 1 if n else None))
        i += n
    return out


TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
TOKEN_RE = re.compile(r"^([\"“(]*)(.*?)([.,!?;:\"”')…]*)$")


def spoken_token(tok, mapping=None):
    """How the voice says a caption token (captions keep the token as written).
    Episode `speak` map first ({"3:00": "3 AM"}), then defaults: H:00 → "H AM", H:MM → "H MM", $N → "N dollars"."""
    pre, core, post = TOKEN_RE.match(tok).groups()
    if mapping and core in mapping:
        return pre + mapping[core] + post
    t = TIME_RE.match(core)
    if t:
        h, mm = int(t.group(1)), t.group(2)
        say = f"{h} AM" if mm == "00" else (f"{h} oh {int(mm)}" if mm.startswith("0") else f"{h} {mm}")
        return pre + say + post
    if re.match(r"^\$\d+$", core):
        return pre + core[1:] + " dollars" + post
    return tok


def spoken_text(toks, mapping=None):
    return " ".join(spoken_token(t, mapping) for t in toks)
