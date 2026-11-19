import json
import shutil
from pathlib import Path

from content import missing_required_fields, validate_entry_language


AUDIO_PREFIX = "/static/vocabulary/audio/"


def sort_entries(entries):
    return sorted(
        entries,
        key=lambda entry: (
            entry.get("priority", 999999999), entry["normalizedText"], entry["id"]
        )
    )


def chunk_entries(entries, chunk_size=200):
    ordered = sort_entries(entries)
    return [ordered[index:index + chunk_size] for index in range(0, len(ordered), chunk_size)]


def to_index_entry(entry, chunk_file):
    return {
        "id": entry["id"],
        "language": entry["language"],
        "text": entry["text"],
        "normalizedText": entry["normalizedText"],
        "definitionZh": entry["definitionZh"],
        "source": "builtin",
        "contentStatus": entry["contentStatus"],
        "level": entry.get("level"),
        "advanced": entry.get("advanced", False),
        "priority": entry.get("priority", 999999999),
        "sources": entry.get("sources", []),
        "chunkFile": chunk_file
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8"
    )


def audio_source(audio_root, url, field_name):
    if not isinstance(url, str) or not url.startswith(AUDIO_PREFIX):
        raise ValueError("Invalid {}: {}".format(field_name, url))
    path = audio_root / url[len(AUDIO_PREFIX):]
    if not path.is_file():
        raise FileNotFoundError("{} audio is missing: {}".format(field_name, path))
    return path


def publish_library(entries, staging_dir, audio_root, legacy_ids, provenance):
    staging_dir = Path(staging_dir)
    audio_root = Path(audio_root)
    if staging_dir.exists() and any(staging_dir.iterdir()):
        raise FileExistsError("Staging directory is not empty: {}".format(staging_dir))
    ids = set()
    for entry in entries:
        if entry["id"] in ids:
            raise ValueError("Duplicate entry ID: " + entry["id"])
        ids.add(entry["id"])
        if entry.get("contentStatus") != "ready":
            raise ValueError("Entry is not ready: " + entry["id"])
        missing = missing_required_fields(entry)
        if missing or not validate_entry_language(entry):
            raise ValueError("Invalid entry {}: {}".format(entry["id"], missing))
        if not entry.get("sources"):
            raise ValueError("Entry has no source attribution: " + entry["id"])
        if "placeholder" in entry.get("imageUrl", "").casefold():
            raise ValueError("Placeholder image URL: " + entry["id"])

    manifest = {
        "schemaVersion": 1,
        "chunkSize": 200,
        "legacyIds": sorted(legacy_ids),
        "languages": {}
    }
    for language in ("en", "ko"):
        language_entries = [entry for entry in entries if entry["language"] == language]
        chunks = chunk_entries(language_entries, 200)
        chunk_files = []
        index_entries = []
        for number, chunk in enumerate(chunks):
            chunk_file = "chunks/{}-{:05d}.json".format(language, number)
            chunk_files.append(chunk_file)
            write_json(staging_dir / "data" / chunk_file, chunk)
            for entry in chunk:
                index_entries.append(to_index_entry(entry, chunk_file))
                for field_name, url in (
                    ("wordAudioUrl", entry["wordAudioUrl"]),
                    ("phrase.audioUrl", entry["phrase"]["audioUrl"]),
                    ("example.audioUrl", entry["example"]["audioUrl"])
                ):
                    source = audio_source(audio_root, url, field_name)
                    destination = staging_dir / "audio" / url[len(AUDIO_PREFIX):]
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(str(source), str(destination))
        index_file = "{}.index.json".format(language)
        write_json(staging_dir / "data" / index_file, index_entries)
        manifest["languages"][language] = {
            "count": len(language_entries),
            "indexFile": index_file,
            "chunkFiles": chunk_files
        }
    write_json(staging_dir / "data" / "manifest.json", manifest)
    write_json(staging_dir / "data" / "provenance.json", provenance)
    return manifest
