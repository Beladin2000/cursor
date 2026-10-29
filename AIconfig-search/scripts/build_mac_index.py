#!/usr/bin/env python3
"""Build mac-index.json from show_mac_address_table_all/Show_MAC_ADDRESS_TABLE_All-YYYYMMDD.csv."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import latest_csv, pick, read_csv_rows, write_json


def build(facts_root: Path, output: Path) -> list[dict]:
    csv_path = latest_csv(facts_root / "show_mac_address_table_all", "Show_MAC_ADDRESS_TABLE_All-")
    if csv_path is None:
        raise SystemExit(f"No Show_MAC_ADDRESS_TABLE_All CSV under {facts_root / 'show_mac_address_table_all'}")
    records = []
    for row in read_csv_rows(csv_path):
        mac = pick(row, ["mac", "mac_address", "link_layer_address", "destination_address"])
        device = pick(row, ["device", "hostname", "switch"])
        if not mac or not device:
            continue
        vlan = pick(row, ["vlan", "vlan_id"])
        records.append(
            {
                "device": device,
                "mac": mac,
                "vlan": int(vlan) if vlan.isdigit() else vlan,
                "interface": pick(row, ["interface", "port", "destination_port"]),
                "type": pick(row, ["type", "entry_type"]) or "dynamic",
            }
        )
    if not records:
        raise SystemExit(f"MAC CSV {csv_path} produced no records")
    write_json(output / "mac-index.json", records)
    print(f"MAC records {len(records)} from {csv_path.name}")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN MAC index")
    parser.add_argument("--facts-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build(Path(args.facts_root), Path(args.output))


if __name__ == "__main__":
    main()
