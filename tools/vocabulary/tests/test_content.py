import copy
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import _bootstrap
import generate_content
from content import (
    find_duplicate_examples,
    missing_required_fields,
    validate_entry_language
)
from generate_content import enrich_entry, generated_value, load_krdict_snapshot, merge_krdict


def complete_entry(language):
    korean = language == "ko"
    return {
        "id": "test-ko" if korean else "test-en",
        "language": language,
        "text": "사과" if korean else "resilient",
        "pronunciation": "[sa-gwa]" if korean else "/rɪˈzɪliənt/",
        "definitionEn": "a round fruit" if korean else "able to recover quickly",
        "definitionKo": "둥근 과일" if korean else "",
        "definitionZh": "苹果" if korean else "有韧性的",
        "imageUrl": "",
        "phrase": {
            "text": "사과를 먹다" if korean else "a resilient economy",
            "translationZh": "吃苹果" if korean else "韧性十足的经济"
        },
        "example": {
            "text": "저는 사과를 먹어요." if korean else "The economy is resilient.",
            "translationZh": "我吃苹果。" if korean else "经济具有韧性。"
        }
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

    def test_placeholder_and_duplicate_phrase_example_are_rejected(self):
        entry = complete_entry("en")
        entry["definitionEn"] = "placeholder"
        self.assertIn("definitionEn", missing_required_fields(entry))
        entry = complete_entry("en")
        entry["example"]["text"] = entry["phrase"]["text"]
        self.assertIn("example.text", missing_required_fields(entry))

    def test_language_check_rejects_wrong_learning_text(self):
        entry = copy.deepcopy(complete_entry("ko"))
        entry["text"] = "apple"
        self.assertFalse(validate_entry_language(entry))
        entry = complete_entry("en")
        entry["example"]["translationZh"] = "no Chinese here"
        self.assertFalse(validate_entry_language(entry))

    def test_cross_entry_duplicate_examples_are_reported(self):
        first = complete_entry("en")
        second = complete_entry("en")
        second["id"] = "test-en-2"
        self.assertEqual(
            find_duplicate_examples([first, second]),
            ["The economy is resilient."]
        )

    def test_duplicate_examples_are_repaired_and_rejected_against_earlier_entries(self):
        first = complete_entry("en")
        second = complete_entry("en")
        second["id"] = "test-en-2"
        replacement = {
            "example": {
                "text": "The resilient team recovered quickly.",
                "translationZh": "这个有韧性的团队很快恢复了。"
            }
        }

        class Response:
            status = 200

            def __init__(self, payload):
                self.payload = payload

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": json.dumps(self.payload)}}]
                }).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        repair = getattr(generate_content, "repair_duplicate_examples", None)
        self.assertIsNotNone(repair)
        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", side_effect=[
                    Response({"example": first["example"]}), Response(replacement)
                ]) as request:
                    with patch("time.sleep"):
                        result = repair([first, second], Path(directory))
            self.assertEqual(request.call_count, 2)
            self.assertEqual(len(list(Path(directory).glob("*.json"))), 1)
        self.assertEqual(result[0], first)
        self.assertEqual(result[1]["example"], replacement["example"])
        self.assertEqual(find_duplicate_examples(result), [])

    def test_missing_provider_configuration_fails_before_http(self):
        entry = complete_entry("en")
        entry["definitionEn"] = ""
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {}, clear=True):
                with patch("generate_content.urlopen") as http:
                    with self.assertRaisesRegex(RuntimeError, "VOCAB_GENERATION_BASE_URL"):
                        enrich_entry(entry, Path(directory))
                    http.assert_not_called()

    def test_provider_http_error_includes_the_response_reason(self):
        entry = complete_entry("en")
        entry["definitionEn"] = ""
        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        error = HTTPError(
            environment["VOCAB_GENERATION_BASE_URL"] + "/chat/completions",
            402, "Payment Required", None,
            io.BytesIO(b'{"error":{"message":"Insufficient Balance"}}')
        )
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", side_effect=error):
                    with self.assertRaisesRegex(RuntimeError, "Insufficient Balance"):
                        enrich_entry(entry, Path(directory))

    def test_generation_accepts_dotted_field_paths(self):
        generated = {
            "phrase.text": "common abbreviation",
            "phrase.translationZh": "常见缩写",
            "example": {"text": "Example.", "translationZh": "例句。"}
        }
        self.assertEqual(generated_value(generated, "phrase.text"), "common abbreviation")
        self.assertEqual(
            generated_value(generated, "phrase.translationZh"), "常见缩写"
        )

    def test_incomplete_generated_content_is_retried_before_caching(self):
        entry = complete_entry("en")
        entry["phrase"] = {"text": "", "translationZh": ""}
        entry["example"] = {"text": "", "translationZh": ""}
        incomplete = {
            "phrase": {"text": "", "translationZh": ""},
            "example": {"text": "", "translationZh": ""}
        }
        complete = {
            "phrase": {"text": "phrase", "translationZh": "短语"},
            "example": {"text": "Example sentence.", "translationZh": "例句。"}
        }
        class FakeResponse:
            status = 200

            def __init__(self, payload):
                self.payload = payload

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": json.dumps(self.payload)}}]
                }).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", side_effect=[
                    FakeResponse(incomplete), FakeResponse(complete)
                ]) as request:
                    with patch("time.sleep"):
                        result = enrich_entry(entry, Path(directory))
            self.assertEqual(request.call_count, 2)
            self.assertEqual(result["phrase"]["text"], "phrase")
            self.assertEqual(len(list(Path(directory).glob("*.json"))), 1)

    def test_malformed_provider_json_is_retried(self):
        entry = complete_entry("en")
        entry["phrase"] = {"text": "", "translationZh": ""}
        entry["example"] = {"text": "", "translationZh": ""}
        valid = {
            "phrase": {"text": "phrase", "translationZh": "短语"},
            "example": {"text": "Example sentence.", "translationZh": "例句。"}
        }

        class Response:
            status = 200

            def __init__(self, content):
                self.content = content

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": self.content}}]
                }).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", side_effect=[
                    Response('{"phrase": {"text": "broken}'),
                    Response(json.dumps(valid))
                ]) as request:
                    with patch("time.sleep"):
                        result = enrich_entry(entry, Path(directory))
            self.assertEqual(request.call_count, 2)
            self.assertEqual(result["phrase"]["text"], "phrase")

    def test_invalid_language_content_is_retried(self):
        entry = complete_entry("ko")
        entry["example"] = {"text": "", "translationZh": ""}
        invalid = {
            "example": {
                "text": "This is an English-only example.",
                "translationZh": "这是一个只有英文的例句。"
            }
        }
        valid = {
            "example": {
                "text": "저는 사과를 먹어요.",
                "translationZh": "我吃苹果。"
            }
        }

        class Response:
            status = 200

            def __init__(self, payload):
                self.payload = payload

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": json.dumps(self.payload)}}]
                }).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", side_effect=[
                    Response(invalid), Response(valid)
                ]) as request:
                    with patch("time.sleep"):
                        result = enrich_entry(entry, Path(directory))
            self.assertEqual(request.call_count, 2)
            self.assertEqual(result["example"]["text"], valid["example"]["text"])

    def test_failed_language_validation_reports_the_last_provider_payload(self):
        entry = complete_entry("ko")
        entry["example"] = {"text": "", "translationZh": ""}
        invalid = {
            "example": {
                "text": "This is an English-only example.",
                "translationZh": "这是一个只有英文的例句。"
            }
        }
        response_payload = json.dumps({
            "choices": [{"message": {"content": json.dumps(invalid)}}]
        }).encode("utf-8")

        class Response:
            status = 200

            def read(self):
                return response_payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", return_value=Response()):
                    with patch("time.sleep"):
                        with self.assertRaisesRegex(
                            ValueError, "last provider payload.*English-only"
                        ):
                            enrich_entry(entry, Path(directory))

    def test_failed_generation_reports_the_last_provider_payload(self):
        entry = complete_entry("en")
        entry["phrase"] = {"text": "", "translationZh": ""}
        entry["example"] = {"text": "", "translationZh": ""}
        response_payload = json.dumps({
            "choices": [{"message": {"content": json.dumps({"phrase": {"text": ""}})}}]
        }).encode("utf-8")

        class Response:
            status = 200

            def read(self):
                return response_payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", return_value=Response()):
                    with patch("time.sleep"):
                        with self.assertRaisesRegex(ValueError, "last provider payload.*phrase"):
                            enrich_entry(entry, Path(directory))

    def test_generation_applies_only_missing_fields_and_uses_cache(self):
        entry = complete_entry("en")
        entry["definitionEn"] = ""
        original_phrase = copy.deepcopy(entry["phrase"])
        response_payload = json.dumps({
            "choices": [{"message": {"content": json.dumps({
                "definitionEn": "able to recover quickly",
                "phrase": {"text": "must not replace", "translationZh": "不应替换"}
            })}}]
        }).encode("utf-8")

        class Response:
            status = 200

            def read(self):
                return response_payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

        environment = {
            "VOCAB_GENERATION_BASE_URL": "https://api.example.test/v1",
            "VOCAB_GENERATION_API_KEY": "secret",
            "VOCAB_GENERATION_MODEL": "test-model"
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, environment, clear=True):
                with patch("generate_content.urlopen", return_value=Response()) as http:
                    first = enrich_entry(copy.deepcopy(entry), Path(directory))
                    second = enrich_entry(copy.deepcopy(entry), Path(directory))
            self.assertEqual(http.call_count, 1)
            self.assertEqual(first["definitionEn"], "able to recover quickly")
            self.assertEqual(first["phrase"], original_phrase)
            self.assertEqual(second, first)
            self.assertEqual(len(list(Path(directory).glob("*.json"))), 1)

    def test_krdict_snapshot_merges_only_missing_fields_with_attribution(self):
        entry = complete_entry("ko")
        entry["sourceKey"] = "사과01"
        entry["definitionKo"] = ""
        entry["sources"] = []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "krdict.jsonl"
            path.write_text(json.dumps({
                "sourceKey": "사과01",
                "fields": {
                    "definitionKo": "둥근 과일",
                    "definitionEn": "must not replace official content"
                },
                "source": {"name": "KRDICT", "sourceId": "123", "license": "authorized"}
            }, ensure_ascii=False) + "\n", encoding="utf-8")
            snapshot = load_krdict_snapshot(path)
            merged = merge_krdict(entry, snapshot)
        self.assertEqual(merged["definitionKo"], "둥근 과일")
        self.assertEqual(merged["definitionEn"], "a round fruit")
        self.assertEqual(merged["sources"][0]["sourceId"], "123")

    def test_krdict_snapshot_rejects_unknown_blank_and_duplicate_records(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "krdict.jsonl"
            path.write_text(json.dumps({
                "sourceKey": "사과01", "fields": {"unknown": "value"},
                "source": {"name": "KRDICT", "sourceId": "1", "license": "authorized"}
            }, ensure_ascii=False) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown"):
                load_krdict_snapshot(path)
            record = {
                "sourceKey": "사과01", "fields": {"definitionKo": "둥근 과일"},
                "source": {"name": "KRDICT", "sourceId": "1", "license": "authorized"}
            }
            path.write_text("\n".join([json.dumps(record), json.dumps(record)]), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_krdict_snapshot(path)
            record["fields"]["definitionKo"] = ""
            path.write_text(json.dumps(record), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "blank"):
                load_krdict_snapshot(path)


if __name__ == "__main__":
    unittest.main()
