#!/usr/bin/env python3
"""Stamp the configuration manifest with the V20.3.5 product name."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import read_json, write_json


def stamp(data_root: Path) -> dict:
    path = data_root / "manifest.json"
    manifest = read_json(path)
    manifest["version"] = "20.3.5"
    manifest["product"] = "SWAN Operational Correlation Engine"
    write_json(path, manifest)
    print(f"stamped {path}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Stamp manifest.json as SWAN V20.3.5")
    parser.add_argument("--data-root", required=True)
    args = parser.parse_args()
    stamp(Path(args.data_root))


if __name__ == "__main__":
    main()
