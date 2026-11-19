import csv

from fetch_sources import validate_awl
from models import SourceRecord, SourceRef
from normalize import normalize_text


ECDICT_LICENSE = "See skywind3000/ECDICT repository license"
AWL_LICENSE = "See Victoria University of Wellington research source"


def english_record(row, primary_source="ecdict", priority=1):
    word = " ".join(str(row.get("word") or "").split())
    normalized = normalize_text(word, "en")
    return SourceRecord(
        language="en",
        text=word,
        normalized_text=normalized,
        primary_source=primary_source,
        source_key=word,
        priority=priority,
        fields={
            "pronunciation": str(row.get("phonetic") or "").strip(),
            "definitionEn": str(row.get("definition") or "").strip(),
            "definitionKo": "",
            "definitionZh": str(row.get("translation") or "").strip(),
            "partOfSpeech": str(row.get("pos") or "").strip(),
            "phrase": {"text": "", "translationZh": ""},
            "example": {"text": "", "translationZh": ""}
        },
        sources=[SourceRef("ECDICT", word, ECDICT_LICENSE)]
    )


def parse_english(ecdict_path, awl_path):
    with open(ecdict_path, encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    lookup = {}
    ielts = []
    for row in rows:
        normalized = normalize_text(str(row.get("word") or ""), "en")
        if not normalized:
            continue
        lookup.setdefault(normalized, row)
        tags = str(row.get("tag") or "").casefold().split()
        if "ielts" in tags:
            ielts.append(english_record(row))

    records = list(ielts)
    ielts_lookup = {record.normalized_text: record for record in records}
    for headword in validate_awl(awl_path):
        normalized = normalize_text(headword, "en")
        record = ielts_lookup.get(normalized)
        if record is not None:
            record.priority = 0
            record.sources.append(SourceRef("Academic Word List", headword, AWL_LICENSE))
            continue
        row = lookup.get(normalized)
        if row is not None:
            record = english_record(row, priority=2)
        else:
            record = SourceRecord(
                language="en", text=headword, normalized_text=normalized,
                primary_source="awl", source_key=headword, priority=2,
                fields={
                    "pronunciation": "", "definitionEn": "", "definitionKo": "",
                    "definitionZh": "", "partOfSpeech": "",
                    "phrase": {"text": "", "translationZh": ""},
                    "example": {"text": "", "translationZh": ""}
                }
            )
        record.sources.append(SourceRef("Academic Word List", headword, AWL_LICENSE))
        records.append(record)
    return records
