import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import _bootstrap
from audio import (
    audio_relpath,
    generate_entry_audio,
    inspect_audio,
    save_with_retries,
    should_generate,
    validate_audio
)
from build_audio import build_audio


def entry_fixture():
    return {
        "id": "builtin-en-a", "language": "en", "text": "resilient",
        "phrase": {"text": "a resilient economy"},
        "example": {"text": "The economy is resilient."}
    }


class FakeCommunicate:
    calls = []
    fail_text = ""

    def __init__(self, text, voice, rate):
        self.text = text
        self.voice = voice
        self.rate = rate
        self.__class__.calls.append((text, voice, rate))

    async def save(self, path):
        if self.text == self.__class__.fail_text:
            raise ConnectionError("network failed")
        Path(path).write_bytes(b"mp3" * 200)


class AudioTests(unittest.TestCase):
    def setUp(self):
        FakeCommunicate.calls = []
        FakeCommunicate.fail_text = ""

    def test_hash_path_and_resume_decision(self):
        first = audio_relpath("en", "builtin-en-a", "word", "resilient")
        phrase = audio_relpath("en", "builtin-en-a", "phrase", "a resilient economy")
        changed = audio_relpath("en", "builtin-en-a", "word", "resiliently")
        self.assertNotEqual(first, changed)
        self.assertNotEqual(first, phrase)
        self.assertTrue(first.endswith(".mp3"))
        self.assertFalse(should_generate(valid_existing=True, expected_hash_matches=True))
        self.assertTrue(should_generate(valid_existing=True, expected_hash_matches=False))

    def test_inspect_audio_rejects_silence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio.mp3"
            path.write_bytes(b"mp3" * 200)
            completed = SimpleNamespace(stdout="mean_volume: -70.0 dB\nmax_volume: -60.0 dB")
            with patch("audio.MP3", return_value=SimpleNamespace(info=SimpleNamespace(length=1.0))):
                with patch("audio.subprocess.run", return_value=completed):
                    with self.assertRaisesRegex(ValueError, "Silent"):
                        inspect_audio(str(path), "ffmpeg-test")

    def test_validate_audio_checks_current_text_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / audio_relpath("en", "builtin-en-a", "word", "old")
            path.parent.mkdir(parents=True)
            path.write_bytes(b"mp3" * 200)
            with patch("audio.inspect_audio", return_value={"durationSeconds": 1.0}):
                with self.assertRaisesRegex(ValueError, "hash"):
                    validate_audio(str(path), "new", "ffmpeg-test")

    def test_unchanged_valid_files_are_not_regenerated(self):
        entry = entry_fixture()
        with tempfile.TemporaryDirectory() as directory:
            for kind, text in (
                ("word", entry["text"]),
                ("phrase", entry["phrase"]["text"]),
                ("example", entry["example"]["text"])
            ):
                path = Path(directory) / audio_relpath("en", entry["id"], kind, text)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"mp3" * 200)
            with patch("audio.edge_tts.Communicate", FakeCommunicate):
                with patch("audio.inspect_audio", return_value={"durationSeconds": 1.0}):
                    result = asyncio.run(generate_entry_audio(entry, directory, "ffmpeg-test"))
            self.assertEqual(len(result), 3)
            self.assertEqual(FakeCommunicate.calls, [])

    def test_existing_files_skip_repeat_ffmpeg_validation(self):
        entry = entry_fixture()
        with tempfile.TemporaryDirectory() as directory:
            for kind, text in (
                ("word", entry["text"]),
                ("phrase", entry["phrase"]["text"]),
                ("example", entry["example"]["text"])
            ):
                path = Path(directory) / audio_relpath("en", entry["id"], kind, text)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"mp3" * 200)
            with patch("audio.edge_tts.Communicate", FakeCommunicate):
                with patch("audio.inspect_audio") as inspect:
                    result = asyncio.run(generate_entry_audio(entry, directory, "ffmpeg-test"))
            self.assertEqual(len(result), 3)
            inspect.assert_not_called()
            self.assertEqual(FakeCommunicate.calls, [])

    def test_failed_item_preserves_prior_successes(self):
        entry = entry_fixture()
        FakeCommunicate.fail_text = entry["example"]["text"]
        with tempfile.TemporaryDirectory() as directory:
            with patch("audio.edge_tts.Communicate", FakeCommunicate):
                with patch("audio.inspect_audio", return_value={"durationSeconds": 1.0}):
                    with patch("audio.asyncio.sleep", new=AsyncMock()):
                        with self.assertRaisesRegex(ConnectionError, "network failed"):
                            asyncio.run(generate_entry_audio(entry, directory, "ffmpeg-test"))
            word = Path(directory) / audio_relpath("en", entry["id"], "word", entry["text"])
            phrase = Path(directory) / audio_relpath("en", entry["id"], "phrase", entry["phrase"]["text"])
            example = Path(directory) / audio_relpath("en", entry["id"], "example", entry["example"]["text"])
            self.assertTrue(word.exists())
            self.assertTrue(phrase.exists())
            self.assertFalse(example.exists())
            self.assertEqual(FakeCommunicate.calls[0][1], "en-US-JennyNeural")

    def test_stalled_download_times_out_and_raises_after_retries(self):
        class HangingCommunicate:
            def __init__(self, text, voice, rate):
                pass

            async def save(self, path):
                await asyncio.sleep(0.05)

        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory) / "stalled.download"
            with patch("audio.edge_tts.Communicate", HangingCommunicate):
                with patch("audio.DOWNLOAD_TIMEOUT_SECONDS", 0.01, create=True):
                    with self.assertRaises(TimeoutError):
                        asyncio.run(save_with_retries("remnant", "en-US-JennyNeural", temporary))
            self.assertFalse(temporary.exists())

    def test_build_audio_writes_report_and_marks_only_successes_ready(self):
        entry = entry_fixture()
        results = {
            kind: {
                "path": audio_relpath("en", entry["id"], kind, text),
                "validation": {"durationSeconds": 1.0}
            }
            for kind, text in (
                ("word", entry["text"]),
                ("phrase", entry["phrase"]["text"]),
                ("example", entry["example"]["text"])
            )
        }
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "audio-report.json"
            with patch("build_audio.generate_entry_audio", new=AsyncMock(return_value=results)):
                completed = asyncio.run(build_audio(
                    [entry], Path(directory) / "media", report_path, "ffmpeg-test"
                ))
            report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(completed[0]["contentStatus"], "ready")
        self.assertTrue(completed[0]["wordAudioUrl"].startswith("/static/vocabulary/audio/en/"))
        self.assertEqual(report["successes"], [entry["id"]])
        self.assertEqual(report["failures"], [])


if __name__ == "__main__":
    unittest.main()
