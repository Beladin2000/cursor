#!/usr/bin/env python3
"""Write findings-index.json from the MAC index.

A finding is evidence: the same MAC on GigabitEthernet ports of two devices.
Trunk and distribution uplinks are left in the MAC index and are not called a flap.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json

ACCESS_PREFIXES = ("GigabitEthernet", "Gi")


def is_access_port(name: str) -> bool:
    return name.startswith(ACCESS_PREFIXES)


def build(data_root: Path) -> dict:
    payload = read_json(data_root / "mac-index.json")
    rows = payload.get("records", payload) if isinstance(payload, dict) else payload
    grouped: dict[str, list] = {}
    for row in rows:
        mac = str(row.get("mac", "")).lower()
        interface = str(row.get("interface", ""))
        if mac and is_access_port(interface):
            grouped.setdefault(mac, []).append(row)
    findings = []
    for mac, locations in sorted(grouped.items()):
        pairs = {(row.get("device"), row.get("interface")) for row in locations}
        devices = {device for device, _interface in pairs if device}
        if len(devices) < 2:
            continue
        where = ", ".join(f"{device} {interface}" for device, interface in sorted(pairs))
        findings.append(
            {
                "id": f"mac-{mac}",
                "kind": "mac-on-multiple-access-switches",
                "title": f"MAC {mac} is on more than one access switch",
                "detail": where,
                "mac": mac,
                "locations": [{"device": device, "interface": interface} for device, interface in sorted(pairs)],
            }
        )
    result = {"findings": findings, "finding_count": len(findings)}
    write_json(data_root / "findings-index.json", result)
    print(f"findings {len(findings)}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Build findings from the MAC index")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
