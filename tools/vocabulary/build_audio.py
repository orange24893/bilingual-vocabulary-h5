import argparse
import asyncio
import copy
import json
from pathlib import Path

from audio import generate_entry_audio


AUDIO_URL_ROOT = "/static/vocabulary/audio/"


async def build_audio(entries, audio_root, report_path, ffmpeg_path="ffmpeg"):
    completed_entries = copy.deepcopy(entries)
    semaphore = asyncio.Semaphore(4)

    async def process(entry):
        results = await generate_entry_audio(entry, audio_root, ffmpeg_path, semaphore)
        entry["wordAudioUrl"] = AUDIO_URL_ROOT + results["word"]["path"]
        entry["phrase"]["audioUrl"] = AUDIO_URL_ROOT + results["phrase"]["path"]
        entry["example"]["audioUrl"] = AUDIO_URL_ROOT + results["example"]["path"]
        entry["audioValidation"] = {
            kind: result["validation"] for kind, result in results.items()
        }
        entry["contentStatus"] = "ready"
        return entry

    outcomes = await asyncio.gather(
        *(process(entry) for entry in completed_entries), return_exceptions=True
    )
    successes = []
    failures = []
    for entry, outcome in zip(completed_entries, outcomes):
        if isinstance(outcome, Exception):
            entry["contentStatus"] = "blocked"
            failures.append({"id": entry["id"], "error": str(outcome)})
        else:
            successes.append(entry["id"])
    report = {"successes": successes, "failures": failures}
    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8"
    )
    if failures:
        raise RuntimeError("Audio generation failed for {} entries".format(len(failures)))
    return completed_entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--audio-root", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    arguments = parser.parse_args()
    entries = json.loads(arguments.input.read_text(encoding="utf-8"))
    completed = asyncio.run(build_audio(
        entries, arguments.audio_root, arguments.report, arguments.ffmpeg
    ))
    arguments.input.write_text(
        json.dumps(completed, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8"
    )


if __name__ == "__main__":
    main()
