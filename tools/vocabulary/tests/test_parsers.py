import csv
import tempfile
import unittest
from pathlib import Path

import _bootstrap
from openpyxl import Workbook
from parse_english import parse_english
from parse_topik import EXPECTED_HEADERS, parse_topik, split_korean_headword


ENGLISH_HEADERS = [
    "word", "phonetic", "definition", "translation", "pos", "collins",
    "oxford", "tag", "bnc", "frq", "exchange", "detail", "audio"
]


class EnglishParserTests(unittest.TestCase):
    def test_ielts_selection_and_awl_source_merging(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ecdict_path = root / "ecdict.csv"
            with ecdict_path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=ENGLISH_HEADERS)
                writer.writeheader()
                writer.writerow({
                    "word": "Abandon", "phonetic": "əˈbændən",
                    "definition": "to leave", "translation": "放弃",
                    "tag": "ielts"
                })
                writer.writerow({
                    "word": "Resilient", "definition": "recovering quickly",
                    "translation": "有韧性的", "tag": "ielts gre"
                })
                writer.writerow({
                    "word": "Unselected", "definition": "not imported",
                    "translation": "不导入", "tag": "gre"
                })
            awl_path = root / "awl.txt"
            awl_path.write_text(
                "\n".join(["abandon"] + ["word{}".format(i) for i in range(569)]),
                encoding="utf-8"
            )

            records = parse_english(str(ecdict_path), str(awl_path))

            by_text = {record.normalized_text: record for record in records}
            self.assertNotIn("unselected", by_text)
            self.assertEqual(by_text["abandon"].priority, 0)
            self.assertEqual(
                {source.name for source in by_text["abandon"].sources},
                {"ECDICT", "Academic Word List"}
            )
            self.assertEqual(by_text["abandon"].fields["definitionZh"], "放弃")
            self.assertEqual(by_text["resilient"].priority, 1)
            self.assertEqual(by_text["word0"].priority, 2)
            self.assertEqual(by_text["word0"].fields["definitionEn"], "")


class KoreanParserTests(unittest.TestCase):
    def test_strict_headers_levels_guides_and_advanced_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "topik.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "어휘"
            sheet.append(EXPECTED_HEADERS)
            sheet.append([1, 1, "1급", "사과01", "명사", " 사과를 먹다 ", "초급", "1급"])
            sheet.append([2, 1, "5급", "공부하다", "동사", " 공부를 하다 ", "중급", "5급"])
            workbook.save(path)

            records = parse_topik(str(path))

            self.assertEqual(len(records), 2)
            self.assertEqual(records[0].text, "사과")
            self.assertEqual(records[0].sense_id, "사과01")
            self.assertEqual(records[0].level, 1)
            self.assertFalse(records[0].advanced)
            self.assertEqual(records[0].fields["phrase"]["text"], "사과를 먹다")
            self.assertEqual(records[1].level, 5)
            self.assertTrue(records[1].advanced)

    def test_official_xhtml_preview_uses_the_same_strict_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "topik.xhtml"
            rows = [
                EXPECTED_HEADERS,
                [1, 1, "1급", "사과01", "명사", " 사과를 먹다 ", "초급", "1급"],
                [2, 1, "6급", "논증하다", "동사", " 주장을 논증하다 ", "고급", "6급"]
            ]
            table = "".join(
                '<div class="tr">' + "".join(
                    '<div class="td style0"><div class="tWrap"><div class="tDiv">{}</div></div></div>'.format(value)
                    for value in row
                ) + "</div>"
                for row in rows
            )
            path.write_text(
                '<html><body><div id="mainTable">' + table + "</div></body></html>",
                encoding="utf-8"
            )

            records = parse_topik(str(path))

            self.assertEqual([record.text for record in records], ["사과", "논증하다"])
            self.assertEqual(records[0].fields["phrase"]["text"], "사과를 먹다")
            self.assertEqual(records[1].level, 6)
            self.assertTrue(records[1].advanced)

    def test_composite_source_senses_are_not_display_text(self):
        cases = [
            "귀하01/귀하02",
            "규칙적01∙규칙적02",
            "서른02·서른01",
            "천만02‧천만01/천만03"
        ]
        for raw in cases:
            with self.subTest(raw=raw):
                text, sense_id = split_korean_headword(raw)
                self.assertEqual(text, raw.split("0", 1)[0])
                self.assertEqual(sense_id, raw)

    def test_unexpected_headers_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "topik.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "어휘"
            sheet.append(["wrong"])
            workbook.save(path)
            with self.assertRaisesRegex(ValueError, "Unexpected 어휘 headers"):
                parse_topik(str(path))


if __name__ == "__main__":
    unittest.main()
