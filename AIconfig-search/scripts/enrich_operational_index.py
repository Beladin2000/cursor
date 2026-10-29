#!/usr/bin/env python3
"""Add ARP and MAC counts to each operational device.

Keeps devices, routes, and policies. Writes the same operational-index.json
the validation job reads.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json


def counts(rows, device: str) -> int:
    return sum(1 for row in rows if row.get("device") == device)


def build(data_root: Path) -> dict:
    operational = read_json(data_root / "operational-index.json")
    arp_payload = read_json(data_root / "arp-index.json")
    mac_payload = read_json(data_root / "mac-index.json")
    arp = arp_payload.get("records", arp_payload) if isinstance(arp_payload, dict) else arp_payload
    mac = mac_payload.get("records", mac_payload) if isinstance(mac_payload, dict) else mac_payload
    for device in operational.get("devices", []):
        name = device.get("hostname", "")
        device["arpCount"] = counts(arp, name)
        device["macCount"] = counts(mac, name)
    write_json(data_root / "operational-index.json", operational)
    print(f"enriched operational devices {len(operational.get('devices', []))}")
    return operational


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich the operational index with ARP and MAC counts")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
