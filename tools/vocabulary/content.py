import re
import unicodedata


REQUIRED_FIELDS = [
    "text", "pronunciation", "definitionEn", "definitionZh",
    "phrase.text", "phrase.translationZh", "example.text",
    "example.translationZh"
]
PLACEHOLDER_MARKERS = ("lorem ipsum", "placeholder")


def field_value(entry, path):
    value = entry
    for part in path.split("."):
        if not isinstance(value, dict):
            return ""
        value = value.get(part, "")
    return value


def is_blank_or_placeholder(value):
    if not isinstance(value, str) or not value.strip():
        return True
    normalized = value.casefold()
    return any(marker in normalized for marker in PLACEHOLDER_MARKERS)


def missing_required_fields(entry):
    paths = list(REQUIRED_FIELDS)
    if entry.get("language") == "ko":
        paths.append("definitionKo")
    missing = [path for path in paths if is_blank_or_placeholder(field_value(entry, path))]
    phrase = field_value(entry, "phrase.text")
    example = field_value(entry, "example.text")
    if phrase and example and normalize_example(phrase) == normalize_example(example):
        if "example.text" not in missing:
            missing.append("example.text")
    return missing


def normalize_example(text):
    return unicodedata.normalize("NFC", " ".join(text.split())).casefold()


def find_duplicate_examples(entries):
    seen = {}
    duplicates = {}
    for entry in entries:
        text = field_value(entry, "example.text")
        if not isinstance(text, str) or not text.strip():
            continue
        normalized = normalize_example(text)
        if normalized in seen:
            duplicates[normalized] = seen[normalized]
        else:
            seen[normalized] = text
    return sorted(duplicates.values())


def contains_latin(value):
    return re.search(r"[A-Za-z]", value) is not None


def contains_hangul(value):
    return re.search(r"[\u1100-\u11ff\uac00-\ud7af]", value) is not None


def contains_cjk(value):
    return re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", value) is not None


def validate_entry_language(entry):
    if missing_required_fields(entry):
        return False
    language = entry.get("language")
    chinese_fields = ["definitionZh", "phrase.translationZh", "example.translationZh"]
    if not all(contains_cjk(field_value(entry, path)) for path in chinese_fields):
        return False
    if not contains_latin(field_value(entry, "definitionEn")):
        return False
    if language == "en":
        latin_fields = ["text", "phrase.text", "example.text"]
        return all(contains_latin(field_value(entry, path)) for path in latin_fields)
    if language == "ko":
        hangul_fields = ["text", "definitionKo", "phrase.text", "example.text"]
        return all(contains_hangul(field_value(entry, path)) for path in hangul_fields)
    return False
