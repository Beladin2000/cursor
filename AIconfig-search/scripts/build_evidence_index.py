#!/usr/bin/env python3
"""Build evidence-index.json from configuration lines that mention an IP, device, or VLAN."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import IPV4_RE, VLAN_RE, read_json, write_json


def build(data_root: Path) -> dict:
    manifest = read_json(data_root / "manifest.json")
    summaries = read_json(data_root / "device-summaries.json")
    known = {summary["hostname"] for summary in summaries}
    ips: set[str] = set()
    vlans: set[int] = set()
    devices: set[str] = set()
    references = []
    for chunk_name in manifest.get("chunks", []):
        for record in read_json(data_root / str(chunk_name).lstrip("/").removeprefix("data/")):
            text = record.get("text", "")
            owner = record.get("device", "")
            found_ips = IPV4_RE.findall(text)
            found_vlans = [int(value) for value in VLAN_RE.findall(text) if 1 <= int(value) <= 4094]
            mentioned = [name for name in known if name != owner and name in text]
            if not found_ips and not found_vlans and not mentioned:
                continue
            ips.update(found_ips)
            vlans.update(found_vlans)
            devices.update(mentioned)
            devices.add(owner)
            if len(references) < 200:
                references.append(
                    {
                        "device": owner,
                        "line": record.get("line"),
                        "text": text,
                        "ips": found_ips,
                        "vlans": found_vlans,
                        "devices": mentioned,
                    }
                )
    payload = {
        "ips": sorted(ips),
        "devices": sorted(devices),
        "vlans": sorted(vlans),
        "references": references,
    }
    write_json(data_root / "evidence-index.json", payload)
    print(f"evidence ips {len(ips)} devices {len(devices)} vlans {len(vlans)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN evidence index")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
