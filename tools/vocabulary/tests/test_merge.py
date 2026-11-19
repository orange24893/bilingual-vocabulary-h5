import unittest

import _bootstrap
from merge import match_legacy, merge_records
from models import SourceRecord, SourceRef


def korean_candidate(source_key, guide):
    return SourceRecord(
        language="ko", text="사과", normalized_text="사과",
        primary_source="topik-standard", source_key=source_key,
        sense_id=source_key,
        fields={"phrase": {"text": guide, "translationZh": ""}}
    )


class MergeTests(unittest.TestCase):
    def test_korean_homonyms_have_distinct_stable_ids(self):
        records = [
            korean_candidate("사과01", "사과를 먹다"),
            korean_candidate("사과02", "사과를 하다")
        ]
        merged = merge_records(records, legacy=[])
        self.assertEqual(len({item["id"] for item in merged}), 2)
        self.assertEqual({item["normalizedText"] for item in merged}, {"사과"})
        self.assertEqual(merged, merge_records(list(reversed(records)), legacy=[]))

    def test_legacy_match_requires_unique_source_identity(self):
        candidates = [
            korean_candidate("사과01", "사과를 먹다"),
            korean_candidate("사과02", "사과를 하다")
        ]
        rule = {
            "language": "ko", "normalizedText": "사과",
            "matchPhrase": "사과를 먹다", "id": "builtin-ko-sagwa"
        }
        self.assertEqual(match_legacy(rule, candidates).source_key, "사과01")

    def test_english_sources_merge_without_losing_content(self):
        first = SourceRecord(
            language="en", text="Abandon", normalized_text="abandon",
            primary_source="ecdict", source_key="Abandon", priority=1,
            fields={"definitionEn": "to leave", "definitionZh": ""},
            sources=[SourceRef("ECDICT", "Abandon", "license")]
        )
        second = SourceRecord(
            language="en", text="abandon", normalized_text="abandon",
            primary_source="awl", source_key="abandon", priority=2,
            fields={"definitionEn": "", "definitionZh": "放弃"},
            sources=[SourceRef("Academic Word List", "abandon", "license")]
        )
        merged = merge_records([second, first], legacy=[])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["priority"], 1)
        self.assertEqual(merged[0]["definitionEn"], "to leave")
        self.assertEqual(merged[0]["definitionZh"], "放弃")
        self.assertEqual(len(merged[0]["sources"]), 2)

    def test_absent_legacy_word_does_not_block_unrelated_sources(self):
        candidate = korean_candidate("사과01", "사과를 먹다")
        rule = {
            "language": "en", "normalizedText": "resilient",
            "matchPhrase": "a resilient economy", "id": "builtin-en-resilient"
        }
        merged = merge_records([candidate], legacy=[rule])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["normalizedText"], "사과")

    def test_legacy_removes_only_the_exact_matching_sense(self):
        candidates = [
            korean_candidate("사과01", "사과를 먹다"),
            korean_candidate("사과02", "사과를 하다")
        ]
        rule = {
            "language": "ko", "normalizedText": "사과",
            "matchPhrase": "사과를 먹다", "id": "builtin-ko-sagwa"
        }
        merged = merge_records(candidates, legacy=[rule])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["senseId"], "사과02")


if __name__ == "__main__":
    unittest.main()
