import argparse
import json
from pathlib import Path

from audio import audio_relpath, inspect_audio
from content import find_duplicate_examples, missing_required_fields, validate_entry_language
from publish import AUDIO_PREFIX, sort_entries, to_index_entry


EXPECTED_LEGACY_IDS = sorted([
    "builtin-en-negligible", "builtin-en-resilient", "builtin-en-ambiguous",
    "builtin-en-scrutinize", "builtin-ko-sagwa", "builtin-ko-sigan",
    "builtin-ko-yaksok", "builtin-ko-gongbuhada"
])


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_publication(staging_dir, ffmpeg_path="ffmpeg"):
    staging_dir = Path(staging_dir)
    manifest = load_json(staging_dir / "data" / "manifest.json")
    if manifest.get("schemaVersion") != 1 or manifest.get("chunkSize") != 200:
        raise ValueError("Unsupported vocabulary manifest")
    if manifest.get("legacyIds") != EXPECTED_LEGACY_IDS:
        raise ValueError("Manifest does not preserve all eight legacy IDs")
    all_entries = []
    ids = set()
    identities = set()
    media_bytes = 0
    duration_seconds = 0.0
    for language in ("en", "ko"):
        language_info = manifest["languages"][language]
        entries = []
        chunk_files = language_info["chunkFiles"]
        for number, chunk_file in enumerate(chunk_files):
            chunk = load_json(staging_dir / "data" / chunk_file)
            if not chunk or len(chunk) > 200 or (number < len(chunk_files) - 1 and len(chunk) != 200):
                raise ValueError("Invalid chunk size: " + chunk_file)
            entries.extend(chunk)
        if len(entries) != language_info["count"] or entries != sort_entries(entries):
            raise ValueError("Language count or order mismatch: " + language)
        index = load_json(staging_dir / "data" / language_info["indexFile"])
        expected_index = []
        for chunk_file in chunk_files:
            chunk = load_json(staging_dir / "data" / chunk_file)
            expected_index.extend(to_index_entry(entry, chunk_file) for entry in chunk)
        if index != expected_index:
            raise ValueError("Index/chunk membership mismatch: " + language)
        for entry in entries:
            if entry["language"] != language or entry.get("contentStatus") != "ready":
                raise ValueError("Invalid language or readiness: " + entry["id"])
            if entry["id"] in ids:
                raise ValueError("Duplicate published ID: " + entry["id"])
            ids.add(entry["id"])
            identity = (language, entry["normalizedText"], entry.get("senseId", ""))
            if identity in identities:
                raise ValueError("Duplicate published sense: {!r}".format(identity))
            identities.add(identity)
            missing = missing_required_fields(entry)
            if missing or not validate_entry_language(entry) or not entry.get("sources"):
                raise ValueError("Invalid published content {}: {}".format(entry["id"], missing))
            if "placeholder" in entry.get("imageUrl", "").casefold():
                raise ValueError("Placeholder image URL: " + entry["id"])
            if language == "ko":
                level = entry.get("level")
                if not isinstance(level, int) or not 1 <= level <= 6:
                    raise ValueError("Invalid Korean level: " + entry["id"])
                if entry.get("advanced") != (level >= 5):
                    raise ValueError("Invalid Korean advanced flag: " + entry["id"])
            for kind, text, url in (
                ("word", entry["text"], entry.get("wordAudioUrl")),
                ("phrase", entry["phrase"]["text"], entry["phrase"].get("audioUrl")),
                ("example", entry["example"]["text"], entry["example"].get("audioUrl"))
            ):
                expected_url = AUDIO_PREFIX + audio_relpath(language, entry["id"], kind, text)
                if url != expected_url:
                    raise ValueError("Audio text/hash mismatch {} {}".format(entry["id"], kind))
                audio_path = staging_dir / "audio" / expected_url[len(AUDIO_PREFIX):]
                if not audio_path.is_file():
                    raise FileNotFoundError(str(audio_path))
                validation = inspect_audio(str(audio_path), ffmpeg_path)
                media_bytes += audio_path.stat().st_size
                duration_seconds += validation["durationSeconds"]
        all_entries.extend(entries)
    duplicates = find_duplicate_examples(all_entries)
    if duplicates:
        raise ValueError("Duplicate published examples: {!r}".format(duplicates))
    return {
        "count": len(all_entries),
        "mediaBytes": media_bytes,
        "durationSeconds": round(duration_seconds, 3)
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    arguments = parser.parse_args()
    report = validate_publication(arguments.staging, arguments.ffmpeg)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
