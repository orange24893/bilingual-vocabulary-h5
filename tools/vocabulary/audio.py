import asyncio
import os
import re
import subprocess
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3
from normalize import audio_stem, content_hash


VOICES = {"en": "en-US-JennyNeural", "ko": "ko-KR-SunHiNeural"}
DOWNLOAD_TIMEOUT_SECONDS = 60


def audio_relpath(language, entry_id, kind, spoken_text):
    return "{}/{}.mp3".format(language, audio_stem(entry_id, kind, spoken_text))


def should_generate(valid_existing, expected_hash_matches):
    return not (valid_existing and expected_hash_matches)


def inspect_audio(path, ffmpeg_path="ffmpeg"):
    audio = MP3(path)
    duration = float(audio.info.length)
    if Path(path).stat().st_size < 500 or not 0.2 <= duration <= 300:
        raise ValueError("Invalid MP3 size or duration: {}".format(path))
    result = subprocess.run(
        [ffmpeg_path, "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True
    )
    mean = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", result.stdout)
    maximum = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", result.stdout)
    if not mean or not maximum or float(mean.group(1)) < -55 or float(maximum.group(1)) < -45:
        raise ValueError("Silent or invalid audio: {}".format(path))
    return {
        "durationSeconds": round(duration, 3),
        "meanVolumeDb": float(mean.group(1)),
        "maxVolumeDb": float(maximum.group(1))
    }


def validate_audio(path, spoken_text, ffmpeg_path="ffmpeg"):
    expected = content_hash(spoken_text)
    if Path(path).stem.split(".")[-1] != expected:
        raise ValueError("Audio filename hash does not match spoken text: {}".format(path))
    return inspect_audio(path, ffmpeg_path)


async def save_with_retries(text, voice, temporary, semaphore=None):
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(text, voice, rate="+0%")
            if semaphore is None:
                await asyncio.wait_for(
                    communicate.save(str(temporary)), timeout=DOWNLOAD_TIMEOUT_SECONDS
                )
            else:
                async with semaphore:
                    await asyncio.wait_for(
                        communicate.save(str(temporary)), timeout=DOWNLOAD_TIMEOUT_SECONDS
                    )
            return
        except Exception:
            temporary.unlink(missing_ok=True)
            if attempt == 2:
                raise
            await asyncio.sleep(2 ** attempt)


async def generate_entry_audio(entry, audio_root, ffmpeg_path="ffmpeg", semaphore=None):
    audio_root = Path(audio_root)
    results = {}
    items = (
        ("word", entry["text"]),
        ("phrase", entry["phrase"]["text"]),
        ("example", entry["example"]["text"])
    )
    for kind, text in items:
        relative = audio_relpath(entry["language"], entry["id"], kind, text)
        destination = audio_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        hash_matches = destination.stem.split(".")[-1] == content_hash(text)
        if destination.exists() and hash_matches:
            # Publication independently validates every reused file before release.
            validation = entry.get("audioValidation", {}).get(kind, {})
            results[kind] = {"path": relative, "validation": validation}
            continue
        temporary = destination.with_suffix(".download")
        await save_with_retries(text, VOICES[entry["language"]], temporary, semaphore)
        try:
            inspect_audio(str(temporary), ffmpeg_path)
            os.replace(str(temporary), str(destination))
            validation = validate_audio(str(destination), text, ffmpeg_path)
        except Exception:
            temporary.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
            raise
        results[kind] = {"path": relative, "validation": validation}
    return results
