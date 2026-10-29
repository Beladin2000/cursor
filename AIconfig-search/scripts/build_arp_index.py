#!/usr/bin/env python3
"""Build arp-index.json from show_swan_facts/show_ip_arp_all/Show_IP_ARP_All-YYYYMMDD.csv."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import latest_csv, pick, read_csv_rows, write_json


def build(facts_root: Path, output: Path) -> list[dict]:
    csv_path = latest_csv(facts_root / "show_ip_arp_all", "Show_IP_ARP_All-")
    if csv_path is None:
        raise SystemExit(f"No Show_IP_ARP_All CSV under {facts_root / 'show_ip_arp_all'}")
    records = []
    for row in read_csv_rows(csv_path):
        ip_address = pick(row, ["ip_address", "ip", "address"])
        mac = pick(row, ["link_layer_address", "mac", "mac_address", "hardware_address"])
        device = pick(row, ["device", "hostname", "switch"])
        if not ip_address or not device:
            continue
        records.append(
            {
                "device": device,
                "interface": pick(row, ["interface", "port"]),
                "ip_address": ip_address,
                "link_layer_address": mac,
                "age": pick(row, ["age"]),
                "protocol": pick(row, ["protocol"]) or "Internet",
            }
        )
    if not records:
        raise SystemExit(f"ARP CSV {csv_path} produced no records")
    write_json(output / "arp-index.json", records)
    print(f"ARP records {len(records)} from {csv_path.name}")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN ARP index")
    parser.add_argument("--facts-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build(Path(args.facts_root), Path(args.output))


if __name__ == "__main__":
    main()
