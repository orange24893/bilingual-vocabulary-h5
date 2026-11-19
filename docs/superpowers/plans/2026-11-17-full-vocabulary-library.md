# IELTS / TOPIK Full Vocabulary Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project constraint:** Execute inline in the current session. Do not use subagents. Do not run native `npm`, `npx`, or Taro CLI commands; H5 compilation and preview use miniapp-builder MCP. Do not create Git commits unless the user separately requests them.

**Goal:** Expand the existing eight-word H5 vocabulary app into a traceable IELTS and TOPIK 1–6 preparation library with complete required text, three real audio files per ready word, deterministic sharded loading, paginated browsing, and unchanged local learning progress.

**Architecture:** A resumable Python build pipeline snapshots source data, parses and merges source records, fills missing content through explicitly configured real build-time providers, generates and validates MP3 files, and publishes deterministic JSON indices/chunks under H5 static assets. The React runtime loads only lightweight indices and the current word chunk; the eight legacy words remain a small compatibility module with their original IDs and media. Existing Taro storage keys, scheduling rules, and audio-completion gates remain unchanged.

**Tech Stack:** Python 3, `openpyxl`, `edge-tts`, `mutagen`, FFmpeg, Python `unittest`, Taro 4.1.9, React 18, TypeScript, browser `fetch`, Node.js `node:test`, miniapp-builder MCP.

---

## File Map

### Offline build pipeline

- `tools/vocabulary/requirements.txt`: pinned Python parser, TTS, and MP3 inspection dependencies.
- `tools/vocabulary/source_config.json`: exact source URLs, local snapshot names, attribution, and license notes.
- `tools/vocabulary/models.py`: `SourceRecord`, `SourceRef`, and serialized entry contracts.
- `tools/vocabulary/normalize.py`: NFC/case normalization, stable IDs, content hashes, and audio filenames.
- `tools/vocabulary/fetch_sources.py`: atomic source downloads, SHA-256 snapshots, and prerequisite checks.
- `tools/vocabulary/parse_english.py`: ECDICT IELTS selection and 570-headword AWL merging.
- `tools/vocabulary/parse_topik.py`: strict parser for the verified `어휘` worksheet.
- `tools/vocabulary/merge.py`: language-internal deduplication, source merging, stable priority, and legacy collision handling.
- `tools/vocabulary/legacy.json`: the eight existing IDs plus deterministic source-match rules; full legacy content remains in `src/data/seed.ts`.
- `tools/vocabulary/content.py`: required-field checks, language checks, and generated-content validation.
- `tools/vocabulary/generate_content.py`: resumable OpenAI-compatible build-time enrichment for missing fields only; no runtime dependency.
- `tools/vocabulary/audio.py`: text-hash audio paths, resumable Edge TTS generation, MP3 duration checks, and FFmpeg non-silence checks.
- `tools/vocabulary/publish.py`: stable sorting, 200-entry chunks, lightweight indices, manifest, and machine-readable report.
- `tools/vocabulary/validate_build.py`: full publication gate for text, sources, IDs, duplicates, chunks, audio hashes, durations, and non-silence.
- `tools/vocabulary/build.py`: ordered pipeline entry point that refuses to publish incomplete data.
- `tools/vocabulary/tests/_bootstrap.py`: puts the builder directory on `sys.path` for direct unittest discovery.
- `tools/vocabulary/tests/*.py`: deterministic parser, merge, stability, readiness, sharding, and resume tests using small fixtures.
- `.local/vocabulary/`: ignored raw snapshots, generated-content cache, media cache, blocked-item reports, and build logs; never imported by frontend code.

### Runtime

- `public/static/vocabulary/data/manifest.json`: schema version, chunk size, per-language counts, index/chunk paths, and legacy IDs.
- `public/static/vocabulary/data/en.index.json`, `ko.index.json`: scheduling/search/pagination fields only.
- `public/static/vocabulary/data/chunks/{lang}-{number}.json`: full built-in entries in stable order.
- `public/static/vocabulary/audio/{lang}/{id}.{kind}.{hash}.mp3`: independently fetched static media.
- `public/static/vocabulary/data/provenance.json`: source versions, snapshot hashes, attribution, voices, and license notes.
- `src/types/word.ts`: optional image, source attribution, level, priority, index-entry, and manifest types.
- `src/data/seed.ts`: only the existing eight compatibility entries and their existing verified media; it is not expanded.
- `src/utils/vocabulary.cjs`: stable index sorting, pagination, and invalid-session-ID repair.
- `src/services/vocabulary.ts`: cached manifest/index/chunk fetching, legacy/custom merging, by-ID word loading, retry, and duplicate lookup.
- `src/pages/index/index.tsx`: asynchronous lightweight dashboard loading.
- `src/pages/study/index.tsx`: index-based sessions, invalid-ID repair, and current-word-only loading.
- `src/pages/wordbook/index.tsx`: index filtering, 50-item pages, asynchronous details, level/source display, and retry states.
- `src/pages/word-edit/index.tsx`: asynchronous duplicate lookup and optional custom-word images.
- `tests/vocabulary.test.cjs`: deterministic runtime sorting, pagination, language isolation, and session-repair tests.

## Task 1: Scaffold the isolated builder and snapshot traceable sources

**Files:**
- Create: `tools/vocabulary/requirements.txt`
- Create: `tools/vocabulary/source_config.json`
- Create: `tools/vocabulary/fetch_sources.py`
- Modify: `.gitignore`
- Create through the source-acquisition step: `.local/vocabulary/sources/awl/awl-headwords.txt`

- [ ] **Step 1: Pin build-only dependencies and ignore raw data**

Write:

```text
openpyxl==3.1.5
edge-tts==7.2.7
mutagen==1.47.0
```

Append to `.gitignore`:

```gitignore
/.local/vocabulary/
**/__pycache__/
```

Run:

```powershell
python -m pip install -r tools/vocabulary/requirements.txt
ffmpeg -version
```

Expected: Python dependencies install successfully and FFmpeg prints a version. FFmpeg is a build prerequisite for non-silence validation; it is not needed by learners.

- [ ] **Step 2: Record exact source identities and licenses**

Create `source_config.json` with the ECDICT CSV, official TOPIK Excel, AWL research landing page, and KRDICT documentation URLs. Use this exact official Excel URL:

```json
{
  "ecdict": {
    "url": "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
    "snapshot": "ecdict/ecdict.csv",
    "attribution": "ECDICT, skywind3000/ECDICT",
    "license_url": "https://github.com/skywind3000/ECDICT"
  },
  "awl": {
    "url": "https://ir.wgtn.ac.nz/items/8f852b22-3f82-427e-b0b3-8d9c954d8e61",
    "snapshot": "awl/awl-headwords.txt",
    "attribution": "Academic Word List, Victoria University of Wellington",
    "license_url": "https://ir.wgtn.ac.nz/items/8f852b22-3f82-427e-b0b3-8d9c954d8e61"
  },
  "topik": {
    "url": "https://www.korean.go.kr/common/download.do?file_path=reportData&c_file_name=157339df-1904-443a-b1a9-d6d34578ba93.xlsx&o_file_name=2017%EB%85%84%20%EA%B5%AD%EC%A0%9C%20%ED%86%B5%EC%9A%A9%20%ED%95%9C%EA%B5%AD%EC%96%B4%20%ED%91%9C%EC%A4%80%20%EA%B5%90%EC%9C%A1%EA%B3%BC%EC%A0%95%20%EC%A0%81%EC%9A%A9%20%EC%97%B0%EA%B5%AC(4%EB%8B%A8%EA%B3%84)%20%EC%96%B4%ED%9C%98,%20%EB%AC%B8%EB%B2%95%20%EB%93%B1%EA%B8%89%20%EB%AA%A9%EB%A1%9D_20180227_20201117%20%EC%88%98%EC%A0%95.xlsx",
    "snapshot": "topik/topik-levels.xlsx",
    "attribution": "National Institute of Korean Language, 2017 International Standard Korean Language Curriculum application research, vocabulary/grammar level list, 2020-11-17 revision",
    "license_url": "https://www.korean.go.kr/front/reportData/reportDataView.do?mn_id=207&report_seq=932",
    "license_note": "Public work free-use license; source attribution required. Verify the mark on the source page before redistribution."
  },
  "krdict": {
    "documentation": "https://krdict.korean.go.kr/chn/openApi/openApiInfo",
    "learner_dictionary": "https://krdict.korean.go.kr/m/chn/help?nation=chn"
  }
}
```

The AWL snapshot must contain the 570 official word-family headwords copied from the cited research source, one UTF-8 NFC headword per line, without numbers or derived forms. Record its source page and acquisition date in `.local/vocabulary/sources/awl/acquisition.json`. Do not invent missing headwords or expand the families.

- [ ] **Step 3: Implement atomic, reproducible downloads**

Implement `fetch_sources.py` with standard-library HTTP, a 120-second timeout, temporary files, atomic replacement, and a SHA-256 lock file:

```python
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def download(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    request = Request(url, headers={"User-Agent": "VocabularyLibraryBuilder/1.0"})
    with urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"Source HTTP {response.status}: {url}")
        temporary.write_bytes(response.read())
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    os.replace(temporary, destination)
    return {"url": url, "path": str(destination), "sha256": digest, "bytes": destination.stat().st_size}


def main(root: Path, config_path: Path) -> None:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    lock = {"ecdict": download(config["ecdict"]["url"], root / config["ecdict"]["snapshot"]),
            "topik": download(config["topik"]["url"], root / config["topik"]["snapshot"])}
    awl_path = root / config["awl"]["snapshot"]
    lines = [line.strip() for line in awl_path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) != 570 or len({line.casefold() for line in lines}) != 570:
        raise ValueError("AWL snapshot must contain exactly 570 unique family headwords")
    lock["awl"] = {"url": config["awl"]["url"], "path": str(awl_path),
                   "sha256": hashlib.sha256(awl_path.read_bytes()).hexdigest(), "bytes": awl_path.stat().st_size}
    (root / "sources.lock.json").write_text(json.dumps(lock, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
```

Add a CLI using `argparse` with required `--root` and `--config` arguments and call `main`. A failed source must stop the build; do not substitute sample data.

- [ ] **Step 4: Verify the real Korean workbook before writing its parser**

Run:

```powershell
python tools/vocabulary/fetch_sources.py --root .local/vocabulary/sources --config tools/vocabulary/source_config.json
```

Expected: downloads complete and the AWL count check passes. The already inspected official workbook has sheets `어휘` and `문법`; `어휘` has 10,636 rows including one header and these eight columns in order:

```text
전체 번호 | 등급별 번호 | 등급 | 어휘 | 품사 | 길잡이말 | 어휘교육내용개발(1-4단계) | 등급
```

The parser must validate these exact values rather than guessing column positions. Only `어휘` is imported; `문법` is outside this feature.

## Task 2: Define source records, normalization, stable IDs, and source parsers with TDD

**Files:**
- Create: `tools/vocabulary/models.py`
- Create: `tools/vocabulary/normalize.py`
- Create: `tools/vocabulary/parse_english.py`
- Create: `tools/vocabulary/parse_topik.py`
- Create: `tools/vocabulary/tests/test_normalize.py`
- Create: `tools/vocabulary/tests/test_parsers.py`

- [ ] **Step 1: Write failing normalization and parser tests**

Create `tests/_bootstrap.py` so every discovery command works from the workspace root:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

Every Python test file starts with `import _bootstrap` before importing builder modules. Test case folding, NFC, homonym sense IDs, stable IDs, AWL count, IELTS tag selection, and the exact Korean headers:

```python
import unittest
import _bootstrap
from normalize import normalize_text, stable_id, audio_stem
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
        self.assertNotEqual(audio_stem("builtin-en-a", "word", "old"), audio_stem("builtin-en-a", "word", "new"))


class KoreanHeadwordTests(unittest.TestCase):
    def test_suffix_is_source_sense_not_display_text(self):
        self.assertEqual(split_korean_headword("가격02"), ("가격", "가격02"))
        self.assertEqual(split_korean_headword("공부하다"), ("공부하다", ""))
```

Add fixture tests that build an in-memory workbook with `openpyxl.Workbook`, write the exact eight headers and two rows, save to `tempfile.TemporaryDirectory`, and assert level, guide phrase, NFC text, and `advanced` values. Add an English CSV fixture containing `word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio`; assert that only a row whose `tag` contains `ielts` is selected by the IELTS branch and that AWL merging retains both sources.

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_*.py" -v
```

Expected: FAIL because the builder modules do not exist.

- [ ] **Step 3: Implement the shared contracts and normalization**

Define immutable source data and serialized source references:

```python
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class SourceRef:
    name: str
    source_id: str
    license: str


@dataclass
class SourceRecord:
    language: str
    text: str
    normalized_text: str
    primary_source: str
    source_key: str
    sense_id: str = ""
    level: Optional[int] = None
    advanced: bool = False
    priority: int = 999999999
    fields: dict = field(default_factory=dict)
    sources: list = field(default_factory=list)
```

Implement normalization and hashes without array positions or timestamps:

```python
import hashlib
import re
import unicodedata


def normalize_text(text: str, language: str) -> str:
    value = unicodedata.normalize("NFC", " ".join(text.strip().split()))
    return value.casefold() if language == "en" else value


def stable_id(language: str, normalized: str, primary_source: str, sense_id: str = "") -> str:
    identity = "\0".join((language, normalized, primary_source, sense_id))
    return f"builtin-{language}-{hashlib.sha256(identity.encode('utf-8')).hexdigest()[:20]}"


def content_hash(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text.strip())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def audio_stem(entry_id: str, kind: str, spoken_text: str) -> str:
    if kind not in {"word", "phrase", "example"}:
        raise ValueError(f"Unsupported audio kind: {kind}")
    return f"{entry_id}.{kind}.{content_hash(spoken_text)}"
```

- [ ] **Step 4: Implement strict ECDICT/AWL and TOPIK parsers**

For ECDICT, use `csv.DictReader`, map `phonetic` to `pronunciation`, `definition` to `definitionEn`, and `translation` to `definitionZh`. Build a full normalized-word lookup for AWL enrichment, but select IELTS rows only when `ielts` is present in whitespace-separated `tag`. For each of the 570 AWL heads, merge the matching ECDICT content if available and append an AWL `SourceRef`; an AWL head absent from ECDICT remains an incomplete source record for real build-time enrichment. Set priority to `0` for IELTS+AWL, `1` for IELTS-only, and `2` for AWL-only.

For Korean, implement:

```python
import re
import unicodedata
from openpyxl import load_workbook
from normalize import normalize_text
from models import SourceRecord, SourceRef

EXPECTED_HEADERS = ["전체 번호", "등급별 번호", "등급", "어휘", "품사", "길잡이말", "어휘교육내용개발(1-4단계)", "등급"]


def split_korean_headword(raw: str):
    match = re.fullmatch(r"(.+?)(\d{2})", raw.strip())
    return (match.group(1), raw.strip()) if match else (raw.strip(), "")


def parse_topik(path: str) -> list:
    workbook = load_workbook(path, read_only=True, data_only=True)
    if "어휘" not in workbook.sheetnames:
        raise ValueError("Missing 어휘 worksheet")
    rows = workbook["어휘"].iter_rows(values_only=True)
    headers = list(next(rows))
    if headers != EXPECTED_HEADERS:
        raise ValueError(f"Unexpected 어휘 headers: {headers!r}")
    records = []
    for row in rows:
        if not row[0]:
            continue
        level_match = re.fullmatch(r"([1-6])급", str(row[2]).strip())
        if not level_match or not row[3]:
            raise ValueError(f"Invalid vocabulary row: {row!r}")
        raw = str(row[3]).strip()
        text, sense = split_korean_headword(raw)
        text = unicodedata.normalize("NFC", text)
        level = int(level_match.group(1))
        guide = " ".join(str(row[5] or "").split())
        records.append(SourceRecord(
            language="ko", text=text, normalized_text=normalize_text(text, "ko"),
            primary_source="topik-standard", source_key=raw, sense_id=sense,
            level=level, advanced=level >= 5, priority=level * 100000 + int(row[1]),
            fields={"pronunciation": "", "definitionEn": "", "definitionKo": "", "definitionZh": "",
                    "partOfSpeech": str(row[4] or "").strip(),
                    "phrase": {"text": guide, "translationZh": ""},
                    "example": {"text": "", "translationZh": ""}},
            sources=[SourceRef("National Institute of Korean Language standard curriculum", raw,
                               "Public work free-use license; attribution required")]
        ))
    groups = {}
    for record in records:
        groups.setdefault(record.normalized_text, []).append(record)
    for group in groups.values():
        if len(group) > 1:
            for record in group:
                record.sense_id = record.source_key
    return records
```

Run the parser tests; expected PASS. Then parse the real snapshot in a short Python command and report counts by level. Expected total: 10,635 source rows before any deduplication or legacy exclusion; the build must not force the final ready count to equal this raw count.

## Task 3: Merge sources deterministically and preserve the eight legacy identities

**Files:**
- Create: `tools/vocabulary/legacy.json`
- Create: `tools/vocabulary/merge.py`
- Create: `tools/vocabulary/tests/test_merge.py`

- [ ] **Step 1: Write failing merge and legacy tests**

Cover ECDICT/AWL deduplication, retained source refs, distinct Korean homonyms, deterministic rebuild IDs, and legacy replacement by exact normalized word plus official guide phrase:

```python
import unittest
import _bootstrap
from merge import merge_records, match_legacy
from models import SourceRecord


def korean_candidate(source_key, guide):
    return SourceRecord(
        language="ko", text="사과", normalized_text="사과", primary_source="topik-standard",
        source_key=source_key, sense_id=source_key,
        fields={"phrase": {"text": guide, "translationZh": ""}}
    )


class MergeTests(unittest.TestCase):
    def test_korean_homonyms_have_distinct_stable_ids(self):
        records = [korean_candidate("사과01", "사과를 먹다"), korean_candidate("사과02", "사과를 하다")]
        merged = merge_records(records, legacy=[])
        self.assertEqual(len({item["id"] for item in merged}), 2)
        self.assertEqual({item["normalizedText"] for item in merged}, {"사과"})
        self.assertEqual(merged, merge_records(list(reversed(records),), legacy=[]))

    def test_legacy_match_requires_unique_source_identity(self):
        candidates = [korean_candidate("사과01", "사과를 먹다"), korean_candidate("사과02", "사과를 하다")]
        rule = {"language": "ko", "normalizedText": "사과", "matchPhrase": "사과를 먹다", "id": "builtin-ko-sagwa"}
        self.assertEqual(match_legacy(rule, candidates).source_key, "사과01")
```

Rebuilding the same records in reversed input order must produce identical IDs, priorities, and serialized merged content.

- [ ] **Step 2: Record all eight existing IDs and match rules**

Create one JSON rule per existing word:

```json
[
  {"language":"en","normalizedText":"negligible","matchPhrase":"a negligible amount","id":"builtin-en-negligible"},
  {"language":"en","normalizedText":"resilient","matchPhrase":"a resilient economy","id":"builtin-en-resilient"},
  {"language":"en","normalizedText":"ambiguous","matchPhrase":"an ambiguous statement","id":"builtin-en-ambiguous"},
  {"language":"en","normalizedText":"scrutinize","matchPhrase":"scrutinize the evidence","id":"builtin-en-scrutinize"},
  {"language":"ko","normalizedText":"사과","matchPhrase":"사과를 먹다","id":"builtin-ko-sagwa"},
  {"language":"ko","normalizedText":"시간","matchPhrase":"시간이 있다","id":"builtin-ko-sigan"},
  {"language":"ko","normalizedText":"약속","matchPhrase":"약속을 지키다","id":"builtin-ko-yaksok"},
  {"language":"ko","normalizedText":"공부하다","matchPhrase":"한국어를 공부하다","id":"builtin-ko-gongbuhada"}
]
```

For English, match normalized text uniquely and report the phrase comparison for review. For Korean, require the normalized official guide phrase to match exactly; this distinguishes `사과01` fruit from another sense. If zero or multiple candidates match, stop with the candidate source keys and guide phrases. Never exclude every homonym merely because one sense is legacy.

- [ ] **Step 3: Implement merging and run the tests**

Group English by `(language, normalizedText, "")`; group Korean by `(language, normalizedText, sense_id)`. Merge non-empty fields without overwriting official content, union source references by `(name, source_id)`, choose the minimum priority, and retain the lowest level. Generate IDs from the primary source and sense identity. `merge_records(records, legacy)` must remove only the exact source record matched to a legacy rule, add that ID to the manifest's `legacyIds`, and leave other senses intact.

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_merge.py" -v
```

Expected: PASS, including identical output after input reversal.

## Task 4: Enrich only missing content through real build-time providers

**Files:**
- Create: `tools/vocabulary/content.py`
- Create: `tools/vocabulary/generate_content.py`
- Create: `tools/vocabulary/tests/test_content.py`

- [ ] **Step 1: Write failing readiness and validation tests**

Test all required fields for each language, optional images, missing Korean definitions, placeholder rejection, wrong-language rejection, and duplicate examples:

```python
import copy
import unittest
import _bootstrap
from content import missing_required_fields, validate_entry_language


def complete_entry(language):
    korean = language == "ko"
    return {
        "language": language,
        "text": "사과" if korean else "resilient",
        "pronunciation": "[sa-gwa]" if korean else "/rɪˈzɪliənt/",
        "definitionEn": "a round fruit" if korean else "able to recover quickly",
        "definitionKo": "둥근 과일" if korean else "",
        "definitionZh": "苹果" if korean else "有韧性的",
        "imageUrl": "",
        "phrase": {"text": "사과를 먹다" if korean else "a resilient economy", "translationZh": "吃苹果" if korean else "韧性十足的经济"},
        "example": {"text": "저는 사과를 먹어요." if korean else "The economy is resilient.", "translationZh": "我吃苹果。" if korean else "经济具有韧性。"}
    }


class ContentTests(unittest.TestCase):
    def test_image_is_optional_but_three_spoken_texts_are_required(self):
        entry = complete_entry("en")
        self.assertEqual(missing_required_fields(entry), [])
        entry["phrase"]["text"] = ""
        self.assertIn("phrase.text", missing_required_fields(entry))

    def test_korean_requires_three_definition_languages(self):
        entry = complete_entry("ko")
        entry["definitionKo"] = ""
        self.assertIn("definitionKo", missing_required_fields(entry))

    def test_language_check_rejects_wrong_learning_text(self):
        entry = copy.deepcopy(complete_entry("ko"))
        entry["text"] = "apple"
        self.assertFalse(validate_entry_language(entry))
```

A build-time generated item is not `ready` at this stage; audio validation is still required. Add another test using `unittest.mock.patch.dict` with cleared provider environment variables and assert that requesting enrichment for an incomplete entry raises a configuration error before any HTTP call.

- [ ] **Step 2: Implement strict required-field and language gates**

`missing_required_fields` must check `text`, `pronunciation`, `definitionEn`, `definitionZh`, `phrase.text`, `phrase.translationZh`, `example.text`, `example.translationZh`, and Korean `definitionKo`. `imageUrl` is never included. Reject empty values, placeholder markers such as `lorem ipsum` and `placeholder`, identical phrase/example text, and cross-entry duplicate example text. Require Latin letters in English learning text and definitions, Hangul in Korean learning text/phrase/example/`definitionKo`, and CJK characters in Chinese translations. Keep source-provided official guide phrases even when generation is enabled.

- [ ] **Step 3: Implement resumable real content generation**

Use an OpenAI-compatible HTTPS `/chat/completions` endpoint configured only by build environment variables:

```text
VOCAB_GENERATION_BASE_URL
VOCAB_GENERATION_API_KEY
VOCAB_GENERATION_MODEL
```

The builder must require all three only when fields are missing. Send one entry's available source fields and request a JSON object containing only the missing keys among `pronunciation`, `definitionEn`, `definitionKo`, `definitionZh`, `phrase`, and `example`. The prompt must require accurate learner-appropriate content, natural phrases/examples, Chinese translations, no fabricated source citations, and no copying a supplied example to another word. Parse the JSON, apply only missing fields, and run Task 4's validators. Cache each successful response under `.local/vocabulary/content-cache/{requestHash}.json`, where `requestHash` covers entry identity and all current source fields. Never put credentials in source files, generated JSON, logs, or frontend assets.

Support an optional authorized KRDICT JSONL snapshot through `VOCAB_KRDICT_JSONL`. Each line must be an object with `sourceKey` matching the official raw headword, a `fields` object limited to the shared content keys, and `source` containing `name`, `sourceId`, and `license`. Reject unknown keys, duplicate source keys, and blank values. Merge this snapshot before generation and retain its source reference. When the variable is absent, the official TOPIK word/level/guide phrase remains authoritative and missing content comes from the configured real generator or blocks publication; do not scrape a dictionary against its terms.

- [ ] **Step 4: Run content tests and verify fail-closed behavior**

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_content.py" -v
```

Expected: unit tests PASS, including the no-provider/no-HTTP test. During the ordered build in Tasks 6 and 13, missing provider configuration with incomplete entries must write entry IDs and exact missing fields to `.local/vocabulary/content-blockers.json`, exit nonzero, and avoid publishing or marking entries ready.

## Task 5: Generate three resumable, non-silent MP3 files per content-complete entry

**Files:**
- Create: `tools/vocabulary/audio.py`
- Create: `tools/vocabulary/build_audio.py`
- Create: `tools/vocabulary/tests/test_audio.py`

- [ ] **Step 1: Write failing path and resume tests**

Use temporary fake MP3 files and mock both the TTS client and validators. Assert that word/phrase/example use different spoken text hashes, an unchanged valid file is not regenerated, changed text produces a new path, and a failed item leaves prior successful files intact:

```python
import unittest
from audio import audio_relpath, should_generate


class AudioTests(unittest.TestCase):
    def test_hash_path_and_resume_decision(self):
        first = audio_relpath("en", "builtin-en-a", "word", "resilient")
        changed = audio_relpath("en", "builtin-en-a", "word", "resiliently")
        self.assertNotEqual(first, changed)
        self.assertTrue(first.endswith(".mp3"))
        self.assertFalse(should_generate(valid_existing=True, expected_hash_matches=True))
        self.assertTrue(should_generate(valid_existing=True, expected_hash_matches=False))
```

- [ ] **Step 2: Implement TTS generation and media validation**

Use `en-US-JennyNeural` for every English item and `ko-KR-SunHiNeural` for every Korean item. Generate each text independently with `edge_tts.Communicate(text, voice, rate="+0%")`; do not concatenate word clips. Limit concurrency to four, use three explicit network attempts with exponential backoff, and write via a temporary path followed by atomic rename.

`validate_audio(path, expected_hash)` must verify:

```python
from mutagen.mp3 import MP3
from pathlib import Path
import re
import subprocess
from normalize import audio_stem


def audio_relpath(language: str, entry_id: str, kind: str, spoken_text: str) -> str:
    return f"{language}/{audio_stem(entry_id, kind, spoken_text)}.mp3"


def should_generate(valid_existing: bool, expected_hash_matches: bool) -> bool:
    return not (valid_existing and expected_hash_matches)


def inspect_audio(path: str) -> dict:
    audio = MP3(path)
    duration = float(audio.info.length)
    if Path(path).stat().st_size < 500 or not 0.2 <= duration <= 300:
        raise ValueError(f"Invalid MP3 size or duration: {path}")
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True
    )
    mean = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", result.stdout)
    maximum = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", result.stdout)
    if not mean or not maximum or float(mean.group(1)) < -55 or float(maximum.group(1)) < -45:
        raise ValueError(f"Silent or invalid audio: {path}")
    return {"durationSeconds": round(duration, 3), "meanVolumeDb": float(mean.group(1)),
            "maxVolumeDb": float(maximum.group(1))}
```

`validate_audio` wraps `inspect_audio` and also asserts that the hash embedded in the filename equals `content_hash` of the current spoken text. Delete a newly generated invalid file; preserve an existing valid file only when its expected path and hash match. Write successes and failures to `.local/vocabulary/audio-report.json` so reruns process only missing or invalid items.

- [ ] **Step 3: Run tests without generating real audio**

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_audio.py" -v
```

Expected: PASS with TTS and subprocess calls mocked. Real media generation occurs only in Task 14 after source/content quality gates pass.

## Task 6: Publish deterministic chunks, lightweight indices, provenance, and a full validation gate

**Files:**
- Create: `tools/vocabulary/publish.py`
- Create: `tools/vocabulary/validate_build.py`
- Create: `tools/vocabulary/build.py`
- Create: `tools/vocabulary/tests/test_publish.py`

- [ ] **Step 1: Write failing deterministic publication tests**

Use 405 synthetic complete entries to assert 200/200/5 chunk sizes, stable chunk assignment after input reversal, lightweight index fields, language-specific counts, and absence of full phrase/example text in an index. Add tests proving missing audio blocks publication and missing images do not:

```python
import unittest
import _bootstrap
from publish import chunk_entries, to_index_entry


def make_entries(count):
    return [{
        "id": f"builtin-en-{index:03d}", "language": "en", "text": f"word{index}",
        "normalizedText": f"word{index}", "definitionZh": f"释义{index}",
        "source": "builtin", "contentStatus": "ready", "priority": index,
        "sources": [{"name": "fixture", "sourceId": str(index), "license": "test"}],
        "wordAudioUrl": f"/static/vocabulary/audio/en/builtin-en-{index:03d}.word.hash.mp3",
        "phrase": {"text": f"phrase {index}", "translationZh": f"短语{index}", "audioUrl": "phrase.mp3"},
        "example": {"text": f"Example {index}.", "translationZh": f"例句{index}", "audioUrl": "example.mp3"}
    } for index in range(count)]


class PublishTests(unittest.TestCase):
    def test_chunking_is_stable_and_index_is_lightweight(self):
        entries = make_entries(405)
        chunks = chunk_entries(entries, 200)
        self.assertEqual([len(chunk) for chunk in chunks], [200, 200, 5])
        index = to_index_entry(entries[0], "chunks/en-00000.json")
        self.assertNotIn("phrase", index)
        self.assertNotIn("example", index)
        self.assertNotIn("wordAudioUrl", index)
        self.assertEqual(index["chunkFile"], "chunks/en-00000.json")
```

- [ ] **Step 2: Implement stable publication contracts**

Sort generated entries by `(priority, normalizedText, id)`. Write JSON with UTF-8, `ensure_ascii=False`, sorted keys, two-space indentation, and a trailing newline. Each index entry contains:

```json
{
  "id": "builtin-en-stablehash",
  "language": "en",
  "text": "resilient",
  "normalizedText": "resilient",
  "definitionZh": "有韧性的",
  "source": "builtin",
  "contentStatus": "ready",
  "level": null,
  "advanced": false,
  "priority": 0,
  "sources": [{"name": "ECDICT", "sourceId": "resilient", "license": "See provenance"}],
  "chunkFile": "chunks/en-00000.json"
}
```

Korean entries use integer `level` 1–6 and `advanced=true` only for levels 5–6. Full entries contain optional `imageUrl`, three `/static/vocabulary/audio/...` URLs, all definitions, phrase/example translations, source metadata, and `contentStatus: "ready"` only after every audio check passes.

The manifest contains `schemaVersion: 1`, `chunkSize: 200`, language count/index/chunks, and all eight legacy IDs. `provenance.json` copies `sources.lock.json`, source attribution/license notes, generator model name without credentials, TTS provider/voices, and validation thresholds. The report contains raw/merged/ready/blocked counts, per-language and Korean-level distributions, duplicate groups with retained sense IDs, generated-field counts, media bytes/duration totals, and failures. It must contain no unexplained blocked ready entries.

- [ ] **Step 3: Implement the ordered fail-closed build and validator**

`build.py` executes parse → merge/legacy exclusion → content enrichment → audio generation → staging validation → publish → final validation. Content-only or audio-only modes may write work-cache reports but never mark entries ready. Publication writes a new staging directory first; only a fully valid staging tree replaces the previous generated data. Keep the previous complete static library if any stage fails. `--verify-only` reads existing source/content/audio caches, performs no network request and generates no media, then publishes to the requested staging output solely to compare deterministic IDs, ordering, chunks, and URLs; missing cache entries are errors.

`validate_build.py` must independently load every published chunk and verify unique IDs, unique `(language, normalizedText, sense identity)`, stable order, required fields, sources, language rules, non-duplicate examples, index/chunk membership, all three MP3 paths, current text hashes, MP3 parse/duration, and FFmpeg volume. It must also assert the eight legacy IDs appear in the manifest and that no placeholder image URL was introduced.

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_publish.py" -v
```

Expected: PASS.

## Task 7: Add runtime contracts and pure large-library helpers with TDD

**Files:**
- Modify: `src/types/word.ts`
- Create: `src/utils/vocabulary.cjs`
- Create: `tests/vocabulary.test.cjs`

- [ ] **Step 1: Write failing sorting, pagination, and session-repair tests**

Add concrete tests for stable priority, 50-item pages, language isolation, and preservation of old learning IDs:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { paginate, repairSession, sortIndexEntries } = require('../src/utils/vocabulary.cjs')

test('stable sorting uses priority, normalized text and ID', () => {
  const input = [
    { id: 'b', normalizedText: 'beta', priority: 1 },
    { id: 'a', normalizedText: 'alpha', priority: 1 },
    { id: 'first', normalizedText: 'z', priority: 0 }
  ]
  assert.deepEqual(sortIndexEntries(input).map(item => item.id), ['first', 'a', 'b'])
})

test('pagination is bounded and clamps the requested page', () => {
  const items = Array.from({ length: 101 }, (_, index) => ({ id: String(index) }))
  const result = paginate(items, 99, 50)
  assert.equal(result.page, 3)
  assert.equal(result.pageCount, 3)
  assert.equal(result.total, 101)
  assert.deepEqual(result.items.map(item => item.id), ['100'])
})

test('session repair skips only missing IDs and preserves the legacy eight', () => {
  const session = { wordIds: ['builtin-en-negligible', 'deleted', 'builtin-ko-sagwa'], currentWordIndex: 1, currentStepId: 'phrase', completedAudioKeys: ['word'] }
  const repaired = repairSession(session, new Set(['builtin-en-negligible', 'builtin-ko-sagwa']))
  assert.deepEqual(repaired.wordIds, ['builtin-en-negligible', 'builtin-ko-sagwa'])
  assert.equal(repaired.currentWordIndex, 1)
  assert.equal(repaired.currentStepId, 'word')
  assert.deepEqual(repaired.completedAudioKeys, [])
})
```

Also retain and run every existing scheduler test with index-shaped objects lacking images/audio URLs; a missing image must not affect queue construction, while `contentStatus: 'incomplete'` must remain excluded.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test tests/vocabulary.test.cjs
```

Expected: FAIL because `src/utils/vocabulary.cjs` is absent.

- [ ] **Step 3: Implement the pure helpers**

Implement:

```js
function sortIndexEntries(entries) {
  return [...entries].sort((a, b) =>
    (a.priority ?? 999999999) - (b.priority ?? 999999999) ||
    a.normalizedText.localeCompare(b.normalizedText) || a.id.localeCompare(b.id)
  )
}

function paginate(items, requestedPage, pageSize = 50) {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1))
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageCount }
}

function repairSession(session, validIds) {
  const previousCurrentId = session.wordIds[session.currentWordIndex]
  const currentPreserved = previousCurrentId && validIds.has(previousCurrentId)
  const validBeforeCurrent = session.wordIds.slice(0, session.currentWordIndex).filter(id => validIds.has(id)).length
  const wordIds = session.wordIds.filter(id => validIds.has(id))
  return {
    ...session,
    wordIds,
    currentWordIndex: Math.min(validBeforeCurrent, wordIds.length),
    currentStepId: currentPreserved ? session.currentStepId : 'word',
    completedAudioKeys: currentPreserved ? session.completedAudioKeys : []
  }
}

module.exports = { paginate, repairSession, sortIndexEntries }
```

- [ ] **Step 4: Extend TypeScript contracts without changing stored progress schemas**

Make `Word.imageUrl?: string`; add optional `senseId?: string`, `level?: number | null`, `advanced?: boolean`, `priority?: number`, `partOfSpeech?: string`, and `sources?: WordSourceRef[]`. Publish each generated full entry with its `senseId` so Korean homonym validation can distinguish source senses. Do not change `StudyState`, `DailyProgress`, `SessionProgress`, `Settings`, or `WordbookView`.

Add:

```ts
export interface WordSourceRef {
  name: string
  sourceId: string
  license: string
}

export interface WordIndexEntry {
  id: string
  language: Language
  text: string
  normalizedText: string
  definitionZh: string
  source: 'builtin' | 'custom'
  contentStatus: ContentStatus
  level?: number | null
  advanced?: boolean
  priority?: number
  sources?: WordSourceRef[]
  chunkFile?: string
}

export interface VocabularyManifest {
  schemaVersion: 1
  chunkSize: number
  legacyIds: string[]
  languages: Record<Language, { count: number; indexFile: string; chunkFiles: string[] }>
}
```

Run the new test plus all existing Node tests; expected PASS.

## Task 8: Implement cached static-index/chunk loading and legacy/custom merging

**Files:**
- Create: `src/services/vocabulary.ts`
- Modify: `src/data/seed.ts`
- Test: `tests/vocabulary.test.cjs`

- [ ] **Step 1: Keep the eight legacy entries intact**

Do not add generated words or media imports to `seed.ts`. Keep the existing `SEED_WORDS` export name while Tasks 9–12 migrate page imports; the vocabulary service aliases it as `LEGACY_WORDS`. Preserve all eight IDs, texts, and media references exactly. Add `priority` values matching the build order and optional level/source metadata where known. No other word may be added to this module.

- [ ] **Step 2: Implement the H5-only static repository**

Use browser `fetch` with explicit HTTP/error checks, one in-flight Promise per manifest/index/chunk, and no external runtime service:

```ts
import { SEED_WORDS as LEGACY_WORDS } from '../data/seed'
import type { Language, VocabularyManifest, Word, WordIndexEntry } from '../types/word'
import { normalizeWord } from '../utils/wordbook.cjs'
import { sortIndexEntries } from '../utils/vocabulary.cjs'
import { loadCustomWords } from './storage'

const ROOT = '/static/vocabulary/data'
const indexCache = new Map<Language, Promise<WordIndexEntry[]>>()
const chunkCache = new Map<string, Promise<Word[]>>()
let manifestPromise: Promise<VocabularyManifest> | undefined

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ROOT}/${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`词库文件读取失败（${response.status}）：${path}`)
  return await response.json() as T
}

export function loadManifest(): Promise<VocabularyManifest> {
  if (!manifestPromise) manifestPromise = fetchJson<VocabularyManifest>('manifest.json')
  return manifestPromise
}

export function loadBuiltinIndex(language: Language): Promise<WordIndexEntry[]> {
  let current = indexCache.get(language)
  if (!current) {
    current = loadManifest().then(async manifest => {
      const entries = await fetchJson<WordIndexEntry[]>(manifest.languages[language].indexFile)
      return sortIndexEntries(entries)
    })
    indexCache.set(language, current)
  }
  return current
}

function toIndexEntry(word: Word): WordIndexEntry {
  return {
    id: word.id, language: word.language, text: word.text, normalizedText: word.normalizedText,
    definitionZh: word.definitionZh, source: word.source, contentStatus: word.contentStatus,
    level: word.level, advanced: word.advanced, priority: word.priority ?? 999999999, sources: word.sources
  }
}

export async function loadIndexEntries(language: Language): Promise<WordIndexEntry[]> {
  const builtin = await loadBuiltinIndex(language)
  const legacy = LEGACY_WORDS.filter(word => word.language === language).map(toIndexEntry)
  const custom = loadCustomWords().filter(word => word.language === language).map(toIndexEntry)
  return sortIndexEntries([...builtin, ...legacy, ...custom])
}
```

Custom words remain stored locally and are converted to lightweight entries only in memory. They do not need chunk files.

- [ ] **Step 3: Implement current-word loading, retry, and duplicate lookup**

`loadWord(id)` checks custom words and legacy entries first, then locates one index entry and one chunk. A missing ID returns `undefined`; malformed JSON, missing chunk membership, and HTTP errors throw readable messages.

```ts
function loadChunk(chunkFile: string): Promise<Word[]> {
  let current = chunkCache.get(chunkFile)
  if (!current) {
    current = fetchJson<Word[]>(chunkFile)
    chunkCache.set(chunkFile, current)
  }
  return current
}

export async function loadWord(id: string): Promise<Word | undefined> {
  const local = loadCustomWords().find(word => word.id === id) || LEGACY_WORDS.find(word => word.id === id)
  if (local) return local
  for (const language of ['en', 'ko'] as const) {
    const entry = (await loadBuiltinIndex(language)).find(item => item.id === id)
    if (!entry) continue
    if (!entry.chunkFile) throw new Error(`词条缺少分片地址：${id}`)
    const word = (await loadChunk(entry.chunkFile)).find(item => item.id === id)
    if (!word) throw new Error(`词条不在声明的分片中：${id}`)
    if (word.language !== entry.language) throw new Error(`词条语言与索引不一致：${id}`)
    return word
  }
  return undefined
}
```

Add cache reset and duplicate lookup:

```ts
export function resetVocabularyCache(): void {
  manifestPromise = undefined
  indexCache.clear()
  chunkCache.clear()
}

export async function findDuplicate(language: Language, normalizedText: string, excludeId = ''): Promise<WordIndexEntry | undefined> {
  const entries = await loadIndexEntries(language)
  return entries.find(entry => entry.id !== excludeId && entry.normalizedText === normalizeWord(normalizedText, language))
}
```

On a page's explicit retry action, call `resetVocabularyCache()` before reloading. Do not automatically clear Taro storage or learning records after a media/data failure.

## Task 9: Migrate the learning dashboard to lightweight asynchronous indices

**Files:**
- Modify: `src/pages/index/index.tsx`

- [ ] **Step 1: Replace synchronous seed loading with an async refresh**

Remove `SEED_WORDS` and `loadCustomWords` imports. Add `useRef`, `loadIndexEntries`, and `resetVocabularyCache`. Keep `loadStudyStates`, settings, records, session, and all scheduling calls unchanged.

Use a request counter so a slower earlier response cannot overwrite a newer dashboard:

```ts
const dashboardRequest = useRef(0)

const refreshDashboard = async (resetCache = false) => {
  const requestId = ++dashboardRequest.current
  if (resetCache) resetVocabularyCache()
  try {
    const [englishWords, koreanWords] = await Promise.all([loadIndexEntries('en'), loadIndexEntries('ko')])
    const words = [...englishWords, ...koreanWords]
    const states = loadStudyStates()
    const settings = loadSettings()
    const records = loadDailyRecords()
    const session = loadSession()
    const today = getToday()
    const nextSummaries: Partial<Record<Language, DashboardSummary>> = {}
    LANGUAGES.forEach(({ id }) => {
      const daily = records[`${today}:${id}`]
      const completedNewIds = daily?.completedNewIds || []
      const newTarget = settings.dailyTargets[id]
      const queue = buildDailyQueue({ words, states, today, language: id, newTarget, completedNewIds })
      const resume = Boolean(session && session.date === today && session.language === id && session.currentWordIndex < session.wordIds.length)
      nextSummaries[id] = {
        completedNew: completedNewIds.length, newTarget, remainingNew: queue.newIds.length,
        dueReviews: queue.reviewIds.length, streak: calculateStreak(records, id, today),
        canStudy: resume || queue.reviewIds.length > 0 || queue.newIds.length > 0, resume
      }
    })
    if (dashboardRequest.current !== requestId) return
    setSummaries(nextSummaries)
    setError('')
  } catch (cause) {
    if (dashboardRequest.current === requestId) setError(cause instanceof Error ? cause.message : '学习数据读取失败')
  }
}

useDidShow(() => { void refreshDashboard() })
```

Render the existing error banner with a `重试词库` button calling `void refreshDashboard(true)`. The two language summaries still use separate queues, targets, records, and streaks.

- [ ] **Step 2: Run domain and type checks**

Run:

```powershell
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
```

Expected: all tests and TypeScript checks pass. No full chunk should be fetched by this page; only two index files and the manifest are required.

## Task 10: Load study words by ID and repair stale sessions without losing progress

**Files:**
- Modify: `src/pages/study/index.tsx`

- [ ] **Step 1: Replace the all-word array with current-word state**

Remove `SEED_WORDS`, the `words` state, and the derived `const currentWord = session ? words.find(word => word.id === session.wordIds[session.currentWordIndex]) : undefined`. Add state `const [currentWord, setCurrentWord] = useState<Word | null>(null)`, plus `wordLoading` and a word-load request ref. Session creation loads only `loadIndexEntries(language)` and uses the existing `buildDailyQueue`; `SessionProgress` still stores IDs only.

```ts
const createSession = async (mode: StudyMode) => {
  const words = await loadIndexEntries(language)
  const states = loadStudyStates()
  setStudyStates(states)
  const settings = loadSettings()
  const records = loadDailyRecords()
  const today = getToday()
  const daily = records[`${today}:${language}`]
  const queue = buildDailyQueue({ words, states, today, language, newTarget: settings.dailyTargets[language], completedNewIds: daily?.completedNewIds || [] })
  const next: SessionProgress = {
    date: today, language, wordIds: mode === 'review' ? queue.reviewIds : queue.newIds,
    currentWordIndex: 0, currentStepId: 'word', completedAudioKeys: [], mode
  }
  saveSession(next)
  commitSession(next)
  setImageFailed(false)
  setImageAttempt(0)
}
```

On `useDidShow`, load the language index and existing session. If resumable, call `repairSession(existing, new Set(words.map(word => word.id)))`; persist the repaired session only when its serialized value changed. Otherwise await `createSession(routeMode)`. Do not clear `studyStates`, daily records, settings, or a whole session merely because one ID disappeared.

- [ ] **Step 2: Load only the current full entry and cancel stale responses**

Add an effect keyed by the current ID. Increment a request ID, stop audio on ID change, set loading, call `loadWord(id)`, and ignore late responses. If no ID remains, set `currentWord=null` without fetching. A chunk failure displays `词条读取失败` and a retry button; retry resets only the vocabulary cache. A missing current ID after repair should trigger the same repair path rather than erase unrelated progress.

Retain `completeWord`, its state/daily/session save order, `AudioGate` keys, `interruptCurrentAudio`, `useDidHide`, `useUnload`, rating availability, and review-to-new-session behavior exactly. Change the completion button to `onClick={() => void createSession('new')}` and disable actions while the current word is loading.

- [ ] **Step 3: Verify regression behavior**

Run:

```powershell
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
```

Expected: all checks pass. In particular, audio still advances only after `onEnded`, replay/background/interruption removes completion, and a resumed session referencing any of the eight legacy IDs opens the same word and study state.

## Task 11: Add paginated wordbook browsing and on-demand details

**Files:**
- Modify: `src/pages/wordbook/index.tsx`
- Modify: `src/pages/wordbook/index.module.scss`

- [ ] **Step 1: Filter lightweight entries and paginate before rendering**

Replace the `Word[]` list state with `WordIndexEntry[]`, add `page`, `selectedWord` as `Word | null`, `detailLoading`, and a detail request ref. Delete the derived `const selectedWord = words.find(word => word.id === selectedId)` so only the asynchronously loaded full entry uses that name. On show, load the saved view first, then `loadIndexEntries(view.language)` and study states. Keep the view storage schema unchanged; page is transient UI state and resets to 1 on language/search/filter changes.

Compute:

```ts
const filteredEntries = filterWordbook(entries, states, view) as WordIndexEntry[]
const visiblePage = paginate(filteredEntries, page, 50)
```

Use `visiblePage.items` for the list and `visiblePage.total` for the result count. Add previous/next buttons, `第 {page} / {pageCount} 页`, and disable buttons at bounds. Clamp page after deletion or filtering through `paginate`; do not issue one request per list row.

`switchWordbookLanguage` must remain unchanged: filter is preserved and query is cleared. Load the new language index on language switch. Search and all four filters operate only on that language's entries. Keep distinct messages for search-empty, filter-empty, and a genuinely empty language library.

- [ ] **Step 2: Load details by ID and show level/source metadata**

`openWord(entry)` sets the selected ID, stops audio, increments the detail request, and awaits `loadWord(entry.id)`. Only the latest request may set `selectedWord` and initial audio. `consumeOpenWordId` uses the same by-ID path, so links from custom-word duplicate detection work for legacy, generated, and custom entries.

List rows use text thumbnails because lightweight indices do not carry images. Detail views continue to show a real image when present and a word/language text card otherwise. Add:

```tsx
<Text className={styles.wordItemMeta}>
  {word.language === 'ko' && word.level ? `TOPIK 分级参考 ${word.level} 级${word.advanced ? ' · 高级重点' : ''}` : 'IELTS 推荐备考词库'}
  {' · '}{word.sources?.map(source => source.name).join(' / ') || '我的生词'}
</Text>
```

Show the same level/source information in details along with the existing D-stage/due-date state. Do not call it a unique official TOPIK list.

- [ ] **Step 3: Preserve custom deletion/relearn and add retry styling**

After deleting a custom word, refresh only the current language index, delete its study state as before, clear the session if it contains that ID, close details, stop audio, and retain all other learning records. Relearn behavior remains unchanged. Add styles for pagination, metadata, loading, and retry consistent with existing buttons and spacing.

Run:

```powershell
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
```

Expected: all checks pass.

## Task 12: Make custom-word images optional and use async whole-library duplicate checks

**Files:**
- Modify: `src/pages/word-edit/index.tsx`
- Modify: `src/pages/word-edit/index.module.scss`

- [ ] **Step 1: Replace seed-only duplicate detection**

Remove `SEED_WORDS` and import `findDuplicate`. During save:

```ts
const normalizedText = normalizeWord(draft.text, draft.language)
const duplicate = await findDuplicate(draft.language, normalizedText, draft.id)
if (duplicate) {
  const fullDuplicate = await loadWord(duplicate.id)
  if (fullDuplicate) {
    await openDuplicate(fullDuplicate)
    return
  }
}
```

Import `loadWord` from the vocabulary service. The check covers generated built-ins, all eight legacy words, and custom words without loading every full chunk.

- [ ] **Step 2: Remove the image requirement while retaining real media invalidation**

Delete the validation branch that throws when `draft.imageUrl` is empty. Keep all required text and three audio URL checks. Change the save hint to `三段音频齐全后才能保存；配图为可选内容。`. Render the existing text fallback when no image exists; do not create a placeholder URL.

Retain the current behavior that changing word/phrase/example text clears only the corresponding audio and marks the draft incomplete. Generated and custom words still require all three real audio assets before saving.

- [ ] **Step 3: Run regression checks**

Run:

```powershell
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS, with no `seed.ts` import remaining in the editor.

## Task 13: Run the complete real-data build and resolve every reported blocker

**Files:**
- Generate under `.local/vocabulary/`: content cache, media cache, and reports
- Generate under `public/static/vocabulary/`: validated data and audio
- Generate no runtime credentials

- [ ] **Step 1: Run the complete builder test suite and source checks**

Run:

```powershell
python -m unittest discover -s tools/vocabulary/tests -p "test_*.py" -v
python tools/vocabulary/fetch_sources.py --root .local/vocabulary/sources --config tools/vocabulary/source_config.json
```

Expected: all Python tests pass; ECDICT, exact 570-headword AWL, and official TOPIK snapshots have SHA-256 entries. Confirm the source page license marks before redistribution and keep attribution in `provenance.json`.

- [ ] **Step 2: Build text, then audio, then publish**

Set the real build-time content provider variables in the shell environment without saving them to files. If the optional authorized KRDICT JSONL snapshot from Task 4 is used, set `VOCAB_KRDICT_JSONL` to its local path and record only its non-secret source metadata. Run:

```powershell
python tools/vocabulary/build.py --root .local/vocabulary --sources .local/vocabulary/sources --output public/static/vocabulary
```

Expected: English merges ECDICT IELTS and AWL representatives; Korean imports levels 1–6 with 5–6 marked advanced. Missing content is either genuinely enriched and validated or listed by ID/field in the report. Every published ready entry has three independently generated MP3 files whose hashes match current spoken text. Rerunning the command reuses valid content/audio caches and produces identical IDs/chunks; it does not regenerate valid media.

If any source, content, or audio item fails, inspect the machine-readable report, correct the specific source/adapter/item, and rerun the resumable build. Do not bypass readiness, insert template sentences, or publish a partial index as complete.

- [ ] **Step 3: Independently validate the final static tree and reproducibility**

Run:

```powershell
python tools/vocabulary/validate_build.py --root public/static/vocabulary --report .local/vocabulary/final-validation.json
python tools/vocabulary/build.py --root .local/vocabulary --sources .local/vocabulary/sources --output .local/vocabulary/rebuild --verify-only
```

Expected: the final report has zero unexplained missing fields, duplicate identities, invalid media, or stale hashes; the rebuild has identical entry IDs, index ordering, chunk assignments, and audio URLs. Record actual English/Korean counts and Korean level distribution from the report rather than promising rounded totals. Existing eight IDs remain in the manifest and are not duplicated in generated chunks.

## Task 14: Run full regression and H5 browser acceptance

**Files:**
- Modify only files implicated by a reproduced failure
- Validate through miniapp-builder MCP; do not run native Taro commands

- [ ] **Step 1: Run all automated domain and type checks**

Run:

```powershell
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit
python -m unittest discover -s tools/vocabulary/tests -p "test_*.py" -v
python tools/vocabulary/validate_build.py --root public/static/vocabulary --report .local/vocabulary/final-validation.json
```

Expected: every suite passes. Existing scheduler, streak, rating, language-isolation, audio-step, and wordbook tests remain green. New tests prove stable sorting, bounded pages, invalid-ID repair, optional images, and legacy ID preservation.

- [ ] **Step 2: Compile and open the H5 workbench**

Call miniapp-builder `status(projectRoot)`. If no preview port exists, call `control(action: "start")`; then call `workbench(projectRoot)` once. Only `state: "ready"` counts as successful H5 compilation. If compilation fails, use `inspect(source: "compile")`, fix the identified source issue, and rebuild through the same MCP workflow. Do not run `npm`, `npx`, or a native Taro CLI command.

- [ ] **Step 3: Verify data loading and large-library interaction in the browser**

Using the existing local H5 preview, verify with browser network/error evidence where available:

1. The dashboard requests the manifest and lightweight indices, not every full chunk; both languages show correct independent targets, due reviews, new-word capacity, and streaks.
2. Starting a session fetches only the chunk containing the current generated word. Moving to a word in another chunk fetches that chunk on demand. A failed chunk shows retry and does not delete local records.
3. Wordbook search/filter/page operations stay within the selected language, show 50 items per page, and switching language preserves the filter while clearing search. Search-empty and filter-empty messages remain distinct.
4. Korean rows/details show actual 1–6 levels, 5–6 advanced emphasis, and “分级参考” wording. Source attribution is visible. Abstract words without images show text cards and still enter queues.
5. Opening a generated word and each of the eight legacy words loads complete definitions, phrase, example, and three playable MP3 URLs. Legacy study states still match their original IDs.

- [ ] **Step 4: Verify audio gates, persistence, and cache separation**

For English and Korean, play word, phrase, and example audio through actual completion; only then may the next step/rating unlock. Replay, backgrounding, interruption, and failed playback revoke the current step completion. Do not use a timer or seek/skip control.

Refresh after rating a word and confirm study state, daily progress, session, settings, and wordbook view persist under their existing `vocab:v1:*` keys. Clear browser media/cache storage only and confirm learning records remain. Restore a test session containing one deleted custom ID and valid IDs on both sides; only the deleted ID is skipped. Simulate a storage-quota write failure and confirm the page shows the save error without clearing existing states, daily records, or settings. Finally verify normal learning requires no WeChat deployment, cloud function, runtime AI key, or runtime TTS configuration.

## Completion Gate

The feature is complete only when:

- The selected IELTS and TOPIK 1–6 source records all have traceable build outcomes and actual counts in the final report.
- Every queue-eligible entry has all required language-specific text and three validated, non-silent MP3 files; images are optional.
- The eight original IDs, all user learning records, custom words, independent language targets, review scheduling, and staged definitions are preserved.
- Runtime reads static manifest/index/chunk/media files only; no runtime generation credentials or cloud services are needed.
- All Python/Node/TypeScript checks and the H5 workbench acceptance pass, with no unexplained build blocker or media failure.
