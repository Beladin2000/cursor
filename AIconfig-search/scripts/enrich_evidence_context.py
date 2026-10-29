#!/usr/bin/env python3
"""Attach ARP and MAC correlation onto evidence references.

Writes evidence-context.json. The CI evidence-index.json file is left as the
builders produced it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json


def build(data_root: Path) -> dict:
    evidence = read_json(data_root / "evidence-index.json")
    correlation = read_json(data_root / "correlation-index.json")
    by_ip = correlation.get("by_ip", {})
    references = []
    for reference in evidence.get("references", []):
        related = []
        for ip in reference.get("ips", []):
            if ip in by_ip:
                related.append({"ip": ip, "correlation": by_ip[ip]})
        references.append({**reference, "correlation": related})
    payload = {
        "ips": evidence.get("ips", []),
        "devices": evidence.get("devices", []),
        "vlans": evidence.get("vlans", []),
        "references": references,
    }
    write_json(data_root / "evidence-context.json", payload)
    attached = sum(1 for row in references if row["correlation"])
    print(f"evidence references {len(references)} with correlation {attached}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich evidence with correlation")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    build(Path(args.data_root))


if __name__ == "__main__":
    main()
