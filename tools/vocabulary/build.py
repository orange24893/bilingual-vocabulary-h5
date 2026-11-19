import argparse
import asyncio
import copy
import json
import os
import shutil
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio import VOICES
from build_audio import build_audio
from content import missing_required_fields
from generate_content import enrich_entry, load_krdict_snapshot, merge_krdict, repair_duplicate_examples
from merge import merge_records
from parse_english import parse_english
from parse_topik import parse_topik
from publish import publish_library, write_json
from validate_build import validate_publication


def enrich_entries(entries, work_dir, blockers_path, krdict_snapshot=None):
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    completed = []
    blockers = []
    for index, original in enumerate(entries, 1):
        entry = merge_krdict(original, krdict_snapshot or {})
        missing = missing_required_fields(entry)
        try:
            if missing:
                entry = enrich_entry(entry, work_dir / "content-cache")
            entry["contentStatus"] = "content-complete"
            completed.append(entry)
        except Exception as error:
            blocked = copy.deepcopy(entry)
            blocked["contentStatus"] = "blocked"
            completed.append(blocked)
            blockers.append({
                "id": entry.get("id"), "missingFields": missing, "error": str(error)
            })
            write_json(work_dir / "content.json", completed)
            write_json(blockers_path, blockers)
            raise RuntimeError(
                "Build stopped by {} content blockers; first error for {}: {}".format(
                    len(blockers), entry.get("id"), error
                )
            ) from error
        if index == 1 or index % 25 == 0 or index == len(entries):
            print("Content {}/{}".format(index, len(entries)), flush=True)
    write_json(work_dir / "content.json", completed)
    write_json(blockers_path, blockers)
    if blockers:
        raise RuntimeError("Build stopped by {} content blockers".format(len(blockers)))
    return completed


def source_provenance(work_dir, config):
    lock_path = work_dir / "sources" / "sources.lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    return {
        "snapshots": lock,
        "sources": {
            key: {
                "attribution": config[key]["attribution"],
                "licenseUrl": config[key]["license_url"],
                "licenseNote": config[key].get("license_note", "")
            }
            for key in ("ecdict", "awl", "topik")
        },
        "generatorModel": os.environ.get("VOCAB_GENERATION_MODEL") or None,
        "tts": {"provider": "edge-tts", "voices": VOICES},
        "audioValidation": {
            "minimumBytes": 500, "minimumSeconds": 0.2, "maximumSeconds": 300,
            "minimumMeanVolumeDb": -55, "minimumMaxVolumeDb": -45
        }
    }


def replace_publication(staging, destination):
    backup = destination.with_name(destination.name + ".backup")
    if backup.exists():
        shutil.rmtree(backup)
    if destination.exists():
        os.replace(str(destination), str(backup))
    try:
        os.replace(str(staging), str(destination))
    except Exception:
        if backup.exists() and not destination.exists():
            os.replace(str(backup), str(destination))
        raise
    if backup.exists():
        shutil.rmtree(backup)


def build_library(workspace, verify_only=False, staging=None):
    workspace = Path(workspace)
    work_dir = workspace / ".local" / "vocabulary"
    config = json.loads((workspace / "tools" / "vocabulary" / "source_config.json").read_text(encoding="utf-8"))
    legacy = json.loads((workspace / "tools" / "vocabulary" / "legacy.json").read_text(encoding="utf-8"))
    audio_root = work_dir / "audio"
    ffmpeg_path = os.environ.get("VOCAB_FFMPEG") or str(workspace / ".local" / "tools" / "ffmpeg" / "ffmpeg.exe")
    if not Path(ffmpeg_path).is_file():
        ffmpeg_path = "ffmpeg"
    raw_counts = {}
    if verify_only:
        ready_entries = json.loads((work_dir / "content-ready.json").read_text(encoding="utf-8"))
    else:
        english = parse_english(
            str(work_dir / "sources" / config["ecdict"]["snapshot"]),
            str(work_dir / "sources" / config["awl"]["snapshot"])
        )
        korean = parse_topik(str(work_dir / "sources" / config["topik"]["snapshot"]))
        raw_counts = {"en": len(english), "ko": len(korean)}
        merged = merge_records(english + korean, legacy)
        for entry in merged:
            entry.setdefault("imageUrl", "")
            entry["source"] = "builtin"
            entry["contentStatus"] = "incomplete"
        write_json(work_dir / "merged.json", merged)
        snapshot_path = os.environ.get("VOCAB_KRDICT_JSONL")
        snapshot = load_krdict_snapshot(snapshot_path) if snapshot_path else {}
        content_entries = enrich_entries(
            merged, work_dir, work_dir / "content-blockers.json", snapshot
        )
        content_entries = repair_duplicate_examples(content_entries, work_dir / "content-cache")
        write_json(work_dir / "content.json", content_entries)
        ready_entries = asyncio.run(build_audio(
            content_entries, audio_root, work_dir / "audio-report.json", ffmpeg_path
        ))
        write_json(work_dir / "content-ready.json", ready_entries)
    staging = Path(staging) if staging else workspace / "public" / "static" / "vocabulary.staging"
    if staging.exists():
        shutil.rmtree(staging)
    provenance = source_provenance(work_dir, config)
    manifest = publish_library(
        ready_entries, staging, audio_root, [rule["id"] for rule in legacy], provenance
    )
    validation = validate_publication(staging, ffmpeg_path)
    language_counts = Counter(entry["language"] for entry in ready_entries)
    level_counts = Counter(
        str(entry["level"]) for entry in ready_entries if entry["language"] == "ko"
    )
    report = {
        "raw": raw_counts,
        "merged": len(ready_entries),
        "ready": len(ready_entries),
        "blocked": 0,
        "languages": dict(language_counts),
        "koreanLevels": dict(level_counts),
        "media": validation,
        "manifest": manifest["languages"]
    }
    write_json(work_dir / "build-report.json", report)
    if not verify_only:
        replace_publication(staging, workspace / "public" / "static" / "vocabulary")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--staging", type=Path)
    arguments = parser.parse_args()
    report = build_library(arguments.workspace, arguments.verify_only, arguments.staging)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
