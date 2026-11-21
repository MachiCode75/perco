"""Map a sentence-level phoneme string back onto the narration's word tokens.

espeak phonemizes a whole chunk (so words get their in-context pronunciation), and
separates words with spaces — but not always one group per token: digits expand
("10" → one group, "1999" → three), symbols can vanish ("—"), and a few function
words may merge. We therefore align groups to tokens with a small dynamic program
that compares each token's *isolated* pronunciation with candidate runs of groups.
"""
from __future__ import annotations

import re

# Characters of the kokoro vocabulary that are punctuation / prosody marks, not phonemes.
PUNCT = set(';:,.!?¡¿—–-…"«»“”()[]{}\'’ ↓→↗↘')
_IGNORE_FOR_COMPARE = re.compile(r"[ˈˌːˑ'ʰʲ̃\s]")

MAX_GROUPS_PER_WORD = 6


def phoneme_groups(ph: str):
    """Split a phoneme string into word groups.

    Returns a list of (char_start, char_end_exclusive) spans covering only *phoneme*
    characters (punctuation stripped from the edges). Groups made only of punctuation
    are dropped.
    """
    groups = []
    for m in re.finditer(r"\S+", ph):
        s, e = m.start(), m.end()
        while s < e and ph[s] in PUNCT:
            s += 1
        while e > s and ph[e - 1] in PUNCT:
            e -= 1
        if e > s:
            groups.append((s, e))
    return groups


def _norm(p: str) -> str:
    return _IGNORE_FOR_COMPARE.sub("", "".join(c for c in p if c not in PUNCT))


def _edit(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return prev[-1]


def align_groups(word_refs, ph: str, groups):
    """Assign phoneme groups to words.

    word_refs: isolated phonemizations of each word ("" for punctuation-only tokens).
    Returns, for each word, a (first_group, last_group_inclusive) tuple or None.
    """
    n, m = len(word_refs), len(groups)
    refs = [_norm(r) for r in word_refs]
    gtxt = [_norm(ph[s:e]) for s, e in groups]
    if n == m and all(refs):
        # Fast path: one group per word (the usual case). Accept unless clearly off.
        bad = sum(_edit(r, g) > max(2, 0.6 * max(len(r), len(g))) for r, g in zip(refs, gtxt))
        if bad <= max(1, n // 10):
            return [(i, i) for i in range(n)]

    INF = float("inf")
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0.0
    for i in range(n):
        r = refs[i]
        for j in range(m + 1):
            if D[i][j] == INF:
                continue
            # word takes no group
            c0 = D[i][j] + (0.0 if not r else len(r) + 1.0)
            if c0 < D[i + 1][j]:
                D[i + 1][j], back[i + 1][j] = c0, (j, 0)
            cat = ""
            for k in range(1, MAX_GROUPS_PER_WORD + 1):
                if j + k > m:
                    break
                cat += gtxt[j + k - 1]
                cost = _edit(r, cat) if r else len(cat) + 1.0
                # tiny preference for 1:1 to break ties
                c = D[i][j] + cost + 0.01 * (k - 1)
                if c < D[i + 1][j + k]:
                    D[i + 1][j + k], back[i + 1][j + k] = c, (j, k)
    out = [None] * n
    j = m
    for i in range(n, 0, -1):
        pj, k = back[i][j]
        if k > 0:
            out[i - 1] = (pj, pj + k - 1)
        j = pj
    return out


def word_spans(word_refs, ph: str):
    """→ list per word of (char_start, char_end_exclusive) in `ph`, or None."""
    groups = phoneme_groups(ph)
    assign = align_groups(word_refs, ph, groups)
    spans = []
    for a in assign:
        if a is None:
            spans.append(None)
        else:
            spans.append((groups[a[0]][0], groups[a[1]][1]))
    return spans
