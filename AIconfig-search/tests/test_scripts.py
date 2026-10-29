"""The downloadable script set builds the sample and keeps the evidence honest."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "data" / "region10"


class ScriptBundleTest(unittest.TestCase):
    def test_build_all_on_region10(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            shutil.copy(ROOT / "api_server.py", project / "api_server.py")
            env = os.environ.copy()
            env["PROJECT_ROOT"] = str(project)
            env["CONFIG_ROOT"] = str(FIXTURE / "configs")
            env["FACTS_ROOT"] = str(FIXTURE / "show_swan_facts")
            env.pop("NETBOX_URL", None)
            env.pop("NETBOX_TOKEN", None)
            subprocess.run(["sh", str(ROOT / "scripts" / "build_all.sh")], check=True, env=env)
            data = project / "public" / "data"
            manifest = json.loads((data / "manifest.json").read_text())
            self.assertEqual(manifest["version"], "20.3.5")
            self.assertEqual(manifest["product"], "SWAN Operational Correlation Engine")
            self.assertEqual(manifest["summary_count"], 20)
            parsed = json.loads((data / "parsed-devices.json").read_text())
            mgt = next(device for device in parsed["devices"] if device["hostname"] == "C9300-REGN10-4C-MGT-1")
            self.assertIn({"id": 10, "name": "MGMT"}, mgt["vlans"])
            vlan10 = next(interface for interface in mgt["interfaces"] if interface["name"] == "Vlan10")
            self.assertEqual(vlan10["ipAddress"], "10.40.8.14")
            firewall = next(device for device in parsed["devices"] if device["hostname"] == "PA-REGN10-4C-FW-1")
            self.assertTrue(any(policy["name"] == "badge-auth" for policy in firewall["policies"]))
            findings = json.loads((data / "findings-index.json").read_text())
            macs = {finding["mac"] for finding in findings["findings"]}
            self.assertIn("02:4c:10:00:02:19", macs)
            evidence = (data / "copilot-evidence.txt").read_text()
            self.assertIn("It is not a conclusion", evidence)
            self.assertIn("02:4c:10:00:02:19", evidence)
            netbox = json.loads((data / "netbox-context.json").read_text())
            self.assertFalse(netbox["configured"])
            self.assertIn("NETBOX_URL", netbox["warning"])
            self.assertIsNone(netbox["addresses"][0]["live"])
            changes = json.loads((data / "recent-changes.json").read_text())
            self.assertEqual(changes["records"], [])
            self.assertIn("did not invent", changes["note"])
            summary = json.loads((data / "swan-summary.json").read_text())
            self.assertEqual(summary["devices"], 20)
            self.assertGreater(summary["arp"], 0)
            self.assertTrue((project / "public" / "api_server.py").is_file())
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "scripts" / "netbox_ipam_sync.py"),
                    "--data-root",
                    str(data),
                    "--limit",
                    "2",
                ],
                check=True,
                env=env,
            )
            ipam = json.loads((data / "netbox-ipam.json").read_text())
            self.assertFalse(ipam["configured"])
            self.assertEqual(len(ipam["addresses"]), 2)

    def test_render_live_env_hides_values(self) -> None:
        env = os.environ.copy()
        env["NETBOX_TOKEN"] = "should-not-appear"
        env.pop("NETBOX_URL", None)
        completed = subprocess.run(
            ["python3", str(ROOT / "scripts" / "render_swan_live_env.py")],
            check=True,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertIn("NETBOX_TOKEN SET", completed.stdout)
        self.assertIn("NETBOX_URL UNSET", completed.stdout)
        self.assertNotIn("should-not-appear", completed.stdout)


if __name__ == "__main__":
    unittest.main()
