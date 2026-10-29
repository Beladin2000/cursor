#!/usr/bin/env python3
"""Join ARP and MAC indexes into correlation-index.json with a by_ip map."""

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
    raise SystemExit("ARP or MAC index is neither a list nor {records: [...]}")


def build(data_root: Path) -> dict:
    arp = as_records(read_json(data_root / "arp-index.json"))
    mac = as_records(read_json(data_root / "mac-index.json"))
    macs_by_address: dict[str, list] = {}
    for row in mac:
        macs_by_address.setdefault(str(row.get("mac", "")).lower(), []).append(row)
    by_ip: dict[str, dict] = {}
    for row in arp:
        ip = row.get("ip_address") or ""
        if not ip:
            continue
        bucket = by_ip.setdefault(ip, {"arp": [], "macs": []})
        bucket["arp"].append(row)
        for match in macs_by_address.get(str(row.get("link_layer_address", "")).lower(), []):
            if match not in bucket["macs"]:
                bucket["macs"].append(match)
    by_mac: dict[str, dict] = {}
    for row in mac:
        key = str(row.get("mac", "")).lower()
        if not key:
            continue
        by_mac.setdefault(key, {"macs": [], "arp": []})["macs"].append(row)
    for row in arp:
        key = str(row.get("link_layer_address", "")).lower()
        if key in by_mac:
            by_mac[key]["arp"].append(row)
    payload = {"by_ip": by_ip, "by_mac": by_mac, "ip_count": len(by_ip), "mac_count": len(by_mac)}
    if not by_ip:
        raise SystemExit("IP correlation is empty")
    write_json(data_root / "correlation-index.json", payload)
    print(f"IP correlations {len(by_ip)} MAC correlations {len(by_mac)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN correlation index")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
