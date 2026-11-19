import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import _bootstrap
from fetch_sources import download, validate_awl


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class FetchSourceTests(unittest.TestCase):
    def test_awl_requires_exactly_570_unique_headwords(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "awl.txt"
            path.write_text("\n".join("word{}".format(index) for index in range(570)), encoding="utf-8")
            self.assertEqual(len(validate_awl(path)), 570)
            path.write_text("\n".join(["same"] * 570), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "570 unique"):
                validate_awl(path)

    def test_download_writes_payload_and_sha256_atomically(self):
        payload = b"real source bytes"
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "nested" / "source.csv"
            with patch("fetch_sources.urlopen", return_value=FakeResponse(payload)):
                result = download("https://example.test/source.csv", destination)
            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(result["sha256"], hashlib.sha256(payload).hexdigest())
            self.assertFalse(destination.with_suffix(".csv.download").exists())


if __name__ == "__main__":
    unittest.main()
