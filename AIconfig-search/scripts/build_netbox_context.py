#!/usr/bin/env python3
"""Attach live NetBox context to indexed ARP addresses.

Uses NETBOX_URL and NETBOX_TOKEN from the environment. When NETBOX_URL is
unset, writes the indexed addresses and a configuration warning. The token
is never written to the output file.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ai_server
from index_common import read_json, write_json


def addresses_from_arp(data_root: Path) -> list[str]:
    payload = read_json(data_root / "arp-index.json")
    rows = payload.get("records", payload) if isinstance(payload, dict) else payload
    seen = []
    known = set()
    for row in rows:
        ip = row.get("ip_address") or ""
        if ip and ip not in known:
            known.add(ip)
            seen.append(ip)
    return seen


def build(data_root: Path, limit: int) -> dict:
    addresses = addresses_from_arp(data_root)
    selected = addresses[: max(limit, 0)]
    if not os.environ.get("NETBOX_URL", "").strip():
        payload = {
            "configured": False,
            "warning": ai_server.configuration_warning("NETBOX_URL"),
            "addresses": [{"ip": ip, "live": None} for ip in selected],
            "skipped": max(len(addresses) - len(selected), 0),
        }
        write_json(data_root / "netbox-context.json", payload)
        print(payload["warning"])
        return payload
    enriched = []
    for ip in selected:
        live = ai_server.netbox_lookup(ip)
        enriched.append(
            {
                "ip": ip,
                "live": {
                    "sent": live.get("sent"),
                    "warning": live.get("warning"),
                    "error": live.get("error"),
                    "address": live.get("address"),
                    "prefixes": live.get("prefixes"),
                    "hierarchy": live.get("hierarchy"),
                },
            }
        )
    payload = {
        "configured": True,
        "warning": None,
        "addresses": enriched,
        "skipped": max(len(addresses) - len(selected), 0),
    }
    write_json(data_root / "netbox-context.json", payload)
    print(f"netbox context {len(enriched)} skipped {payload['skipped']}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NetBox context for indexed addresses")
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    build(Path(args.data_root), args.limit)


if __name__ == "__main__":
    main()
