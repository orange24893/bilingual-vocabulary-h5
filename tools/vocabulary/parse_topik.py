import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

from openpyxl import load_workbook
from models import SourceRecord, SourceRef
from normalize import normalize_text


EXPECTED_HEADERS = [
    "전체 번호", "등급별 번호", "등급", "어휘", "품사", "길잡이말",
    "어휘교육내용개발(1-4단계)", "등급"
]


def split_korean_headword(raw):
    raw = raw.strip()
    parts = [part.strip() for part in re.split(r"[/∙·‧]", raw)]
    matches = [re.fullmatch(r"(.+?)(\d{2})", part) for part in parts]
    if all(matches):
        bases = {match.group(1) for match in matches}
        if len(bases) == 1:
            return bases.pop(), raw
    return raw, ""


class _WorksheetHtmlParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.cells = []
        self.cell_text = []
        self.row_depth = 0
        self.cell_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag != "div":
            return
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if "tr" in classes and not self.row_depth:
            self.row_depth = 1
            self.cells = []
            return
        if not self.row_depth:
            return
        self.row_depth += 1
        if "td" in classes and not self.cell_depth:
            self.cell_depth = 1
            self.cell_text = []
        elif self.cell_depth:
            self.cell_depth += 1

    def handle_endtag(self, tag):
        if tag != "div" or not self.row_depth:
            return
        self.row_depth -= 1
        if self.cell_depth:
            self.cell_depth -= 1
            if not self.cell_depth:
                self.cells.append("".join(self.cell_text).strip())
        if not self.row_depth:
            self.rows.append(self.cells)

    def handle_data(self, data):
        if self.cell_depth:
            self.cell_text.append(data)


def _records_from_rows(rows):
    records = []
    for row in rows:
        if not row[0]:
            continue
        level_match = re.fullmatch(r"([1-6])급", str(row[2]).strip())
        if not level_match or not row[3]:
            raise ValueError("Invalid vocabulary row: {!r}".format(row))
        raw = str(row[3]).strip()
        text, sense = split_korean_headword(raw)
        text = unicodedata.normalize("NFC", text)
        level = int(level_match.group(1))
        guide = " ".join(str(row[5] or "").split())
        records.append(SourceRecord(
            language="ko", text=text, normalized_text=normalize_text(text, "ko"),
            primary_source="topik-standard", source_key=raw, sense_id=sense,
            level=level, advanced=level >= 5,
            priority=level * 100000 + int(row[1]),
            fields={
                "pronunciation": "", "definitionEn": "", "definitionKo": "",
                "definitionZh": "", "partOfSpeech": str(row[4] or "").strip(),
                "phrase": {"text": guide, "translationZh": ""},
                "example": {"text": "", "translationZh": ""}
            },
            sources=[SourceRef(
                "National Institute of Korean Language standard curriculum",
                raw,
                "Public work free-use license; attribution required"
            )]
        ))
    return records


def parse_topik(path):
    workbook = None
    if Path(path).suffix.lower() in {".xhtml", ".html"}:
        parser = _WorksheetHtmlParser()
        parser.feed(Path(path).read_text(encoding="utf-8-sig"))
        parser.close()
        rows = iter(parser.rows)
    else:
        workbook = load_workbook(path, read_only=True, data_only=True)
        if "어휘" not in workbook.sheetnames:
            workbook.close()
            raise ValueError("Missing 어휘 worksheet")
        rows = workbook["어휘"].iter_rows(values_only=True)
    headers = list(next(rows))
    if headers != EXPECTED_HEADERS:
        if workbook:
            workbook.close()
        raise ValueError("Unexpected 어휘 headers: {!r}".format(headers))
    records = _records_from_rows(rows)
    if workbook:
        workbook.close()
    groups = {}
    for record in records:
        groups.setdefault(record.normalized_text, []).append(record)
    for group in groups.values():
        if len(group) > 1:
            for record in group:
                record.sense_id = record.source_key
    return records
