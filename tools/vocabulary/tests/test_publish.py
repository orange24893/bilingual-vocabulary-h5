import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import _bootstrap
from audio import audio_relpath
from publish import chunk_entries, publish_library, to_index_entry
from validate_build import validate_publication


LEGACY_IDS = [
    "builtin-en-negligible", "builtin-en-resilient", "builtin-en-ambiguous",
    "builtin-en-scrutinize", "builtin-ko-sagwa", "builtin-ko-sigan",
    "builtin-ko-yaksok", "builtin-ko-gongbuhada"
]


def make_entries(count):
    return [{
        "id": "builtin-en-{:03d}".format(index), "language": "en",
        "text": "word{}".format(index), "normalizedText": "word{}".format(index),
        "pronunciation": "/word{}/".format(index),
        "definitionEn": "definition {}".format(index),
        "definitionKo": "", "definitionZh": "释义{}".format(index),
        "imageUrl": "", "source": "builtin", "contentStatus": "ready",
        "level": None, "advanced": False, "priority": index,
        "sources": [{"name": "fixture", "sourceId": str(index), "license": "test"}],
        "wordAudioUrl": "/static/vocabulary/audio/en/builtin-en-{:03d}.word.hash.mp3".format(index),
        "phrase": {
            "text": "phrase {}".format(index), "translationZh": "短语{}".format(index),
            "audioUrl": "/static/vocabulary/audio/en/builtin-en-{:03d}.phrase.hash.mp3".format(index)
        },
        "example": {
            "text": "Example {}.".format(index), "translationZh": "例句{}".format(index),
            "audioUrl": "/static/vocabulary/audio/en/builtin-en-{:03d}.example.hash.mp3".format(index)
        }
    } for index in range(count)]


def create_audio(audio_root, entry):
    relative_paths = [
        entry["wordAudioUrl"], entry["phrase"]["audioUrl"], entry["example"]["audioUrl"]
    ]
    for url in relative_paths:
        relative = url.split("/static/vocabulary/audio/", 1)[1]
        path = audio_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"mp3" * 200)


class PublishTests(unittest.TestCase):
    def test_chunking_is_stable_and_index_is_lightweight(self):
        entries = make_entries(405)
        chunks = chunk_entries(entries, 200)
        self.assertEqual([len(chunk) for chunk in chunks], [200, 200, 5])
        self.assertEqual(chunks, chunk_entries(list(reversed(entries)), 200))
        index = to_index_entry(entries[0], "chunks/en-00000.json")
        self.assertNotIn("phrase", index)
        self.assertNotIn("example", index)
        self.assertNotIn("wordAudioUrl", index)
        self.assertEqual(index["chunkFile"], "chunks/en-00000.json")

    def test_missing_audio_blocks_publication(self):
        entry = make_entries(1)[0]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(FileNotFoundError, "wordAudioUrl"):
                publish_library(
                    [entry], Path(directory) / "staging", Path(directory) / "audio",
                    ["builtin-en-negligible"], {}
                )

    def test_missing_image_does_not_block_and_manifest_counts_languages(self):
        entries = make_entries(1)
        korean = copy.deepcopy(entries[0])
        korean.update({
            "id": "builtin-ko-001", "language": "ko", "text": "사과",
            "normalizedText": "사과", "definitionKo": "둥근 과일",
            "level": 1, "advanced": False,
            "phrase": {
                "text": "사과를 먹다", "translationZh": "吃苹果",
                "audioUrl": korean["phrase"]["audioUrl"].replace("/audio/en/", "/audio/ko/")
            },
            "example": {
                "text": "저는 사과를 먹어요.", "translationZh": "我吃苹果。",
                "audioUrl": korean["example"]["audioUrl"].replace("/audio/en/", "/audio/ko/")
            }
        })
        korean["wordAudioUrl"] = korean["wordAudioUrl"].replace("/audio/en/", "/audio/ko/")
        entries.append(korean)
        with tempfile.TemporaryDirectory() as directory:
            audio_root = Path(directory) / "audio"
            for entry in entries:
                create_audio(audio_root, entry)
            manifest = publish_library(
                entries, Path(directory) / "staging", audio_root,
                ["builtin-en-negligible"], {"fixture": True}
            )
            self.assertEqual(manifest["languages"]["en"]["count"], 1)
            self.assertEqual(manifest["languages"]["ko"]["count"], 1)
            self.assertEqual(manifest["legacyIds"], ["builtin-en-negligible"])
            self.assertTrue((Path(directory) / "staging" / "data" / "manifest.json").exists())
            self.assertEqual(entries[0]["imageUrl"], "")

    def test_independent_validator_loads_chunks_and_checks_audio_hashes(self):
        entry = make_entries(1)[0]
        entry["wordAudioUrl"] = "/static/vocabulary/audio/" + audio_relpath(
            "en", entry["id"], "word", entry["text"]
        )
        entry["phrase"]["audioUrl"] = "/static/vocabulary/audio/" + audio_relpath(
            "en", entry["id"], "phrase", entry["phrase"]["text"]
        )
        entry["example"]["audioUrl"] = "/static/vocabulary/audio/" + audio_relpath(
            "en", entry["id"], "example", entry["example"]["text"]
        )
        with tempfile.TemporaryDirectory() as directory:
            audio_root = Path(directory) / "audio"
            staging = Path(directory) / "staging"
            create_audio(audio_root, entry)
            publish_library([entry], staging, audio_root, LEGACY_IDS, {})
            with patch(
                "validate_build.inspect_audio",
                return_value={"durationSeconds": 1.25, "meanVolumeDb": -20.0, "maxVolumeDb": -5.0}
            ) as inspect:
                report = validate_publication(staging, "ffmpeg-test")
            self.assertEqual(inspect.call_count, 3)
            self.assertEqual(report["count"], 1)
            self.assertEqual(report["durationSeconds"], 3.75)


if __name__ == "__main__":
    unittest.main()
