"""python3 -m unittest discover -s audio/tests   (no network, no models needed)"""
import base64
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import align  # noqa: E402
import tts  # noqa: E402
from tts_elevenlabs import ElevenLabsProvider, alignment_to_word_times  # noqa: E402


def synthetic_alignment(text, t0=0.1, per_char=0.06, gap_after=None):
    """Fake ElevenLabs alignment: every char lasts per_char; optional extra gap after given char idx."""
    chars, s, e, t = [], [], [], t0
    for i, c in enumerate(text):
        chars.append(c)
        s.append(round(t, 3))
        t += per_char
        e.append(round(t, 3))
        if gap_after and i in gap_after:
            t += gap_after[i]
    return {"characters": chars, "character_start_times_seconds": s, "character_end_times_seconds": e}


class TestElevenLabsParsing(unittest.TestCase):
    def test_exact_alignment(self):
        words = ["There's", "a", "copy", "of", "everyone.", "—", "Later!"]
        text = " ".join(words)
        al = synthetic_alignment(text)
        times = alignment_to_word_times(text, words, al)
        self.assertEqual(len(times), len(words))
        # "There's" = chars 0..6 → start 0.1, end 0.1+7*0.06
        self.assertAlmostEqual(times[0][0], 0.1, places=3)
        self.assertAlmostEqual(times[0][1], 0.1 + 7 * 0.06, places=3)
        # punctuation excluded from the end of "everyone."
        i = text.index("everyone.")
        self.assertAlmostEqual(times[4][1], al["character_end_times_seconds"][i + 7], places=3)
        # punctuation-only token still gets a time
        self.assertIsNotNone(times[5])
        starts = [t[0] for t in times]
        self.assertEqual(starts, sorted(starts))

    def test_normalised_alignment_mismatch(self):
        words = ["I", "counted", "10", "seconds…"]
        text = " ".join(words)
        # the API returned slightly different characters (e.g. ellipsis expanded)
        al = synthetic_alignment("I counted 10 seconds...")
        times = alignment_to_word_times(text, words, al)
        self.assertTrue(all(t is not None for t in times))
        self.assertLess(times[2][0], times[3][0])

    def test_full_response_decode(self):
        """A complete synthetic /with-timestamps response with pcm audio goes through synth()."""
        import numpy as np
        p = ElevenLabsProvider(voice="will", output_format="pcm_24000")
        words = ["Hello", "there."]
        text = " ".join(words)
        pcm = (np.sin(np.arange(24000) / 10) * 8000).astype("<i2").tobytes()
        resp = {"audio_base64": base64.b64encode(pcm).decode(), "alignment": synthetic_alignment(text),
                "normalized_alignment": synthetic_alignment(text)}
        p._post = lambda body: resp
        audio, times = p.synth(text, words)
        self.assertAlmostEqual(len(audio) / 44100, 1.0, places=2)
        self.assertEqual(len(times), 2)
        body = p.request_body(text)
        self.assertEqual(body["model_id"], "eleven_multilingual_v2")
        self.assertIn("speed", body["voice_settings"])
        json.dumps(body)


class TestAlign(unittest.TestCase):
    def test_one_to_one(self):
        ph = "ðɛɹz ɐ kˈɑːpi ʌv ˈɛvɹɪwˌʌn."
        refs = ["ðɛɹz", "ˈeɪ", "kˈɑːpi", "ˈʌv", "ˈɛvɹɪwˌʌn"]
        spans = align.word_spans(refs, ph)
        self.assertEqual([ph[a:b] for a, b in spans], ["ðɛɹz", "ɐ", "kˈɑːpi", "ʌv", "ˈɛvɹɪwˌʌn"])

    def test_number_expands_to_several_groups(self):
        ph = "ɪn nˈaɪntiːn nˈaɪndi nˈaɪn, wiː lˈɛft."
        refs = ["ˈɪn", "nˈaɪntiːn nˈaɪndi nˈaɪn", "wˈiː", "lˈɛft"]
        spans = align.word_spans(refs, ph)
        self.assertEqual(ph[spans[1][0]:spans[1][1]], "nˈaɪntiːn nˈaɪndi nˈaɪn")
        self.assertEqual(ph[spans[3][0]:spans[3][1]], "lˈɛft")

    def test_dropped_symbol(self):
        ph = "wˈeɪt, ðɛn ɹˈʌn."
        refs = ["wˈeɪt", "", "ðˈɛn", "ɹˈʌn"]
        spans = align.word_spans(refs, ph)
        self.assertIsNone(spans[1])
        self.assertEqual(ph[spans[2][0]:spans[2][1]], "ðɛn")


class TestChunks(unittest.TestCase):
    def test_sentences_and_short_merge(self):
        toks = "It looks like ours. Ten. Then mine woke up and waved too.".split()
        ch = tts.make_chunks(toks, set())
        self.assertEqual(ch[0], (0, 4, "sentence"))
        self.assertEqual(ch[-1][1], len(toks))
        self.assertEqual(len(ch), 2)  # "Ten." merged with the next sentence

    def test_long_sentence_split_at_clause(self):
        toks = ("one two three four five six seven eight nine ten, " * 6).split()
        toks[-1] = "end."
        ch = tts.make_chunks(toks, set(), max_words=25)
        self.assertTrue(all(b - a <= 25 for a, b, _ in ch))
        self.assertTrue(all(toks[b - 1].endswith((",", ".")) for a, b, _ in ch))


if __name__ == "__main__":
    unittest.main()
