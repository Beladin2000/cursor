#!/usr/bin/env python3
"""Record a configuration-change export. Does not invent changes.

CSV columns: device, when, user, summary.
JSON input is a list of those objects, or {"records": [...]}.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import pick, read_csv_rows, read_json, write_json


def load_input(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        records = []
        for row in read_csv_rows(path):
            device = pick(row, ["device", "hostname"])
            summary = pick(row, ["summary", "change", "description"])
            if not device and not summary:
                continue
            records.append(
                {
                    "device": device,
                    "when": pick(row, ["when", "time", "timestamp"]),
                    "user": pick(row, ["user", "author"]),
                    "summary": summary,
                }
            )
        return records
    payload = read_json(path)
    if isinstance(payload, dict):
        payload = payload.get("records", [])
    return [row for row in payload if isinstance(row, dict)]


def build(output: Path, source: Path | None) -> dict:
    if source and source.is_file():
        records = load_input(source)
        note = ""
    else:
        records = []
        note = "No change export was provided. SWAN did not invent configuration changes."
    payload = {"records": records, "record_count": len(records), "note": note}
    write_json(output, payload)
    print(f"recent changes {len(records)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the recent configuration-change index")
    parser.add_argument("--output", required=True)
    parser.add_argument("--input", default="")
    args = parser.parse_args()
    build(Path(args.output), Path(args.input) if args.input else None)


if __name__ == "__main__":
    main()
