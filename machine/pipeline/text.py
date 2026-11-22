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
