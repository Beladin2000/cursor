#!/usr/bin/env python3
"""Build cpnr-index.json from an optional zone export and `ip host` lines.

A CPNR export is a CSV with zone, name, type, and rdata columns.
When that file is absent, the script records `ip host` lines from
configuration and says no zone export was provided.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import hostname_from_config, iter_config_files, pick, read_csv_rows, write_json

HOST_RE_TEXT = "ip host "


def from_csv(path: Path) -> list[dict]:
    records = []
    for row in read_csv_rows(path):
        name = pick(row, ["name", "owner", "record"])
        rdata = pick(row, ["rdata", "data", "address", "value"])
        if not name and not rdata:
            continue
        records.append(
            {
                "zone": pick(row, ["zone"]),
                "name": name,
                "type": pick(row, ["type", "record_type"]) or "A",
                "rdata": rdata,
                "source": "cpnr-export",
            }
        )
    return records


def from_configs(config_root: Path) -> list[dict]:
    records = []
    if not config_root.is_dir():
        return records
    for path in iter_config_files(config_root):
        text = path.read_text(encoding="utf-8", errors="replace")
        device = hostname_from_config(text, path.name)
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.lower().startswith(HOST_RE_TEXT):
                continue
            parts = stripped.split()
            if len(parts) < 4:
                continue
            records.append(
                {
                    "zone": "",
                    "name": parts[2],
                    "type": "A",
                    "rdata": parts[3],
                    "source": "config",
                    "device": device,
                }
            )
    return records


def build(output: Path, records_csv: Path | None, config_root: Path | None) -> dict:
    records = from_csv(records_csv) if records_csv and records_csv.is_file() else []
    source = "cpnr-export" if records else "config"
    if not records and config_root:
        records = from_configs(config_root)
    note = ""
    if not records:
        note = "No CPNR export was provided. SWAN did not invent zone records."
        source = "none"
    payload = {"records": records, "record_count": len(records), "source": source, "note": note}
    write_json(output, payload)
    print(f"cpnr records {len(records)} source {source}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the CPNR index")
    parser.add_argument("--output", required=True)
    parser.add_argument("--records", default="")
    parser.add_argument("--config-root", default="")
    args = parser.parse_args()
    build(
        Path(args.output),
        Path(args.records) if args.records else None,
        Path(args.config_root) if args.config_root else None,
    )


if __name__ == "__main__":
    main()
