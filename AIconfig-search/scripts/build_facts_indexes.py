#!/usr/bin/env python3
"""Build the ARP and MAC indexes from one show_swan_facts checkout."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_arp_index import build as build_arp
from build_mac_index import build as build_mac


def main() -> None:
    parser = argparse.ArgumentParser(description="Build ARP and MAC indexes")
    parser.add_argument("--facts-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    facts = Path(args.facts_root)
    output = Path(args.output)
    build_arp(facts, output)
    build_mac(facts, output)


if __name__ == "__main__":
    main()
