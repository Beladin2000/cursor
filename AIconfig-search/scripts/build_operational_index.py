#!/usr/bin/env python3
"""Build operational-index.json, the device map, and per-device files."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json

ROUTE_RE = re.compile(r"^\s*ip route\s+(\S+)\s+(\S+)", re.I)
ACL_RE = re.compile(r"access-list|ip access-list|security-rule", re.I)


def build(data_root: Path) -> dict:
    summaries = read_json(data_root / "device-summaries.json")
    manifest = read_json(data_root / "manifest.json")
    arp = read_json(data_root / "arp-index.json")
    if isinstance(arp, dict):
        arp = arp.get("records", [])
    devices = []
    seen = set()
    for summary in summaries:
        name = summary["hostname"]
        if name not in seen:
            seen.add(name)
            devices.append({"hostname": name, "configLines": summary.get("lines", 0)})
    for row in arp:
        name = row.get("device")
        if name and name not in seen:
            seen.add(name)
            devices.append({"hostname": name, "configLines": 0})
    routes = []
    policies = []
    lines_by_device: dict[str, list] = {device["hostname"]: [] for device in devices}
    for chunk_name in manifest.get("chunks", []):
        for record in read_json(data_root / str(chunk_name).lstrip("/").removeprefix("data/")):
            device = record.get("device", "")
            text = record.get("text", "")
            lines_by_device.setdefault(device, []).append(record)
            route = ROUTE_RE.match(text)
            if route:
                routes.append({"device": device, "prefix": route.group(1), "nextHop": route.group(2), "text": text})
            if ACL_RE.search(text):
                policies.append({"device": device, "text": text, "line": record.get("line")})
    device_dir = data_root / "operational-devices"
    device_dir.mkdir(parents=True, exist_ok=True)
    device_map = {}
    for device in devices:
        filename = f"{device['hostname']}.json"
        owned = [row for row in arp if row.get("device") == device["hostname"]]
        write_json(
            device_dir / filename,
            {"hostname": device["hostname"], "arp": owned, "lines": lines_by_device.get(device["hostname"], [])[:40]},
        )
        device_map[device["hostname"]] = f"operational-devices/{filename}"
    payload = {"devices": devices, "routes": routes, "policies": policies}
    if not devices:
        raise SystemExit("Operational device index is empty")
    write_json(data_root / "operational-index.json", payload)
    write_json(data_root / "operational-device-map.json", device_map)
    print(f"operational devices {len(devices)} routes {len(routes)} policies {len(policies)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN operational index")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
