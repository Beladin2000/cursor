#!/usr/bin/env python3
"""Sync unique ARP addresses through the NetBox IPAM lookup.

Same environment contract as build_netbox_context.py. Writes
netbox-ipam.json. A missing NETBOX_URL is a warning, not a failed build.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_netbox_context import addresses_from_arp, build as build_context
from index_common import write_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync indexed addresses with NetBox IPAM")
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    data_root = Path(args.data_root)
    context = build_context(data_root, args.limit)
    payload = {
        "source": "arp-index",
        "address_count": len(addresses_from_arp(data_root)),
        "configured": context["configured"],
        "warning": context["warning"],
        "addresses": context["addresses"],
    }
    write_json(data_root / "netbox-ipam.json", payload)
    print(f"netbox ipam addresses {payload['address_count']}")


if __name__ == "__main__":
    main()
