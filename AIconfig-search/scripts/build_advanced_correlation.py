#!/usr/bin/env python3
"""Join ARP, MAC, and device summaries into one endpoint file.

Example:
  python3 scripts/build_advanced_correlation.py \
    --arp public/data/arp-index.json \
    --mac public/data/mac-index.json \
    --devices public/data/device-summaries.json \
    --output public/data/advanced-correlation-index.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json


def as_records(payload) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return payload["records"]
    raise SystemExit("Expected a list or {records: [...]}")


def build(arp_path: Path, mac_path: Path, devices_path: Path, output: Path) -> dict:
    arp = as_records(read_json(arp_path))
    mac = as_records(read_json(mac_path))
    devices = read_json(devices_path)
    if isinstance(devices, dict):
        devices = devices.get("devices", [])
    known = {row.get("hostname") for row in devices if isinstance(row, dict)}
    macs: dict[str, list] = {}
    for row in mac:
        macs.setdefault(str(row.get("mac", "")).lower(), []).append(row)
    endpoints = []
    for row in arp:
        ip = row.get("ip_address") or ""
        if not ip:
            continue
        address = str(row.get("link_layer_address", "")).lower()
        related = macs.get(address, [])
        endpoints.append(
            {
                "ip": ip,
                "mac": row.get("link_layer_address") or "",
                "arpDevice": row.get("device"),
                "arpInterface": row.get("interface"),
                "protocol": row.get("protocol") or "Internet",
                "macLocations": [
                    {
                        "device": item.get("device"),
                        "interface": item.get("interface"),
                        "vlan": item.get("vlan"),
                        "type": item.get("type"),
                    }
                    for item in related
                ],
                "deviceKnown": row.get("device") in known,
            }
        )
    payload = {"endpoints": endpoints, "endpoint_count": len(endpoints)}
    write_json(output, payload)
    print(f"advanced endpoints {len(endpoints)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the advanced correlation index")
    parser.add_argument("--arp", required=True)
    parser.add_argument("--mac", required=True)
    parser.add_argument("--devices", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build(Path(args.arp), Path(args.mac), Path(args.devices), Path(args.output))


if __name__ == "__main__":
    main()
