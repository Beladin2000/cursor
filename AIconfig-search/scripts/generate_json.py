#!/usr/bin/env python3
"""Write swan-summary.json with the counts of the indexes already on disk.

The summary is a downloadable rollup. It does not copy the configuration chunks.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json


def length_of(path: Path, key: str | None = None) -> int:
    if not path.is_file():
        return 0
    payload = read_json(path)
    if isinstance(payload, list):
        return len(payload)
    if key and isinstance(payload.get(key), list):
        return len(payload[key])
    if key and isinstance(payload.get(key), dict):
        return len(payload[key])
    return 0


def build(data_root: Path, output: Path) -> dict:
    manifest = read_json(data_root / "manifest.json") if (data_root / "manifest.json").is_file() else {}
    summary = {
        "configRecords": manifest.get("record_count", 0),
        "devices": manifest.get("summary_count", 0),
        "chunks": len(manifest.get("chunks", [])),
        "arp": length_of(data_root / "arp-index.json"),
        "mac": length_of(data_root / "mac-index.json"),
        "ipCorrelations": length_of(data_root / "correlation-index.json", "by_ip"),
        "operationalDevices": length_of(data_root / "operational-index.json", "devices"),
        "routes": length_of(data_root / "operational-index.json", "routes"),
        "policies": length_of(data_root / "operational-index.json", "policies"),
        "evidenceIps": length_of(data_root / "evidence-index.json", "ips"),
        "findings": length_of(data_root / "findings-index.json", "findings"),
    }
    write_json(output, summary)
    print(
        f"summary devices {summary['devices']} config {summary['configRecords']} "
        f"arp {summary['arp']} mac {summary['mac']}"
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Write a JSON summary of the SWAN indexes")
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build(Path(args.data_root), Path(args.output))


if __name__ == "__main__":
    main()
