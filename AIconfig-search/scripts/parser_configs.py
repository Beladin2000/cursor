#!/usr/bin/env python3
"""Parse running configurations into devices, interfaces, VLANs, and routes.

Reads a configs_swan-style directory. IOS, NX-OS, and the PAN-OS `set`
lines in the Region 10 sample are all accepted. Writes parsed-devices.json.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import hostname_from_config, iter_config_files, write_json

PLATFORM_RE = re.compile(r"^! Platform:\s*(.+)$")
PAN_HOST_RE = re.compile(r"^set deviceconfig system hostname\s+(\S+)")
PAN_IP_RE = re.compile(r"^set deviceconfig system ip-address\s+(\S+)")
PAN_NTP_RE = re.compile(r"^set deviceconfig system ntp-servers primary-ntp-server\s+(\S+)")
PAN_IF_RE = re.compile(r"^set network interface\s+(\S+)\s+layer3 ip\s+(\S+)")
PAN_RULE_RE = re.compile(r"^set rulebase security rules\s+(\S+)\s+(.*)$")
PAN_ROUTE_RE = re.compile(
    r"^set network virtual-router\s+\S+\s+routing-table ip static-route\s+\S+\s+"
    r"destination\s+(\S+)\s+nexthop ip-address\s+(\S+)"
)
IOS_ROUTE_RE = re.compile(r"^ip route\s+(\S+)\s+(\S+)\s+(\S+)")
NTP_RE = re.compile(r"^ntp server\s+(\S+)")
HOST_RE = re.compile(r"^ip host\s+(\S+)\s+(\S+)")


def blank_interface(name: str) -> dict:
    return {
        "name": name,
        "description": "",
        "mode": "",
        "accessVlan": None,
        "nativeVlan": None,
        "allowedVlans": "",
        "ipAddress": "",
        "mask": "",
    }


def parse_text(text: str, fallback: str) -> dict:
    hostname = hostname_from_config(text, fallback)
    platform = ""
    vlans: list[dict] = []
    interfaces: list[dict] = []
    routes: list[dict] = []
    ntp: list[str] = []
    policies: list[dict] = []
    hosts: list[dict] = []
    current_vlan: dict | None = None
    current_if: dict | None = None

    def finish_blocks() -> None:
        nonlocal current_vlan, current_if
        current_vlan = None
        current_if = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line == "!" or line.startswith("!"):
            matched = PLATFORM_RE.match(line) if line else None
            if matched:
                platform = matched.group(1).strip()
            finish_blocks()
            continue
        pan_host = PAN_HOST_RE.match(line)
        if pan_host:
            hostname = pan_host.group(1)
            continue
        pan_ip = PAN_IP_RE.match(line)
        if pan_ip:
            interfaces.append({**blank_interface("management"), "ipAddress": pan_ip.group(1)})
            continue
        pan_ntp = PAN_NTP_RE.match(line)
        if pan_ntp:
            ntp.append(pan_ntp.group(1))
            continue
        pan_if = PAN_IF_RE.match(line)
        if pan_if:
            address, _, mask = pan_if.group(2).partition("/")
            interfaces.append({**blank_interface(pan_if.group(1)), "ipAddress": address, "mask": mask})
            continue
        pan_rule = PAN_RULE_RE.match(line)
        if pan_rule:
            policies.append({"name": pan_rule.group(1), "text": line})
            continue
        pan_route = PAN_ROUTE_RE.match(line)
        if pan_route:
            routes.append({"prefix": pan_route.group(1), "mask": "", "nextHop": pan_route.group(2), "text": line})
            continue
        if line.lower().startswith("vlan ") and line.split()[1].isdigit():
            finish_blocks()
            current_vlan = {"id": int(line.split()[1]), "name": ""}
            vlans.append(current_vlan)
            continue
        if line.lower().startswith("interface "):
            current_vlan = None
            current_if = blank_interface(line.split(None, 1)[1])
            interfaces.append(current_if)
            continue
        if current_vlan is not None and line.lower().startswith("name "):
            current_vlan["name"] = line.split(None, 1)[1]
            continue
        if current_if is not None:
            if line.lower().startswith("description "):
                current_if["description"] = line.split(None, 1)[1]
                continue
            if line.lower().startswith("switchport mode "):
                current_if["mode"] = line.split()[-1]
                continue
            if line.lower().startswith("switchport access vlan "):
                current_if["accessVlan"] = int(line.split()[-1])
                continue
            if line.lower().startswith("switchport trunk native vlan "):
                current_if["nativeVlan"] = int(line.split()[-1])
                continue
            if line.lower().startswith("switchport trunk allowed vlan "):
                current_if["allowedVlans"] = line.split()[-1]
                continue
            if line.lower().startswith("ip address "):
                parts = line.split()
                current_if["ipAddress"] = parts[2]
                current_if["mask"] = parts[3] if len(parts) > 3 else ""
                continue
        route = IOS_ROUTE_RE.match(line)
        if route:
            routes.append({"prefix": route.group(1), "mask": route.group(2), "nextHop": route.group(3), "text": line})
            continue
        ntp_line = NTP_RE.match(line)
        if ntp_line:
            ntp.append(ntp_line.group(1))
            continue
        host = HOST_RE.match(line)
        if host:
            hosts.append({"name": host.group(1), "address": host.group(2)})
    return {
        "hostname": hostname,
        "platform": platform,
        "vlans": vlans,
        "interfaces": interfaces,
        "routes": routes,
        "ntpServers": ntp,
        "policies": policies,
        "hosts": hosts,
    }


def build(config_root: Path, output: Path) -> dict:
    devices = [parse_text(path.read_text(encoding="utf-8", errors="replace"), path.name) for path in iter_config_files(config_root)]
    payload = {"devices": devices, "device_count": len(devices)}
    write_json(output, payload)
    print(f"parsed devices {len(devices)}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse SWAN running configurations")
    parser.add_argument("--config-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build(Path(args.config_root), Path(args.output))


if __name__ == "__main__":
    main()
