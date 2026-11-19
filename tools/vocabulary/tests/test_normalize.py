import unittest

import _bootstrap
from normalize import audio_stem, normalize_text, stable_id
from parse_topik import split_korean_headword


class NormalizeTests(unittest.TestCase):
    def test_language_normalization_and_stable_identity(self):
        self.assertEqual(normalize_text("  Negligible  ", "en"), "negligible")
        self.assertEqual(normalize_text("사과", "ko"), "사과")
        first = stable_id("ko", "사과", "topik-standard", "사과01")
        second = stable_id("ko", "사과", "topik-standard", "사과01")
        other = stable_id("ko", "사과", "topik-standard", "사과02")
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertTrue(first.startswith("builtin-ko-"))

    def test_audio_name_binds_spoken_text(self):
        self.assertNotEqual(
            audio_stem("builtin-en-a", "word", "old"),
            audio_stem("builtin-en-a", "word", "new")
        )


class KoreanHeadwordTests(unittest.TestCase):
    def test_suffix_is_source_sense_not_display_text(self):
        self.assertEqual(split_korean_headword("가격02"), ("가격", "가격02"))
        self.assertEqual(split_korean_headword("공부하다"), ("공부하다", ""))


if __name__ == "__main__":
    unittest.main()
