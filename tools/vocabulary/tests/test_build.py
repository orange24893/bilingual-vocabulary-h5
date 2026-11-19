import copy
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import _bootstrap
from build import enrich_entries
from test_content import complete_entry


class BuildTests(unittest.TestCase):
    def test_script_imports_local_modules_in_isolated_python(self):
        script = Path(__file__).resolve().parents[1] / "build.py"
        result = subprocess.run(
            [sys.executable, "-I", str(script), "--help"],
            capture_output=True, check=False
        )
        stderr = result.stderr.decode("utf-8", errors="replace")
        stdout = result.stdout.decode("utf-8", errors="replace")
        self.assertEqual(result.returncode, 0, stderr)
        self.assertIn("--workspace", stdout)

    def test_incomplete_content_writes_blockers_and_stops(self):
        entry = complete_entry("en")
        entry["definitionEn"] = ""
        with tempfile.TemporaryDirectory() as directory:
            blockers_path = Path(directory) / "content-blockers.json"
            with patch.dict(os.environ, {}, clear=True):
                with patch("build.enrich_entry", side_effect=RuntimeError("provider missing")):
                    with self.assertRaisesRegex(RuntimeError, "content blockers"):
                        enrich_entries([entry], Path(directory), blockers_path)
            blockers = json.loads(blockers_path.read_text(encoding="utf-8"))
            self.assertEqual(blockers[0]["id"], entry["id"])
            self.assertIn("definitionEn", blockers[0]["missingFields"])
            self.assertIn("provider missing", blockers[0]["error"])

    def test_provider_failure_stops_before_the_second_entry(self):
        first = complete_entry("en")
        first["definitionEn"] = ""
        second = complete_entry("en")
        second["id"] = "test-en-2"
        second["definitionEn"] = ""
        with tempfile.TemporaryDirectory() as directory:
            with patch("build.enrich_entry", side_effect=RuntimeError("provider missing")) as provider:
                with self.assertRaisesRegex(RuntimeError, "provider missing"):
                    enrich_entries(
                        [first, second], Path(directory), Path(directory) / "blockers.json"
                    )
            self.assertEqual(provider.call_count, 1)

    def test_content_progress_is_printed(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with redirect_stdout(output):
                enrich_entries(
                    [complete_entry("en")], Path(directory), Path(directory) / "blockers.json"
                )
        self.assertIn("Content 1/1", output.getvalue())

    def test_successful_content_is_saved_without_ready_status(self):
        entry = complete_entry("en")
        with tempfile.TemporaryDirectory() as directory:
            completed = enrich_entries([copy.deepcopy(entry)], Path(directory), Path(directory) / "blockers.json")
            saved = json.loads((Path(directory) / "content.json").read_text(encoding="utf-8"))
        self.assertEqual(completed[0]["contentStatus"], "content-complete")
        self.assertEqual(saved[0]["contentStatus"], "content-complete")


if __name__ == "__main__":
    unittest.main()
