"""The nightly builders emit the files the GitLab validation job checks."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "data" / "region10"


class PipelineTest(unittest.TestCase):
    def test_region10_fixture_matches_the_validation_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            data = project / "public" / "data"
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "build_index.py"),
                    "--config-root",
                    str(FIXTURE / "configs"),
                    "--project-root",
                    str(project),
                    "--chunk-size",
                    "10000",
                ],
                check=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "build_arp_index.py"),
                    "--facts-root",
                    str(FIXTURE / "show_swan_facts"),
                    "--output",
                    str(data),
                ],
                check=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "build_mac_index.py"),
                    "--facts-root",
                    str(FIXTURE / "show_swan_facts"),
                    "--output",
                    str(data),
                ],
                check=True,
            )
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_correlation_index.py"), "--data-root", str(data)],
                check=True,
            )
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_operational_index.py"), "--data-root", str(data)],
                check=True,
            )
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_evidence_index.py"), "--data-root", str(data)],
                check=True,
            )
            manifest = json.loads((data / "manifest.json").read_text())
            arp = json.loads((data / "arp-index.json").read_text())
            mac = json.loads((data / "mac-index.json").read_text())
            correlation = json.loads((data / "correlation-index.json").read_text())
            operational = json.loads((data / "operational-index.json").read_text())
            self.assertTrue(arp)
            self.assertTrue(mac)
            self.assertTrue(correlation["by_ip"])
            self.assertTrue(operational["devices"])
            self.assertGreater(manifest["record_count"], 0)
            self.assertEqual(manifest["summary_count"], 20)
            for chunk in manifest["chunks"]:
                self.assertTrue((data / chunk).stat().st_size > 0)
            self.assertTrue((data / "evidence-index.json").stat().st_size > 0)
            self.assertTrue((data / "operational-device-map.json").is_file())
            self.assertTrue((data / "operational-devices").is_dir())


if __name__ == "__main__":
    unittest.main()
