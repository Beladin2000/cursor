#!/usr/bin/env python3
"""SWAN V20.3.5 entry point. This module is the V27 FastAPI application.

Indexed investigations use the Region 10 slice until public/data is the
corpus the UI reads. Live NetBox, DNS, CPNR, and NNMi go through
ai_server.py. OpenText Network Automation show commands go through
backend/integrations/network_automation.py. One process. Credentials stay
in the environment.
"""

from __future__ import annotations

import json
import os
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import Body, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import ai_server
from backend.integrations.network_automation import run_allowlisted_command

ROOT = Path(__file__).resolve().parent
SLICE_PATH = ROOT / "builtin_slice.json"
COMMANDS_PATH = ROOT / "react" / "src" / "liveCommands.json"
PUBLIC_DIR = ROOT / "public"
HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,253}$")
REASON_RANK = ["Address", "HSRP", "Access port", "ARP", "MAC table", "Policy", "Configuration", "Route"]
REGINA = ZoneInfo("America/Regina")

PRODUCTION_INDEX = {
    "label": "Latest indexed build",
    "devices": 1270,
    "configRecords": 1300053,
    "searchChunks": 131,
    "arp": 16643,
    "mac": 307680,
    "ipCorrelations": 10534,
    "macCorrelations": 16887,
    "deviceCorrelations": 962,
    "operationalDevices": 1129,
    "routes": 5644,
    "policies": 47209,
    "evidenceIps": 14339,
    "evidenceDevices": 1269,
    "evidenceVlans": 1319,
}

INDEXED_SOURCES = [
    {
        "id": "configs_swan",
        "name": "configs_swan",
        "repo": "gitlab.stholdco.com/gestalt/configs_swan.git",
        "detail": "Running configuration: device identity, interfaces, VLANs, SVIs, static and dynamic routes, ACLs and security policy, F5, and configuration references.",
    },
    {
        "id": "show_swan_facts",
        "name": "show_swan_facts",
        "repo": "gitlab.stholdco.com/swan/show_swan_facts.git",
        "detail": "Operational output. ARP is show_ip_arp_all/Show_IP_ARP_All-YYYYMMDD.csv. MAC tables are show_mac_address_table_all/Show_MAC_ADDRESS_TABLE_All-YYYYMMDD.csv.",
    },
    {
        "id": "correlation",
        "name": "Correlation index",
        "repo": "AIconfig-search/public/data/",
        "detail": "SWAN joins the two repositories into manifest.json, device-summaries, arp-index, mac-index, correlation-index, operational-index, evidence-index, and chunk-0000 through chunk-0130.",
    },
]

LIVE_SOURCES = [
    {"id": "netbox", "name": "NetBox", "detail": "IP, prefix, VRF, and the rest of the IPAM context. Called when an investigation needs source-of-truth context."},
    {"id": "dns", "name": "DNS lookup", "detail": "Reverse an IP to a hostname, and forward a hostname to an IP."},
    {"id": "cpnr", "name": "CPNR", "detail": "The DNS records held in CPNR, separate from what a resolver returns."},
    {"id": "nnmi", "name": "NNMi", "detail": "Related alarms. Once the device is known, this is whether monitoring also sees a problem."},
    {"id": "na", "name": "Network Automation", "detail": "Configuration changes: what changed, when, on which device, and what was different."},
]


def load_commands() -> list[str]:
    return json.loads(COMMANDS_PATH.read_text(encoding="utf-8"))


def format_regina(iso: str) -> str:
    text = iso.replace("Z", "+00:00")
    local = datetime.fromisoformat(text).astimezone(REGINA)
    return f"{local.day} {local.strftime('%b')} {local.year}, {local.strftime('%H:%M')} Regina"


def ipv4_to_int(ip: str) -> int | None:
    parts = ip.split(".")
    if len(parts) != 4:
        return None
    value = 0
    for part in parts:
        if not re.fullmatch(r"\d{1,3}", part):
            return None
        octet = int(part)
        if octet > 255:
            return None
        value = (value << 8) + octet
    return value & 0xFFFFFFFF


def mask_from_prefix(prefix: int) -> int:
    if prefix <= 0:
        return 0
    if prefix >= 32:
        return 0xFFFFFFFF
    return (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF


def prefix_contains(cidr: str, ip: str) -> bool:
    if "/" not in cidr:
        return False
    net, length_text = cidr.split("/", 1)
    if not length_text.isdigit():
        return False
    length = int(length_text)
    if length < 0 or length > 32:
        return False
    ip_int = ipv4_to_int(ip)
    net_int = ipv4_to_int(net)
    if ip_int is None or net_int is None:
        return False
    mask = mask_from_prefix(length)
    return (ip_int & mask) == (net_int & mask)


def prefix_length(cidr: str) -> int:
    if "/" not in cidr:
        return -1
    length = cidr.split("/", 1)[1]
    return int(length) if length.isdigit() else -1


def is_ipv4(value: str) -> bool:
    return ipv4_to_int(value) is not None


def normalize_mac(value: str) -> str | None:
    raw = value.strip().lower()
    colon = re.fullmatch(r"[0-9a-f]{2}(?::[0-9a-f]{2}){5}", raw)
    dash = re.fullmatch(r"[0-9a-f]{2}(?:-[0-9a-f]{2}){5}", raw)
    cisco = re.fullmatch(r"[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}", raw)
    bare = re.fullmatch(r"[0-9a-f]{12}", raw)
    if not (colon or dash or cisco or bare):
        return None
    hex_only = re.sub(r"[^0-9a-f]", "", raw)
    return ":".join(hex_only[i : i + 2] for i in range(0, 12, 2))


def reverse_dns_name(ip: str) -> str:
    return ".".join(reversed(ip.split("."))) + ".in-addr.arpa"


def contains_token(haystack: str, token: str) -> bool:
    escaped = re.escape(token)
    return re.search(rf"(?:^|[^A-Za-z0-9]){escaped}(?:$|[^A-Za-z0-9])", haystack, re.I) is not None


def oui_vendor(mac: str) -> str:
    normalized = normalize_mac(mac) or mac.lower()
    if normalized.startswith("00:00:0c"):
        return "Cisco Systems"
    if normalized.startswith(("02:", "06:", "0a:", "0e:")):
        return "Locally administered"
    return "Not in the SWAN OUI cache"


def unique(items: list[str]) -> list[str]:
    seen: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def english_list(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def rank_index(reason: str) -> int:
    try:
        return REASON_RANK.index(reason)
    except ValueError:
        return -1


class Engine:
    def __init__(self, corpus: dict):
        self.corpus = corpus
        self.devices = {device["id"]: device for device in corpus["devices"]}
        self.anomalies = self._build_anomalies()

    def hostname(self, device_id: str) -> str:
        device = self.devices.get(device_id)
        return device["hostname"] if device else device_id

    def device_of(self, device_id: str) -> dict | None:
        return self.devices.get(device_id)

    def find_interface(self, device_id: str, name: str) -> dict | None:
        for iface in self.corpus["interfaces"]:
            if iface["deviceId"] == device_id and iface["name"] == name:
                return iface
        return None

    def mode_of(self, device_id: str, name: str) -> str:
        iface = self.find_interface(device_id, name)
        return iface["mode"] if iface else "unknown"

    def search_lines(self, predicate) -> list[dict]:
        hits = []
        for doc in self.corpus["configs"]:
            for index, text in enumerate(doc["lines"]):
                trimmed = text.strip()
                if (
                    not trimmed
                    or trimmed == "!"
                    or trimmed.startswith("! SWAN")
                    or trimmed.startswith("! Captured")
                    or trimmed.startswith("! Platform")
                    or trimmed.startswith("! Device")
                ):
                    continue
                if not predicate(text):
                    continue
                hits.append({"deviceId": doc["deviceId"], "line": index + 1, "text": trimmed})
        return hits

    def _change_mention(self, device_ids: list[str], pattern: re.Pattern[str]) -> str | None:
        for change in self.corpus["changes"]:
            if change["deviceId"] in device_ids and (
                pattern.search(change["summary"]) or pattern.search(change["diff"])
            ):
                return (
                    f"Network Automation recorded “{change['summary']}” by {change['user']} "
                    f"at {format_regina(change['time'])}."
                )
        return None

    def _build_anomalies(self) -> list[dict]:
        anomalies: list[dict] = []
        seen_pairs: set[str] = set()
        for iface in self.corpus["interfaces"]:
            if not iface.get("neighborDeviceId") or not iface.get("neighborInterface"):
                continue
            peer = self.find_interface(iface["neighborDeviceId"], iface["neighborInterface"])
            if not peer:
                continue
            key = "|".join(sorted([iface["id"], peer["id"]]))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            if iface.get("mode") != "trunk" or peer.get("mode") != "trunk":
                continue
            if (
                iface.get("nativeVlan") is not None
                and peer.get("nativeVlan") is not None
                and iface["nativeVlan"] != peer["nativeVlan"]
            ):
                device_ids = [iface["deviceId"], peer["deviceId"]]
                recorded = self._change_mention(device_ids, re.compile(r"native vlan", re.I))
                detail = (
                    f"{self.hostname(iface['deviceId'])} {iface['name']} uses native VLAN {iface['nativeVlan']}. "
                    f"{self.hostname(peer['deviceId'])} {peer['name']} uses native VLAN {peer['nativeVlan']}."
                )
                if recorded:
                    detail = f"{detail} {recorded}"
                anomalies.append(
                    {
                        "id": f"native:{key}",
                        "code": "native-vlan-mismatch",
                        "severity": "major",
                        "title": "Native VLAN mismatch",
                        "detail": detail,
                        "query": f"vlan {iface['nativeVlan']}",
                        "vlanIds": [iface["nativeVlan"], peer["nativeVlan"]],
                        "ips": [],
                        "macs": [],
                        "deviceIds": device_ids,
                    }
                )
            if iface.get("allowedVlans") and peer.get("allowedVlans"):
                only_iface = [vlan for vlan in iface["allowedVlans"] if vlan not in peer["allowedVlans"]]
                only_peer = [vlan for vlan in peer["allowedVlans"] if vlan not in iface["allowedVlans"]]
                differed: list[int] = []
                for vlan in [*only_iface, *only_peer]:
                    if vlan not in differed:
                        differed.append(vlan)
                if differed:
                    names = []
                    for vlan in differed:
                        name = next((entry["name"] for entry in self.corpus["vlans"] if entry["vlanId"] == vlan), None)
                        names.append(f"{vlan} ({name})" if name else str(vlan))
                    anomalies.append(
                        {
                            "id": f"allowed:{key}",
                            "code": "allowed-vlan-mismatch",
                            "severity": "major",
                            "title": "Trunk allowed-VLAN mismatch",
                            "detail": (
                                f"{self.hostname(iface['deviceId'])} {iface['name']} and "
                                f"{self.hostname(peer['deviceId'])} {peer['name']} do not allow the same VLANs. "
                                f"The difference is {', '.join(names)}."
                            ),
                            "query": f"vlan {differed[0]}",
                            "vlanIds": differed,
                            "ips": [],
                            "macs": [],
                            "deviceIds": [iface["deviceId"], peer["deviceId"]],
                        }
                    )

        access_groups: dict[str, list[dict]] = {}
        for entry in self.corpus["macs"]:
            iface = self.find_interface(entry["deviceId"], entry["interface"])
            if not iface or iface.get("mode") != "access":
                continue
            key = f"{entry['mac']}|{entry['vlan']}"
            access_groups.setdefault(key, []).append(entry)
        for key, entries in access_groups.items():
            unique_ports: dict[str, dict] = {}
            for entry in entries:
                unique_ports[f"{entry['deviceId']}|{entry['interface']}"] = entry
            if len(unique_ports) < 2:
                continue
            mac, vlan_text = key.split("|", 1)
            vlan = int(vlan_text)
            places = " and ".join(
                f"{self.hostname(entry['deviceId'])} {entry['interface']}" for entry in unique_ports.values()
            )
            ip = next((row["ip"] for row in self.corpus["arp"] if row["mac"] == mac), None)
            detail = f"{mac} in VLAN {vlan} is dynamic on {places}."
            if ip:
                detail = f"{detail} ARP for {ip} points at this MAC."
            anomalies.append(
                {
                    "id": f"mac-access:{key}",
                    "code": "mac-on-multiple-access-ports",
                    "severity": "major",
                    "title": "MAC learned on two access ports",
                    "detail": detail,
                    "query": mac,
                    "vlanIds": [vlan],
                    "ips": [ip] if ip else [],
                    "macs": [mac],
                    "deviceIds": [entry["deviceId"] for entry in unique_ports.values()],
                }
            )

        for record in self.corpus["dns"]:
            if record["type"] != "A":
                continue
            ptr = next(
                (
                    entry
                    for entry in self.corpus["dns"]
                    if entry["type"] == "PTR" and entry["name"] == reverse_dns_name(record["value"])
                ),
                None,
            )
            if not ptr or ptr["value"] == record["name"]:
                continue
            arp = next((entry for entry in self.corpus["arp"] if entry["ip"] == record["value"]), None)
            access = [
                entry
                for entry in self.corpus["macs"]
                if arp and entry["mac"] == arp["mac"] and self.mode_of(entry["deviceId"], entry["interface"]) == "access"
            ]
            anomalies.append(
                {
                    "id": f"dns:{record['value']}",
                    "code": "dns-mismatch",
                    "severity": "warning",
                    "title": "Forward and reverse DNS disagree",
                    "detail": f"{record['value']} resolves to {record['name']}, but the PTR is {ptr['value']}.",
                    "query": record["value"],
                    "vlanIds": [entry["vlan"] for entry in access],
                    "ips": [record["value"]],
                    "macs": [arp["mac"]] if arp else [],
                    "deviceIds": [entry["deviceId"] for entry in access],
                }
            )

        exact_ips: list[str] = []
        for policy in self.corpus["policies"]:
            for token in policy["matches"]:
                if is_ipv4(token) and token not in exact_ips:
                    exact_ips.append(token)
        for ip in exact_ips:
            learned = any(entry["ip"] == ip for entry in self.corpus["arp"])
            configured = any(iface.get("ip") == ip or iface.get("standbyIp") == ip for iface in self.corpus["interfaces"])
            if learned or configured:
                continue
            policy = next((entry for entry in self.corpus["policies"] if ip in entry["matches"]), None)
            shut = next(
                (
                    iface
                    for iface in self.corpus["interfaces"]
                    if iface.get("adminStatus") == "down" and contains_token(iface.get("description") or "", ip)
                ),
                None,
            )
            subject = ip
            if policy:
                kind = "rule" if policy["kind"] == "security-rule" else policy["kind"]
                subject = f"{self.hostname(policy['deviceId'])} {kind} {policy['name']} references {ip}"
            detail = f"{subject}, and no device has it in ARP."
            if shut:
                detail = f"{detail} {self.hostname(shut['deviceId'])} {shut['name']} is shut and described with that address."
            anomalies.append(
                {
                    "id": f"policy:{ip}",
                    "code": "policy-without-arp",
                    "severity": "warning",
                    "title": "Policy references an address ARP has not learned",
                    "detail": detail,
                    "query": ip,
                    "vlanIds": [shut["accessVlan"]] if shut and shut.get("accessVlan") else [],
                    "ips": [ip],
                    "macs": [],
                    "deviceIds": [policy["deviceId"]] if policy else [],
                }
            )

        for record in self.corpus["netboxIps"]:
            ip = record["address"].split("/")[0]
            learned = any(entry["ip"] == ip for entry in self.corpus["arp"])
            configured = any(iface.get("ip") == ip or iface.get("standbyIp") == ip for iface in self.corpus["interfaces"])
            if learned or configured or record.get("role") == "hsrp":
                continue
            if record.get("status") not in ("reserved", "active"):
                continue
            if record.get("status") == "active" and record.get("role") not in ("endpoint", "server"):
                continue
            anomalies.append(
                {
                    "id": f"netbox:{ip}",
                    "code": "netbox-arp-gap",
                    "severity": "warning",
                    "title": "NetBox and ARP disagree",
                    "detail": f"{ip} is {record['status']} in NetBox for {record['assignedTo']} and is not learned in ARP.",
                    "query": ip,
                    "vlanIds": [record["vlanId"]] if record.get("vlanId") else [],
                    "ips": [ip],
                    "macs": [],
                    "deviceIds": [],
                }
            )

        svis: dict[int, list[dict]] = {}
        for iface in self.corpus["interfaces"]:
            if iface.get("mode") == "svi" and iface.get("vlanId") is not None:
                svis.setdefault(iface["vlanId"], []).append(iface)
        for vlan_id, group in svis.items():
            up = [iface for iface in group if iface.get("adminStatus") == "up"]
            down = [iface for iface in group if iface.get("adminStatus") == "down"]
            if not up or not down:
                continue
            sites = {self.devices.get(iface["deviceId"], {}).get("site") for iface in group}
            sites.discard(None)
            if len(sites) != 1:
                continue
            recorded = self._change_mention( [iface["deviceId"] for iface in down], re.compile(rf"vlan\s*{vlan_id}\b", re.I))
            detail = (
                f"Vlan{vlan_id} is up on {english_list([self.hostname(iface['deviceId']) for iface in up])} "
                f"and administratively down on {english_list([self.hostname(iface['deviceId']) for iface in down])}."
            )
            if recorded:
                detail = f"{detail} {recorded}"
            anomalies.append(
                {
                    "id": f"svi:{vlan_id}",
                    "code": "svi-asymmetric",
                    "severity": "warning",
                    "title": "SVI is down on one distribution switch",
                    "detail": detail,
                    "query": f"vlan {vlan_id}",
                    "vlanIds": [vlan_id],
                    "ips": [],
                    "macs": [],
                    "deviceIds": [iface["deviceId"] for iface in group],
                }
            )
        return anomalies

    def parse_query(self, raw: str) -> dict:
        query = raw.strip()
        mac = normalize_mac(query)
        if mac and re.fullmatch(r"[0-9a-fA-F:.\-]+", query.strip()):
            return {"kind": "mac", "mac": mac, "query": query}
        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}/\d{1,2}", query):
            ip, length_text = query.split("/")
            length = int(length_text)
            if is_ipv4(ip) and 0 <= length <= 32:
                return {"kind": "prefix", "prefix": query, "query": query}
        if is_ipv4(query):
            return {"kind": "ip", "ip": query, "query": query}
        vlan_match = re.fullmatch(r"vlan\s*(\d{1,4})", query, re.I) or re.fullmatch(r"(\d{1,4})", query)
        if vlan_match:
            vlan_id = int(vlan_match.group(1))
            if 1 <= vlan_id <= 4094:
                return {"kind": "vlan", "vlanId": vlan_id, "query": query}
        return {"kind": "text", "text": query, "query": query}

    def match_devices(self, query: str) -> list[dict]:
        needle = query.lower()
        exact = [device for device in self.corpus["devices"] if device["hostname"].lower() == needle]
        if exact:
            return exact
        return [device for device in self.corpus["devices"] if needle in device["hostname"].lower()]

    def describe_query(self, raw: str) -> str | None:
        trimmed = raw.strip()
        if not trimmed:
            return None
        parsed = self.parse_query(trimmed)
        if parsed["kind"] == "ip":
            return "IP address"
        if parsed["kind"] == "prefix":
            return "Prefix"
        if parsed["kind"] == "mac":
            return "MAC address"
        if parsed["kind"] == "vlan":
            return f"VLAN {parsed['vlanId']}"
        if len(trimmed) < 2:
            return None
        devices = self.match_devices(trimmed)
        if len(devices) == 1:
            return "Device"
        if len(devices) > 1:
            return f"{len(devices)} devices"
        return "Configuration"

    def _blank(self, partial: dict) -> dict:
        dossier = {
            "badges": [],
            "chain": [],
            "devices": [],
            "interfaces": [],
            "vlans": [],
            "arp": [],
            "macs": [],
            "routes": [],
            "policies": [],
            "configDevices": [],
            "configHits": [],
            "netbox": [],
            "dns": [],
            "lookups": [],
            "alarms": [],
            "changes": [],
            "anomalies": [],
            "sources": [],
            "highlightTokens": [partial["query"]],
        }
        dossier.update(partial)
        return dossier

    def _select_anomalies(self, scope: dict) -> list[dict]:
        chosen = []
        for anomaly in self.anomalies:
            if any(ip in scope["ips"] for ip in anomaly["ips"]):
                chosen.append(anomaly)
                continue
            if any(mac in scope["macs"] for mac in anomaly["macs"]):
                chosen.append(anomaly)
                continue
            if scope["queryType"] == "device" and scope.get("subjectDeviceId") in anomaly["deviceIds"]:
                chosen.append(anomaly)
                continue
            if scope["queryType"] == "vlan" and any(vlan in scope["vlanIds"] for vlan in anomaly["vlanIds"]):
                chosen.append(anomaly)
                continue
            if scope["queryType"] in ("ip", "mac") and any(vlan in scope["accessVlans"] for vlan in anomaly["vlanIds"]):
                chosen.append(anomaly)
                continue
            if scope["queryType"] == "prefix" and any(vlan in scope["vlanIds"] for vlan in anomaly["vlanIds"]):
                chosen.append(anomaly)
        return chosen

    def _select_alarms(self, scope: dict) -> list[dict]:
        chosen = []
        for alarm in self.corpus["alarms"]:
            if any(ip in scope["ips"] for ip in alarm.get("ips") or []):
                chosen.append(alarm)
                continue
            if any(mac in scope["macs"] for mac in alarm.get("macs") or []):
                chosen.append(alarm)
                continue
            if scope["queryType"] == "device" and alarm["deviceId"] == scope.get("subjectDeviceId"):
                chosen.append(alarm)
                continue
            if scope["queryType"] == "vlan" and any(vlan in scope["vlanIds"] for vlan in alarm.get("vlanIds") or []):
                chosen.append(alarm)
                continue
            if scope["queryType"] in ("ip", "mac") and any(vlan in scope["accessVlans"] for vlan in alarm.get("vlanIds") or []):
                chosen.append(alarm)
                continue
            if scope["queryType"] == "prefix" and any(vlan in scope["vlanIds"] for vlan in alarm.get("vlanIds") or []):
                chosen.append(alarm)
        return chosen

    def _text_mentions_vlan(self, text: str, vlan_id: int) -> bool:
        return re.search(rf"vlan\s*{vlan_id}\b", text, re.I) is not None

    def _select_changes(self, scope: dict) -> list[dict]:
        rows = []
        for change in self.corpus["changes"]:
            text = f"{change['summary']}\n{change['diff']}"
            if any(contains_token(text, ip) for ip in scope["ips"]):
                rows.append(change)
                continue
            if any(mac in text.lower() for mac in scope["macs"]):
                rows.append(change)
                continue
            if scope["queryType"] == "device" and change["deviceId"] == scope.get("subjectDeviceId"):
                rows.append(change)
                continue
            if any(self._text_mentions_vlan(text, vlan) for vlan in scope["accessVlans"]):
                rows.append(change)
                continue
            if scope["queryType"] in ("vlan", "prefix") and any(
                self._text_mentions_vlan(text, vlan) for vlan in scope["vlanIds"]
            ):
                rows.append(change)
        return [{"hostname": self.hostname(change["deviceId"]), "change": change} for change in rows]

    def _interface_uses_vlan(self, iface: dict, vlan_id: int) -> bool:
        if iface.get("accessVlan") == vlan_id or iface.get("vlanId") == vlan_id or iface.get("nativeVlan") == vlan_id:
            return True
        return iface.get("mode") == "trunk" and vlan_id in (iface.get("allowedVlans") or [])

    def _vlan_summary(self, vlan_ids: list[int]) -> list[dict]:
        rows = []
        for vlan_id in vlan_ids:
            defs = [vlan for vlan in self.corpus["vlans"] if vlan["vlanId"] == vlan_id]
            names = unique([vlan["name"] for vlan in defs])
            related = [iface for iface in self.corpus["interfaces"] if self._interface_uses_vlan(iface, vlan_id)]
            rows.append(
                {
                    "vlanId": vlan_id,
                    "name": " / ".join(names) if names else f"VLAN {vlan_id}",
                    "devices": [self.hostname(vlan["deviceId"]) for vlan in defs],
                    "accessCount": sum(1 for iface in related if iface["mode"] == "access"),
                    "trunkCount": sum(1 for iface in related if iface["mode"] == "trunk" and iface.get("nativeVlan") != vlan_id),
                    "sviCount": sum(1 for iface in related if iface["mode"] == "svi"),
                    "nativeCount": sum(1 for iface in related if iface["mode"] == "trunk" and iface.get("nativeVlan") == vlan_id),
                }
            )
        return rows

    def _interface_note(self, iface: dict, focus_vlan: int | None = None) -> str:
        notes = []
        if iface.get("adminStatus") == "down":
            notes.append("Administratively down")
        elif iface.get("operStatus") == "down":
            notes.append("Down")
        if iface.get("mode") == "access":
            notes.append(f"Access VLAN {iface.get('accessVlan') or ''}".strip())
        if iface.get("mode") == "svi":
            notes.append(f"SVI · HSRP {iface['standbyIp']}" if iface.get("standbyIp") else "SVI")
        if iface.get("mode") == "routed":
            notes.append("Routed")
        if iface.get("mode") == "loopback":
            notes.append("Loopback")
        if iface.get("mode") == "trunk" and focus_vlan is not None and iface.get("nativeVlan") == focus_vlan:
            notes.append("Native VLAN")
        elif iface.get("mode") == "trunk":
            notes.append("Trunk")
        if iface.get("neighborDeviceId") and iface.get("neighborInterface") and iface.get("nativeVlan") is not None:
            peer = self.find_interface(iface["neighborDeviceId"], iface["neighborInterface"])
            if peer and peer.get("nativeVlan") is not None and peer["nativeVlan"] != iface["nativeVlan"]:
                notes.append("Native differs from peer")
        return " · ".join(notes)

    def _push_device(self, reasons: dict[str, set[str]], device_id: str | None, reason: str) -> None:
        if not device_id or device_id not in self.devices:
            return
        reasons.setdefault(device_id, set()).add(reason)

    def _device_rows(self, reasons: dict[str, set[str]]) -> list[dict]:
        rows = []
        for device_id, reason_set in reasons.items():
            ordered = sorted(reason_set, key=rank_index)
            rows.append({"device": self.devices[device_id], "reasons": ordered})
        rows.sort(key=lambda row: (min(rank_index(reason) for reason in row["reasons"]), row["device"]["hostname"]))
        return rows

    def _mac_rows(self, entries: list[dict]) -> list[dict]:
        def rank(mode: str) -> int:
            return {"access": 0, "svi": 1, "routed": 2}.get(mode, 3)

        rows = []
        for entry in entries:
            iface = self.find_interface(entry["deviceId"], entry["interface"])
            rows.append(
                {
                    "hostname": self.hostname(entry["deviceId"]),
                    "entry": entry,
                    "mode": iface["mode"] if iface else "unknown",
                    "description": (iface or {}).get("description") or "",
                }
            )
        rows.sort(key=lambda row: (rank(row["mode"]), row["hostname"], row["entry"]["interface"]))
        return rows

    def _route_covers(self, route: dict, ip: str) -> bool:
        if route["prefix"] == "0.0.0.0/0":
            return False
        return prefix_contains(route["prefix"], ip)

    def _matching_routes(self, ip: str) -> list[dict]:
        matched = [route for route in self.corpus["routes"] if self._route_covers(route, ip)]
        best = max((prefix_length(route["prefix"]) for route in matched), default=-1)
        rows = [
            {"hostname": self.hostname(route["deviceId"]), "route": route, "longest": prefix_length(route["prefix"]) == best}
            for route in matched
        ]
        rows.sort(key=lambda row: (-prefix_length(row["route"]["prefix"]), row["hostname"]))
        return rows

    def _policy_mentions(self, policy: dict, ips: list[str], text: list[str], min_prefix: int) -> bool:
        for token in policy["matches"]:
            if "/" in token:
                if prefix_length(token) < min_prefix:
                    continue
                if any(prefix_contains(token, ip) for ip in ips):
                    return True
                continue
            if token in ips or any(value.lower() == token.lower() for value in text):
                return True
        return False

    def _matching_policies(self, ips: list[str], text: list[str] | None = None, min_prefix: int = 20) -> list[dict]:
        text = text or []
        rows = []
        for policy in self.corpus["policies"]:
            if not self._policy_mentions(policy, ips, text, min_prefix):
                continue
            exact = any(
                token in ips or any(value.lower() == token.lower() for value in text) for token in policy["matches"]
            )
            rows.append({"hostname": self.hostname(policy["deviceId"]), "policy": policy, "exact": exact})
        rows.sort(key=lambda row: (not row["exact"], row["hostname"]))
        return rows[:8]

    def _prefix_hierarchy(self, ip: str) -> str:
        prefixes = [prefix for prefix in self.corpus["netboxPrefixes"] if prefix_contains(prefix["prefix"], ip)]
        prefixes.sort(key=lambda prefix: prefix_length(prefix["prefix"]), reverse=True)
        return " → ".join(prefix["prefix"] for prefix in prefixes)

    def _netbox_for_ips(self, ips: list[str]) -> list[dict]:
        cards = []
        for ip in ips:
            record = next((entry for entry in self.corpus["netboxIps"] if entry["address"].split("/")[0] == ip), None)
            if not record:
                continue
            rows = [
                {"label": "Prefix", "value": f"{record['prefix']} · {record['prefixDescription']}"},
                {"label": "VRF", "value": record["vrf"]},
                {"label": "Status", "value": record["status"]},
                {"label": "Role", "value": record["role"]},
            ]
            if record.get("dnsName"):
                rows.append({"label": "DNS name", "value": record["dnsName"]})
            rows.extend(
                [
                    {"label": "Assigned to", "value": record["assignedTo"]},
                    {"label": "Site", "value": record["site"]},
                    {"label": "Tenant", "value": record["tenant"]},
                ]
            )
            if record.get("vlanId"):
                rows.append({"label": "VLAN", "value": str(record["vlanId"])})
            rows.append({"label": "Hierarchy", "value": self._prefix_hierarchy(ip)})
            rows.append({"label": "Description", "value": record["description"]})
            cards.append({"title": record["address"], "rows": rows})
        return cards

    def _netbox_device_card(self, device: dict) -> dict:
        record = next((entry for entry in self.corpus["netboxDevices"] if entry["hostname"] == device["hostname"]), None)
        return {
            "title": device["hostname"],
            "rows": [
                {"label": "Role", "value": (record or {}).get("role") or device["role"]},
                {"label": "Platform", "value": (record or {}).get("platform") or f"{device['vendor']} {device['platform']}"},
                {"label": "Site", "value": (record or {}).get("site") or device["siteName"]},
                {"label": "Rack", "value": (record or {}).get("rack") or device["rack"]},
                {"label": "Status", "value": (record or {}).get("status") or device["status"]},
                {"label": "Primary IP", "value": (record or {}).get("primaryIp") or device["mgmtIp"]},
                {"label": "Serial", "value": (record or {}).get("serial") or device["serial"]},
            ],
        }

    def _prefix_card(self, prefix: dict, vlan_label: str | None = None) -> dict:
        rows = [
            {"label": "Description", "value": prefix["description"]},
            {"label": "VRF", "value": prefix["vrf"]},
            {"label": "Site", "value": prefix["site"]},
            {"label": "Role", "value": prefix["role"]},
            {"label": "Status", "value": prefix["status"]},
        ]
        if prefix.get("vlanId"):
            rows.append({"label": "VLAN", "value": vlan_label or str(prefix["vlanId"])})
        return {"title": prefix["prefix"], "rows": rows}

    def _dns_bundle(self, ips: list[str], names: list[str] | None = None) -> dict:
        names = names or []
        wanted = set(ips)
        reverses = {reverse_dns_name(ip) for ip in ips}
        name_set = {name.lower() for name in names}
        records = []
        for record in self.corpus["dns"]:
            if record["value"] in wanted or record["name"] in reverses or record["name"].lower() in name_set:
                ptr = next(
                    (
                        other
                        for other in self.corpus["dns"]
                        if other["type"] == "PTR" and other["name"] == reverse_dns_name(record["value"])
                    ),
                    None,
                )
                records.append(
                    {
                        "record": record,
                        "conflict": record["type"] == "A" and bool(ptr and ptr["value"] != record["name"]),
                    }
                )
        lookups = []
        for ip in ips:
            forward = next((entry for entry in records if entry["record"]["type"] == "A" and entry["record"]["value"] == ip), None)
            reverse = next(
                (entry for entry in records if entry["record"]["type"] == "PTR" and entry["record"]["name"] == reverse_dns_name(ip)),
                None,
            )
            agrees = (not forward) or (not reverse) or forward["record"]["name"] == reverse["record"]["value"]
            if reverse:
                lookups.append(
                    {"direction": "reverse", "query": ip, "answer": reverse["record"]["value"], "agreesWithCpnr": agrees}
                )
            if forward:
                lookups.append(
                    {
                        "direction": "forward",
                        "query": forward["record"]["name"],
                        "answer": forward["record"]["value"],
                        "agreesWithCpnr": agrees,
                    }
                )
        return {"records": records, "lookups": lookups}

    def _line_mentions_vlan(self, text: str, vlan_id: int) -> bool:
        if contains_token(text, f"vlan {vlan_id}") or contains_token(text, f"Vlan{vlan_id}"):
            return True
        allowed = re.search(r"allowed vlan\s+([0-9,]+)", text, re.I)
        return bool(allowed and str(vlan_id) in allowed.group(1).split(","))

    def _attach_sources(self, dossier: dict) -> dict:
        def hit(count: int, noun: str, empty: str) -> str:
            return f"{count} {noun}" if count else empty

        dns_agrees = all(lookup["agreesWithCpnr"] for lookup in dossier["lookups"])
        dossier["sources"] = [
            {
                "id": "config",
                "tier": "indexed",
                "label": "Configuration",
                "system": "configs_swan",
                "state": "hit" if dossier["configHits"] or dossier["configDevices"] else "clear",
                "detail": hit(len(dossier["configHits"]), "referencing lines", "No configuration line references this investigation"),
            },
            {
                "id": "arp",
                "tier": "indexed",
                "label": "ARP",
                "system": "show_swan_facts",
                "state": "hit" if dossier["arp"] else "clear",
                "detail": hit(len(dossier["arp"]), "entries", "No ARP entry"),
            },
            {
                "id": "mac",
                "tier": "indexed",
                "label": "MAC address table",
                "system": "show_swan_facts",
                "state": "hit" if dossier["macs"] else "clear",
                "detail": hit(len(dossier["macs"]), "entries", "No MAC entry"),
            },
            {
                "id": "route",
                "tier": "indexed",
                "label": "Routes",
                "system": "Correlation index",
                "state": "hit" if dossier["routes"] else "clear",
                "detail": hit(len(dossier["routes"]), "routes", "No covering route"),
            },
            {
                "id": "policy",
                "tier": "indexed",
                "label": "Policy",
                "system": "configs_swan",
                "state": "hit" if dossier["policies"] else "clear",
                "detail": hit(len(dossier["policies"]), "policies", "No policy reference"),
            },
            {
                "id": "netbox",
                "tier": "live",
                "label": "NetBox",
                "system": "IP / subnet context",
                "state": "hit" if dossier["netbox"] else "clear",
                "detail": f"{len(dossier['netbox'])} records" if dossier["netbox"] else "No NetBox record",
            },
            {
                "id": "dns",
                "tier": "live",
                "label": "DNS lookup",
                "system": "Forward and reverse",
                "state": "hit" if dossier["lookups"] else "clear",
                "detail": (
                    f"{len(dossier['lookups'])} answers"
                    if dossier["lookups"] and dns_agrees
                    else "Forward and reverse disagree"
                    if dossier["lookups"]
                    else "No DNS record found"
                ),
            },
            {
                "id": "cpnr",
                "tier": "live",
                "label": "CPNR",
                "system": "DNS records",
                "state": "hit" if dossier["dns"] else "clear",
                "detail": (
                    "A and PTR disagree"
                    if any(entry["conflict"] for entry in dossier["dns"])
                    else f"{len(dossier['dns'])} records"
                    if dossier["dns"]
                    else "No CPNR record found"
                ),
            },
            {
                "id": "nnmi",
                "tier": "live",
                "label": "NNMi",
                "system": "Related alarms",
                "state": "hit" if dossier["alarms"] else "clear",
                "detail": f"{len(dossier['alarms'])} open alarms" if dossier["alarms"] else "No open alarm tied to this investigation",
            },
            {
                "id": "na",
                "tier": "live",
                "label": "Network Automation",
                "system": "Configuration changes",
                "state": "hit" if dossier["changes"] else "clear",
                "detail": f"{len(dossier['changes'])} related changes" if dossier["changes"] else "No related configuration change",
            },
        ]
        return dossier

    def _full_configs(self, device_ids: list[str]) -> list[dict]:
        rows = []
        seen = []
        for device_id in device_ids:
            if device_id in seen:
                continue
            seen.append(device_id)
            if len(seen) > 3:
                break
            device = self.device_of(device_id)
            doc = next((entry for entry in self.corpus["configs"] if entry["deviceId"] == device_id), None)
            if device and doc:
                rows.append({"device": device, "lines": doc["lines"]})
        return rows

    def dossier_for_device(self, device: dict, query: str) -> dict:
        own = [iface for iface in self.corpus["interfaces"] if iface["deviceId"] == device["id"]]
        reasons: dict[str, set[str]] = {device["id"]: {"Address"}}
        tokens = [device["hostname"], device["mgmtIp"]]
        hits = [
            hit
            for hit in self.search_lines(lambda line: any(contains_token(line, token) for token in tokens))
            if hit["deviceId"] != device["id"]
        ][:30]
        for hit in hits:
            self._push_device(reasons, hit["deviceId"], "Configuration")
        arp_hits = [entry for entry in self.corpus["arp"] if entry["deviceId"] == device["id"] or entry["ip"] == device["mgmtIp"]]
        for entry in arp_hits:
            self._push_device(reasons, entry["deviceId"], "ARP")
        mac_hits = [entry for entry in self.corpus["macs"] if entry["deviceId"] == device["id"] or entry["mac"] == device["mac"]]
        policies = self._matching_policies([device["mgmtIp"]], [device["hostname"]])
        for policy in policies:
            self._push_device(reasons, policy["policy"]["deviceId"], "Policy")
        routes = [
            {"hostname": device["hostname"], "route": route, "longest": route["protocol"] == "connected"}
            for route in self.corpus["routes"]
            if route["deviceId"] == device["id"]
        ]
        access_vlans = []
        for iface in own:
            for vlan in (iface.get("accessVlan"), iface.get("vlanId"), iface.get("nativeVlan")):
                if vlan is not None and vlan not in access_vlans:
                    access_vlans.append(vlan)
        scope = {
            "queryType": "device",
            "subjectDeviceId": device["id"],
            "primaryDeviceIds": [device["id"]],
            "ips": [device["mgmtIp"]],
            "macs": [device["mac"]],
            "accessVlans": access_vlans,
            "vlanIds": access_vlans,
        }
        found = self._select_anomalies(scope)
        alarms = self._select_alarms(scope)
        zone = "regn07.swan.net" if device["region"] == "REGN07" else "regn10.swan.net"
        dossier = self._blank(
            {
                "query": query,
                "queryType": "device",
                "title": device["hostname"],
                "subtitle": f"{device['vendor']} {device['platform']} · {device['os']} {device['osVersion']} · {device['siteName']}",
            }
        )
        dossier["badges"] = [
            {"label": device["role"], "tone": "neutral"},
            {"label": device["status"], "tone": "ok" if device["status"] == "up" else "attention"},
            {"label": device["mgmtIp"], "tone": "info"},
        ]
        if any(anomaly["severity"] == "major" for anomaly in found):
            dossier["badges"].append({"label": "Correlation finding", "tone": "attention"})
        vlan_count = sum(1 for vlan in self.corpus["vlans"] if vlan["deviceId"] == device["id"])
        dossier["chain"] = [
            {"id": "device", "kind": "Device", "label": device["hostname"], "detail": device["platform"], "query": device["hostname"], "tone": "neutral"},
            {"id": "ip", "kind": "Management IP", "label": device["mgmtIp"], "detail": device["siteName"], "query": device["mgmtIp"], "tone": "ok"},
            {"id": "vlan", "kind": "VLANs", "label": str(vlan_count), "detail": "Defined on this device", "tone": "neutral"},
            {
                "id": "evidence",
                "kind": "Elsewhere",
                "label": str(len(hits)),
                "detail": "Configuration references on other devices",
                "tone": "attention" if hits else "ok",
            },
        ]
        if alarms:
            dossier["chain"].append({"id": "alarm", "kind": "NNMi", "label": str(len(alarms)), "detail": alarms[0]["summary"], "tone": "attention"})
        dossier["devices"] = self._device_rows(reasons)
        dossier["interfaces"] = [{"hostname": device["hostname"], "iface": iface, "note": self._interface_note(iface)} for iface in own]
        own_vlans = []
        for vlan in self.corpus["vlans"]:
            if vlan["deviceId"] == device["id"] and vlan["vlanId"] not in own_vlans:
                own_vlans.append(vlan["vlanId"])
        dossier["vlans"] = [
            {**vlan, "devices": [name for name in vlan["devices"] if name == device["hostname"]]}
            for vlan in self._vlan_summary(own_vlans)
        ]
        dossier["arp"] = [{"hostname": self.hostname(entry["deviceId"]), "entry": entry} for entry in arp_hits]
        dossier["macs"] = self._mac_rows(mac_hits)
        dossier["routes"] = routes
        dossier["policies"] = policies
        dossier["configDevices"] = self._full_configs([device["id"]])
        dossier["configHits"] = [{**hit, "hostname": self.hostname(hit["deviceId"]), "elsewhere": True} for hit in hits]
        bundle = self._dns_bundle([device["mgmtIp"]], [f"{device['hostname'].lower()}.{zone}"])
        dossier["netbox"] = [self._netbox_device_card(device), *self._netbox_for_ips([device["mgmtIp"]])]
        dossier["dns"] = bundle["records"]
        dossier["lookups"] = bundle["lookups"]
        dossier["alarms"] = alarms
        dossier["changes"] = self._select_changes(scope)
        dossier["anomalies"] = found
        dossier["highlightTokens"] = [device["hostname"], device["mgmtIp"], device["mac"]]
        return self._attach_sources(dossier)

    def dossier_for_ip(self, ip: str, query: str) -> dict:
        arp_hits = [entry for entry in self.corpus["arp"] if entry["ip"] == ip]
        macs: list[str] = []
        for entry in arp_hits:
            if entry["mac"] not in macs:
                macs.append(entry["mac"])
        for iface in self.corpus["interfaces"]:
            if iface.get("ip") == ip:
                device = self.device_of(iface["deviceId"])
                if device and device["mac"] not in macs:
                    macs.append(device["mac"])
        mac_hits = [entry for entry in self.corpus["macs"] if entry["mac"] in macs]
        access = [entry for entry in mac_hits if self.mode_of(entry["deviceId"], entry["interface"]) == "access"]
        access_vlans = []
        for entry in access:
            if entry["vlan"] not in access_vlans:
                access_vlans.append(entry["vlan"])
        owners = [iface for iface in self.corpus["interfaces"] if iface.get("ip") == ip or iface.get("standbyIp") == ip]
        netbox_record = next((entry for entry in self.corpus["netboxIps"] if entry["address"].split("/")[0] == ip), None)
        described = [iface for iface in self.corpus["interfaces"] if contains_token(iface.get("description") or "", ip)]
        related = []
        for vlan in [
            *access_vlans,
            *[iface.get("vlanId") for iface in owners],
            *[iface.get("accessVlan") or iface.get("vlanId") for iface in described],
            netbox_record.get("vlanId") if netbox_record else None,
        ]:
            if vlan is not None and vlan not in related:
                related.append(vlan)
        reasons: dict[str, set[str]] = {}
        for iface in owners:
            self._push_device(reasons, iface["deviceId"], "HSRP" if iface.get("standbyIp") == ip and iface.get("ip") != ip else "Address")
        for entry in arp_hits:
            self._push_device(reasons, entry["deviceId"], "ARP")
        for entry in access:
            self._push_device(reasons, entry["deviceId"], "Access port")
        for entry in mac_hits:
            self._push_device(reasons, entry["deviceId"], "MAC table")
        routes = self._matching_routes(ip)
        for route in routes:
            self._push_device(reasons, route["route"]["deviceId"], "Route")
        policies = self._matching_policies([ip])
        for policy in policies:
            self._push_device(reasons, policy["policy"]["deviceId"], "Policy")
        dns_names = [record["name"] for record in self.corpus["dns"] if record["type"] == "A" and record["value"] == ip]
        hits = self.search_lines(lambda line: any(contains_token(line, token) for token in [ip, *dns_names]))[:40]
        for hit in hits:
            self._push_device(reasons, hit["deviceId"], "Configuration")
        primary = []
        for entry in access:
            if entry["deviceId"] not in primary:
                primary.append(entry["deviceId"])
        for iface in owners:
            if iface.get("ip") == ip and iface["deviceId"] not in primary:
                primary.append(iface["deviceId"])
        scope = {
            "queryType": "ip",
            "primaryDeviceIds": primary,
            "ips": [ip],
            "macs": macs,
            "accessVlans": related,
            "vlanIds": related,
        }
        relevant: dict[str, dict] = {}
        for iface in [*owners, *described]:
            relevant[iface["id"]] = iface
        for entry in [*mac_hits, *arp_hits]:
            iface = self.find_interface(entry["deviceId"], entry["interface"])
            if iface:
                relevant[iface["id"]] = iface
        bundle = self._dns_bundle([ip], dns_names)
        name = dns_names[0] if dns_names else (netbox_record or {}).get("dnsName")
        access_label = (
            f"{self.hostname(access[0]['deviceId'])} {access[0]['interface']}"
            if access
            else f"{self.hostname(owners[0]['deviceId'])} {owners[0]['name']}"
            if owners
            else "Not learned on an access port"
        )
        subtitle_parts = [part for part in [name, f"VLAN {', '.join(str(vlan) for vlan in access_vlans)}" if access_vlans else None, access_label] if part]
        dossier = self._blank({"query": query, "queryType": "ip", "title": ip, "subtitle": " · ".join(subtitle_parts)})
        standby = next((iface for iface in owners if iface.get("standbyIp") == ip and iface.get("ip") != ip), None)
        configured = next((iface for iface in owners if iface.get("ip") == ip), None)
        if len(access) > 1:
            learned = {"label": "Multiple access ports", "tone": "attention"}
        elif len(access) == 1:
            learned = {"label": "Learned", "tone": "ok"}
        elif configured:
            learned = {"label": "Configured", "tone": "ok"}
        elif standby:
            learned = {"label": "HSRP", "tone": "neutral"}
        else:
            learned = {"label": "Not learned", "tone": "neutral"}
        dossier["badges"] = [learned]
        if netbox_record:
            dossier["badges"].append(
                {"label": f"NetBox {netbox_record['status']}", "tone": "ok" if netbox_record["status"] == "active" else "attention"}
            )
        if any(entry["conflict"] for entry in bundle["records"]):
            dossier["badges"].append({"label": "DNS mismatch", "tone": "attention"})
        if arp_hits:
            chain_mac = arp_hits[0]["mac"]
        elif configured:
            chain_mac = (self.device_of(configured["deviceId"]) or {}).get("mac")
        else:
            chain_mac = None
        dossier["chain"] = [{"id": "ip", "kind": "IP", "label": ip, "detail": name or "IPv4", "query": ip, "tone": "neutral"}]
        if chain_mac:
            dossier["chain"].append(
                {
                    "id": "mac",
                    "kind": "MAC",
                    "label": chain_mac,
                    "detail": f"ARP on {self.hostname(arp_hits[0]['deviceId'])}" if arp_hits else "Device MAC",
                    "query": chain_mac,
                    "tone": "ok",
                }
            )
        if access:
            dossier["chain"].append(
                {
                    "id": "port",
                    "kind": "Interface",
                    "label": access[0]["interface"],
                    "detail": self.hostname(access[0]["deviceId"]),
                    "query": self.hostname(access[0]["deviceId"]),
                    "tone": "attention" if len(access) > 1 else "ok",
                }
            )
        elif configured:
            dossier["chain"].append(
                {
                    "id": "port",
                    "kind": "Interface",
                    "label": configured["name"],
                    "detail": self.hostname(configured["deviceId"]),
                    "query": self.hostname(configured["deviceId"]),
                    "tone": "ok",
                }
            )
        vlan_id = access_vlans[0] if access_vlans else (owners[0].get("vlanId") if owners else None)
        if vlan_id:
            vlan_name = next((vlan["name"] for vlan in self.corpus["vlans"] if vlan["vlanId"] == vlan_id), "")
            dossier["chain"].append(
                {
                    "id": "vlan",
                    "kind": "VLAN",
                    "label": f"{vlan_id} {vlan_name}".strip(),
                    "detail": "Broadcast domain",
                    "query": f"vlan {vlan_id}",
                    "tone": "neutral",
                }
            )
        elsewhere = sum(1 for hit in hits if hit["deviceId"] not in primary)
        dossier["chain"].append(
            {
                "id": "evidence",
                "kind": "Elsewhere",
                "label": str(elsewhere),
                "detail": "Configuration references on other devices",
                "tone": "attention" if elsewhere else "ok",
            }
        )
        dossier["devices"] = self._device_rows(reasons)
        focus = access_vlans[0] if access_vlans else None
        dossier["interfaces"] = [
            {"hostname": self.hostname(iface["deviceId"]), "iface": iface, "note": self._interface_note(iface, focus if focus is not None else iface.get("vlanId"))}
            for iface in relevant.values()
        ]
        dossier["vlans"] = self._vlan_summary(related or access_vlans)
        dossier["arp"] = [{"hostname": self.hostname(entry["deviceId"]), "entry": entry} for entry in arp_hits]
        dossier["macs"] = self._mac_rows(mac_hits)
        dossier["routes"] = routes
        dossier["policies"] = policies
        dossier["configDevices"] = self._full_configs(primary or [entry["deviceId"] for entry in arp_hits])
        shown = {entry["device"]["id"] for entry in dossier["configDevices"]}
        dossier["configHits"] = [
            {**hit, "hostname": self.hostname(hit["deviceId"]), "elsewhere": hit["deviceId"] not in shown} for hit in hits
        ]
        dossier["netbox"] = self._netbox_for_ips([ip])
        prefix = None
        candidates = [
            entry
            for entry in self.corpus["netboxPrefixes"]
            if entry["prefix"] != "10.40.0.0/16" and prefix_contains(entry["prefix"], ip)
        ]
        if candidates:
            prefix = sorted(candidates, key=lambda entry: prefix_length(entry["prefix"]), reverse=True)[0]
            dossier["netbox"].append(self._prefix_card(prefix))
        endpoint = access[0] if access else None
        address_card = next((card for card in dossier["netbox"] if any(row["label"] == "Assigned to" for row in card["rows"])), None)
        if address_card and endpoint:
            assigned_at = next(index for index, row in enumerate(address_card["rows"]) if row["label"] == "Assigned to")
            address_card["rows"][assigned_at + 1 : assigned_at + 1] = [
                {"label": "Assigned device", "value": self.hostname(endpoint["deviceId"])},
                {"label": "Assigned interface", "value": endpoint["interface"]},
            ]
        dossier["dns"] = bundle["records"]
        dossier["lookups"] = bundle["lookups"]
        dossier["alarms"] = self._select_alarms(scope)
        dossier["changes"] = self._select_changes(scope)
        dossier["anomalies"] = self._select_anomalies(scope)
        if any(anomaly["severity"] in ("major", "warning") for anomaly in dossier["anomalies"]):
            dossier["badges"].append({"label": f"{len(dossier['anomalies'])} findings", "tone": "attention"})
        dossier["highlightTokens"] = [ip, *macs, *dns_names]
        return self._attach_sources(dossier)

    def dossier_for_mac(self, mac: str, query: str) -> dict:
        mac_hits = [entry for entry in self.corpus["macs"] if entry["mac"] == mac]
        arp_hits = [entry for entry in self.corpus["arp"] if entry["mac"] == mac]
        ips = unique([entry["ip"] for entry in arp_hits])
        if len(ips) == 1:
            dossier = self.dossier_for_ip(ips[0], query)
            dossier["query"] = query
            dossier["queryType"] = "mac"
            dossier["title"] = mac
            dossier["highlightTokens"] = [mac, *ips]
            dossier["chain"] = [
                {"id": "mac", "kind": "MAC", "label": mac, "detail": "Starting point", "query": mac, "tone": "neutral"},
                *[node for node in dossier["chain"] if node["kind"] != "MAC"],
            ]
            return dossier
        access = [entry for entry in mac_hits if self.mode_of(entry["deviceId"], entry["interface"]) == "access"]
        access_vlans = []
        for entry in self.corpus["macs"]:
            if entry["mac"] == mac and self.mode_of(entry["deviceId"], entry["interface"]) == "access" and entry["vlan"] not in access_vlans:
                access_vlans.append(entry["vlan"])
        reasons: dict[str, set[str]] = {}
        for entry in access:
            self._push_device(reasons, entry["deviceId"], "Access port")
        for entry in mac_hits:
            self._push_device(reasons, entry["deviceId"], "MAC table")
        scope = {
            "queryType": "mac",
            "primaryDeviceIds": [entry["deviceId"] for entry in access],
            "ips": ips,
            "macs": [mac],
            "accessVlans": access_vlans,
            "vlanIds": access_vlans,
        }
        subtitle = (
            " · ".join(f"{self.hostname(entry['deviceId'])} {entry['interface']}" for entry in access)
            if access
            else "Not learned on an access port"
        )
        dossier = self._blank({"query": query, "queryType": "mac", "title": mac, "subtitle": subtitle})
        dossier["badges"] = [
            {"label": "Multiple access ports" if len(access) > 1 else "MAC", "tone": "attention" if len(access) > 1 else "neutral"}
        ]
        dossier["chain"] = [
            {"id": "mac", "kind": "MAC", "label": mac, "detail": "No ARP binding in the slice", "tone": "attention"},
            *[
                {
                    "id": entry["interface"],
                    "kind": "Interface",
                    "label": entry["interface"],
                    "detail": self.hostname(entry["deviceId"]),
                    "query": self.hostname(entry["deviceId"]),
                    "tone": "attention",
                }
                for entry in access
            ],
        ]
        dossier["devices"] = self._device_rows(reasons)
        interfaces = []
        for entry in mac_hits:
            iface = self.find_interface(entry["deviceId"], entry["interface"])
            if iface:
                interfaces.append(
                    {"hostname": self.hostname(entry["deviceId"]), "iface": iface, "note": self._interface_note(iface, entry["vlan"])}
                )
        dossier["interfaces"] = interfaces
        dossier["vlans"] = self._vlan_summary(access_vlans)
        dossier["macs"] = self._mac_rows(mac_hits)
        dossier["arp"] = [{"hostname": self.hostname(entry["deviceId"]), "entry": entry} for entry in arp_hits]
        dossier["anomalies"] = self._select_anomalies(scope)
        dossier["alarms"] = self._select_alarms(scope)
        dossier["changes"] = self._select_changes(scope)
        dossier["configDevices"] = self._full_configs([entry["deviceId"] for entry in access])
        dossier["highlightTokens"] = [mac]
        return self._attach_sources(dossier)

    def dossier_for_vlan(self, vlan_id: int, query: str) -> dict:
        defs = [vlan for vlan in self.corpus["vlans"] if vlan["vlanId"] == vlan_id]
        names = unique([vlan["name"] for vlan in defs])
        related = [iface for iface in self.corpus["interfaces"] if self._interface_uses_vlan(iface, vlan_id)]
        reasons: dict[str, set[str]] = {}
        for vlan in defs:
            self._push_device(reasons, vlan["deviceId"], "Address")
        arp_hits = [entry for entry in self.corpus["arp"] if entry["interface"] == f"Vlan{vlan_id}"]
        for entry in arp_hits:
            self._push_device(reasons, entry["deviceId"], "ARP")
        mac_hits = [entry for entry in self.corpus["macs"] if entry["vlan"] == vlan_id]
        for entry in mac_hits:
            self._push_device(
                reasons,
                entry["deviceId"],
                "Access port" if self.mode_of(entry["deviceId"], entry["interface"]) == "access" else "MAC table",
            )
        prefixes = [prefix for prefix in self.corpus["netboxPrefixes"] if prefix.get("vlanId") == vlan_id]
        routes = []
        for route in self.corpus["routes"]:
            exact_prefix = any(prefix["prefix"] == route["prefix"] for prefix in prefixes)
            svi = any(
                iface["deviceId"] == route["deviceId"] and iface["name"] == route.get("interface") and iface["mode"] == "svi"
                for iface in related
            )
            if exact_prefix or svi:
                routes.append(
                    {
                        "hostname": self.hostname(route["deviceId"]),
                        "route": route,
                        "longest": exact_prefix or route["protocol"] == "connected",
                    }
                )
        for route in routes:
            self._push_device(reasons, route["route"]["deviceId"], "Route")
        hits = self.search_lines(lambda line: self._line_mentions_vlan(line, vlan_id))[:50]
        for hit in hits:
            self._push_device(reasons, hit["deviceId"], "Configuration")
        ips = unique([entry["ip"] for entry in arp_hits])
        scope = {
            "queryType": "vlan",
            "primaryDeviceIds": [vlan["deviceId"] for vlan in defs],
            "ips": ips,
            "macs": unique([entry["mac"] for entry in mac_hits]),
            "accessVlans": [vlan_id],
            "vlanIds": [vlan_id],
        }
        site_names = unique([name for name in ( (self.device_of(vlan["deviceId"]) or {}).get("siteName") for vlan in defs) if name])
        if len(names) > 1:
            subtitle = f"Names differ across the slice: {' and '.join(names)}"
        else:
            subtitle = f"{names[0] if names else 'Undefined in the slice'} · {', '.join(site_names) or 'No device defines it'}"
        dossier = self._blank({"query": query, "queryType": "vlan", "title": f"VLAN {vlan_id}", "subtitle": subtitle})
        dossier["badges"] = [
            {"label": f"{len(defs)} devices", "tone": "neutral"},
            {"label": f"{sum(1 for iface in related if iface['mode'] == 'access')} access ports", "tone": "info"},
        ]
        if len(names) > 1:
            dossier["badges"].append({"label": "ID reused", "tone": "attention"})
        native = [iface for iface in related if iface.get("nativeVlan") == vlan_id]
        dossier["chain"] = [
            {"id": "vlan", "kind": "VLAN", "label": str(vlan_id), "detail": " / ".join(names) or "Not defined", "query": f"vlan {vlan_id}", "tone": "neutral"},
            {"id": "svi", "kind": "SVIs", "label": str(sum(1 for iface in related if iface["mode"] == "svi")), "detail": "Gateways", "tone": "ok"},
            {"id": "access", "kind": "Access", "label": str(sum(1 for iface in related if iface["mode"] == "access")), "detail": "Edge ports", "tone": "neutral"},
            {
                "id": "native",
                "kind": "Native",
                "label": str(len(native)),
                "detail": ", ".join(f"{self.hostname(iface['deviceId'])} {iface['name']}" for iface in native[:2]) if native else "Not used as native",
                "tone": "attention" if native else "ok",
            },
        ]
        dossier["devices"] = self._device_rows(reasons)
        dossier["interfaces"] = [
            {"hostname": self.hostname(iface["deviceId"]), "iface": iface, "note": self._interface_note(iface, vlan_id)} for iface in related
        ]
        dossier["vlans"] = self._vlan_summary([vlan_id])
        dossier["arp"] = [{"hostname": self.hostname(entry["deviceId"]), "entry": entry} for entry in arp_hits]
        dossier["macs"] = self._mac_rows(mac_hits)
        dossier["routes"] = routes
        dossier["policies"] = self._matching_policies(ips)
        dossier["configHits"] = [{**hit, "hostname": self.hostname(hit["deviceId"]), "elsewhere": False} for hit in hits]
        dossier["netbox"] = [self._prefix_card(prefix, str(vlan_id)) for prefix in prefixes]
        dossier["netbox"].extend(self._netbox_for_ips(ips)[:6])
        bundle = self._dns_bundle(ips)
        dossier["dns"] = bundle["records"]
        dossier["lookups"] = bundle["lookups"]
        dossier["alarms"] = self._select_alarms(scope)
        dossier["changes"] = self._select_changes(scope)
        dossier["anomalies"] = self._select_anomalies(scope)
        if dossier["anomalies"]:
            dossier["badges"].append({"label": f"{len(dossier['anomalies'])} findings", "tone": "attention"})
        dossier["highlightTokens"] = [f"vlan {vlan_id}", f"Vlan{vlan_id}", str(vlan_id)]
        return self._attach_sources(dossier)

    def dossier_for_prefix(self, prefix: str, query: str) -> dict:
        wanted = prefix_length(prefix)
        head = prefix.split("/")[0]
        routes = []
        for route in self.corpus["routes"]:
            first = (
                route["prefix"] == prefix
                or (
                    prefix_contains(route["prefix"], head)
                    and prefix_length(route["prefix"]) <= wanted
                    and route["prefix"] != "0.0.0.0/0"
                )
                or (prefix_contains(prefix, route["prefix"].split("/")[0]) and prefix_length(route["prefix"]) >= wanted)
            )
            if not first:
                continue
            if route["prefix"] == prefix:
                routes.append(route)
                continue
            if route["prefix"] == "0.0.0.0/0":
                continue
            route_len = prefix_length(route["prefix"])
            if route_len >= wanted and prefix_contains(prefix, route["prefix"].split("/")[0]):
                routes.append(route)
            elif route_len < wanted and prefix_contains(route["prefix"], head):
                routes.append(route)
        exact = [route for route in routes if route["prefix"] == prefix]
        best = wanted if exact else max((prefix_length(route["prefix"]) for route in routes), default=-1)
        route_rows = [
            {"hostname": self.hostname(route["deviceId"]), "route": route, "longest": prefix_length(route["prefix"]) == best}
            for route in routes
        ]
        route_rows.sort(key=lambda row: (-prefix_length(row["route"]["prefix"]), row["hostname"]))
        reasons: dict[str, set[str]] = {}
        for route in route_rows:
            self._push_device(reasons, route["route"]["deviceId"], "Route")
        netbox_prefix = next((entry for entry in self.corpus["netboxPrefixes"] if entry["prefix"] == prefix), None)
        arp_hits = [entry for entry in self.corpus["arp"] if prefix_contains(prefix, entry["ip"])]
        for entry in arp_hits:
            self._push_device(reasons, entry["deviceId"], "ARP")
        ips = unique([entry["ip"] for entry in arp_hits])
        vlan_ids = [netbox_prefix["vlanId"]] if netbox_prefix and netbox_prefix.get("vlanId") else []
        scope = {
            "queryType": "prefix",
            "primaryDeviceIds": [route["route"]["deviceId"] for route in route_rows],
            "ips": ips,
            "macs": unique([entry["mac"] for entry in arp_hits]),
            "accessVlans": vlan_ids,
            "vlanIds": vlan_ids,
        }
        dossier = self._blank(
            {
                "query": query,
                "queryType": "prefix",
                "title": prefix,
                "subtitle": f"{netbox_prefix['description']} · {netbox_prefix['site']}" if netbox_prefix else "No NetBox prefix record",
            }
        )
        dossier["badges"] = [
            {"label": "Exact routes" if exact else "Covering routes", "tone": "ok" if exact else "neutral"},
            {"label": f"{len(arp_hits)} ARP entries inside", "tone": "info"},
        ]
        dossier["chain"] = [
            {"id": "prefix", "kind": "Prefix", "label": prefix, "detail": (netbox_prefix or {}).get("description") or "Routing lookup", "tone": "neutral"},
            {
                "id": "routes",
                "kind": "Routes",
                "label": str(len(route_rows)),
                "detail": f"{len(exact)} exact" if exact else "No exact match",
                "tone": "ok" if exact else "attention",
            },
        ]
        if netbox_prefix and netbox_prefix.get("vlanId"):
            dossier["chain"].append(
                {
                    "id": "vlan",
                    "kind": "VLAN",
                    "label": str(netbox_prefix["vlanId"]),
                    "detail": netbox_prefix["description"],
                    "query": f"vlan {netbox_prefix['vlanId']}",
                    "tone": "neutral",
                }
            )
        dossier["devices"] = self._device_rows(reasons)
        dossier["routes"] = route_rows
        dossier["arp"] = [{"hostname": self.hostname(entry["deviceId"]), "entry": entry} for entry in arp_hits]
        dossier["macs"] = self._mac_rows(
            [
                entry
                for entry in self.corpus["macs"]
                if any(arp["mac"] == entry["mac"] for arp in arp_hits) and self.mode_of(entry["deviceId"], entry["interface"]) == "access"
            ]
        )
        dossier["vlans"] = self._vlan_summary(vlan_ids)
        dossier["policies"] = self._matching_policies(ips or [head], [], 8)
        dossier["netbox"] = [self._prefix_card(netbox_prefix)] if netbox_prefix else []
        bundle = self._dns_bundle(ips)
        dossier["dns"] = bundle["records"]
        dossier["lookups"] = bundle["lookups"]
        dossier["alarms"] = self._select_alarms(scope)
        dossier["changes"] = self._select_changes(scope)
        dossier["anomalies"] = self._select_anomalies(scope)
        hits = self.search_lines(lambda line: contains_token(line, prefix) or contains_token(line, head))[:20]
        dossier["configHits"] = [{**hit, "hostname": self.hostname(hit["deviceId"]), "elsewhere": True} for hit in hits]
        dossier["highlightTokens"] = [prefix]
        return self._attach_sources(dossier)

    def config_search(self, query: str) -> dict:
        needle = query.lower()
        hits = self.search_lines(lambda line: needle in line.lower())
        grouped: dict[str, list[dict]] = {}
        for hit in hits:
            bucket = grouped.setdefault(hit["deviceId"], [])
            if len(bucket) < 6:
                bucket.append({"line": hit["line"], "text": hit["text"]})
        groups = []
        for device_id, group_hits in grouped.items():
            device = self.devices.get(device_id)
            if device:
                groups.append({"device": device, "hits": group_hits})
        groups.sort(key=lambda group: (-len(group["hits"]), group["device"]["hostname"]))
        groups = groups[:40]
        shown = sum(len(group["hits"]) for group in groups)
        return {"kind": "config-search", "query": query, "total": len(hits), "truncated": len(hits) > shown, "groups": groups}

    def investigate(self, raw: str, force_config: bool = False) -> dict:
        query = raw.strip()
        if not query:
            return {"kind": "empty"}
        parsed = self.parse_query(query)
        if not force_config and parsed["kind"] == "mac":
            dossier = self.dossier_for_mac(parsed["mac"], query)
            return {"kind": "dossier", "dossier": dossier, "summary": summarize(dossier)}
        if not force_config and parsed["kind"] == "ip":
            dossier = self.dossier_for_ip(parsed["ip"], query)
            return {"kind": "dossier", "dossier": dossier, "summary": summarize(dossier)}
        if not force_config and parsed["kind"] == "prefix":
            dossier = self.dossier_for_prefix(parsed["prefix"], query)
            return {"kind": "dossier", "dossier": dossier, "summary": summarize(dossier)}
        if not force_config and parsed["kind"] == "vlan":
            dossier = self.dossier_for_vlan(parsed["vlanId"], query)
            return {"kind": "dossier", "dossier": dossier, "summary": summarize(dossier)}
        if len(query) < 2:
            return {"kind": "short", "query": query}
        if not force_config:
            devices = self.match_devices(query)
            if len(devices) == 1:
                dossier = self.dossier_for_device(devices[0], query)
                return {"kind": "dossier", "dossier": dossier, "summary": summarize(dossier)}
            if len(devices) > 1:
                count = len(self.search_lines(lambda line: query.lower() in line.lower()))
                return {"kind": "choose-device", "query": query, "devices": devices, "configHits": count}
        return self.config_search(query)

    def suggest(self, raw: str) -> list[dict]:
        needle = raw.strip().lower()
        if not needle:
            return []
        suggestions = []
        devices = sorted(
            self.corpus["devices"],
            key=lambda device: (0 if device["hostname"].lower().startswith(needle) else 1, device["hostname"]),
        )
        for device in devices:
            if needle not in device["hostname"].lower():
                continue
            suggestions.append(
                {
                    "label": device["hostname"],
                    "detail": f"{device['platform']} · {device['mgmtIp']} · {device['siteName']}",
                    "query": device["hostname"],
                    "type": "Device",
                }
            )
        ips: list[str] = []
        for entry in self.corpus["arp"]:
            if entry["ip"] not in ips:
                ips.append(entry["ip"])
        for iface in self.corpus["interfaces"]:
            for key in ("ip", "standbyIp"):
                if iface.get(key) and iface[key] not in ips:
                    ips.append(iface[key])
        for record in self.corpus["netboxIps"]:
            ip = record["address"].split("/")[0]
            if ip not in ips:
                ips.append(ip)
        for ip in sorted(ips):
            name = next((record["name"] for record in self.corpus["dns"] if record["type"] == "A" and record["value"] == ip), None)
            if needle not in f"{ip} {name or ''}".lower():
                continue
            suggestions.append({"label": ip, "detail": name or "IP in the slice", "query": ip, "type": "IP"})
        seen_macs = []
        for entry in self.corpus["macs"]:
            if entry["mac"] in seen_macs:
                continue
            seen_macs.append(entry["mac"])
        compact = needle.replace(":", "").replace(".", "").replace("-", "")
        for mac in seen_macs:
            if needle not in mac and compact not in mac.replace(":", ""):
                continue
            suggestions.append({"label": mac, "detail": "MAC table", "query": mac, "type": "MAC"})
        vlan_ids = sorted({vlan["vlanId"] for vlan in self.corpus["vlans"]})
        for vlan_id in vlan_ids:
            names = unique([vlan["name"] for vlan in self.corpus["vlans"] if vlan["vlanId"] == vlan_id])
            label = f"VLAN {vlan_id}"
            if needle not in f"{label} {' '.join(names)}".lower() and not str(vlan_id).startswith(needle):
                continue
            suggestions.append({"label": label, "detail": " / ".join(names), "query": f"vlan {vlan_id}", "type": "VLAN"})
        deduped = []
        seen = set()
        for suggestion in suggestions:
            if suggestion["query"] in seen:
                continue
            seen.add(suggestion["query"])
            deduped.append(suggestion)
        return deduped[:8]

    def slice_stats(self) -> dict:
        ips = set()
        for entry in self.corpus["arp"]:
            ips.add(entry["ip"])
        for iface in self.corpus["interfaces"]:
            if iface.get("ip"):
                ips.add(iface["ip"])
            if iface.get("standbyIp"):
                ips.add(iface["standbyIp"])
        for record in self.corpus["netboxIps"]:
            ips.add(record["address"].split("/")[0])
        return {
            "devices": len(self.corpus["devices"]),
            "configRecords": sum(len(doc["lines"]) for doc in self.corpus["configs"]),
            "arp": len(self.corpus["arp"]),
            "mac": len(self.corpus["macs"]),
            "correlatedIps": len(ips),
            "correlatedMacs": len({entry["mac"] for entry in self.corpus["macs"]}),
            "routes": len(self.corpus["routes"]),
            "policies": len(self.corpus["policies"]),
        }

    def vlan_matrix(self) -> list[dict]:
        ids = sorted({vlan["vlanId"] for vlan in self.corpus["vlans"]})
        rows = []
        for vlan_id in ids:
            defs = [vlan for vlan in self.corpus["vlans"] if vlan["vlanId"] == vlan_id]
            related = [iface for iface in self.corpus["interfaces"] if self._interface_uses_vlan(iface, vlan_id)]
            matched = [anomaly for anomaly in self.anomalies if vlan_id in anomaly["vlanIds"]]
            sites = unique([name for name in ((self.device_of(vlan["deviceId"]) or {}).get("siteName") for vlan in defs) if name])
            rows.append(
                {
                    "vlanId": vlan_id,
                    "names": unique([vlan["name"] for vlan in defs]),
                    "sites": sites,
                    "devices": [self.hostname(vlan["deviceId"]) for vlan in defs],
                    "accessCount": sum(1 for iface in related if iface["mode"] == "access"),
                    "trunkCount": sum(1 for iface in related if iface["mode"] == "trunk"),
                    "nativeCount": sum(1 for iface in related if iface.get("nativeVlan") == vlan_id),
                    "sviCount": sum(1 for iface in related if iface["mode"] == "svi"),
                    "sviDown": sum(1 for iface in related if iface["mode"] == "svi" and iface.get("adminStatus") == "down"),
                    "anomalyCount": len(matched),
                    "anomalyTitles": [anomaly["title"] for anomaly in matched],
                }
            )
        return rows

    def notable_anomalies(self) -> list[dict]:
        rank = {"critical": 0, "major": 1, "warning": 2, "minor": 3, "info": 4}
        return sorted(self.anomalies, key=lambda anomaly: (rank.get(anomaly["severity"], 9), anomaly["title"]))


def _about_host(anomaly: dict, dossier: dict) -> bool:
    if dossier["queryType"] in ("vlan", "prefix", "device"):
        return True
    ips = {dossier["query"], *[row["entry"]["ip"] for row in dossier["arp"]]}
    macs = {row["entry"]["mac"] for row in dossier["macs"]}
    return any(ip in ips for ip in anomaly["ips"]) or any(mac in macs for mac in anomaly["macs"])


def summarize(dossier: dict) -> dict:
    def identity() -> str:
        if dossier["queryType"] == "device":
            device = next((row["device"] for row in dossier["devices"] if row["device"]["hostname"] == dossier["title"]), None)
            device = device or (dossier["devices"][0]["device"] if dossier["devices"] else None)
            if not device:
                return f"{dossier['query']} did not resolve to a device in the loaded slice."
            down = sum(1 for row in dossier["interfaces"] if row["iface"].get("adminStatus") == "down")
            arp_count = sum(1 for row in dossier["arp"] if row["entry"]["deviceId"] == device["id"])
            text = (
                f"{device['hostname']} is a {device['vendor']} {device['platform']} running {device['os']} {device['osVersion']} "
                f"at {device['siteName']}, rack {device['rack']}. Management address {device['mgmtIp']}. "
                f"The indexed backup was taken {format_regina(device['lastBackup'])}. This device has {len(dossier['interfaces'])} interfaces, "
                f"{len(dossier['vlans'])} VLANs, {arp_count} ARP entries, and {len(dossier['routes'])} routes in the index."
            )
            if down:
                text = f"{text} {down} interfaces are administratively down."
            return text
        if dossier["queryType"] == "ip" or (dossier["queryType"] == "mac" and dossier["arp"]):
            ip = dossier["query"] if dossier["queryType"] == "ip" else dossier["arp"][0]["entry"]["ip"]
            name = next((entry["record"]["name"] for entry in dossier["dns"] if entry["record"]["type"] == "A" and entry["record"]["value"] == ip), None)
            access = [row for row in dossier["macs"] if row["mode"] == "access"]
            configured = next((row for row in dossier["interfaces"] if row["iface"].get("ip") == ip), None)
            standby = next((row for row in dossier["interfaces"] if row["iface"].get("standbyIp") == ip and row["iface"].get("ip") != ip), None)
            named = f"{ip} ({name})" if name else ip
            if standby and not configured and not access:
                peers = unique([row["hostname"] for row in dossier["interfaces"] if row["iface"].get("standbyIp") == ip])
                return f"{ip} is the HSRP address for {standby['iface']['name']} on {english_list(peers)}, not a host."
            if len(access) == 1:
                port = access[0]
                clause = f" It is also configured on {configured['hostname']} {configured['iface']['name']}." if configured else ""
                description = f" ({port['description']})" if port["description"] else ""
                return f"{named} is learned on {port['hostname']} {port['entry']['interface']} in VLAN {port['entry']['vlan']}{description}.{clause}"
            if len(access) > 1:
                places = english_list([f"{port['hostname']} {port['entry']['interface']}" for port in access])
                return f"{named} is learned on {len(access)} access ports in VLAN {access[0]['entry']['vlan']}: {places}."
            if configured:
                return f"{named} is configured on {configured['hostname']} {configured['iface']['name']}."
            if not dossier["arp"] and not dossier["netbox"] and not dossier["configHits"] and not dossier["routes"]:
                return f"Nothing in the loaded slice references {ip}."
            return f"{named} is not learned in ARP."
        if dossier["queryType"] == "mac":
            access = [row for row in dossier["macs"] if row["mode"] == "access"]
            if not access:
                return f"{dossier['query']} is not learned on an access port in the slice."
            return f"{dossier['query']} is dynamic on {english_list([f'{port['hostname']} {port['entry']['interface']}' for port in access])}."
        if dossier["queryType"] == "vlan":
            vlan = dossier["vlans"][0] if dossier["vlans"] else None
            if not vlan:
                return f"{dossier['title']} is not defined on a device in the loaded slice."
            names = unique([entry["name"] for entry in dossier["vlans"]])
            sites = unique([row["device"]["siteName"] for row in dossier["devices"]])
            reuse = f" The VLAN ID is reused: {english_list(names)}. Treat those as separate broadcast domains." if len(names) > 1 else ""
            name = names[0] if len(names) == 1 else ""
            across = f" across {english_list(sites)}" if sites else ""
            return (
                f"VLAN {vlan['vlanId']} {name} is defined on {len(vlan['devices'])} devices{across}. "
                f"{vlan['accessCount']} access ports, {vlan['sviCount']} SVIs, {vlan['trunkCount']} trunks allow it, "
                f"and {vlan['nativeCount']} trunks use it as the native VLAN.{reuse}"
            )
        exact = [row for row in dossier["routes"] if row["route"]["prefix"] == dossier["query"]]
        longest = [row for row in dossier["routes"] if row["longest"]]
        if not exact and not longest:
            return f"{dossier['query']} is not present in an indexed routing table."
        sample = (exact or longest)[:4]
        presence = "has no NetBox prefix" if dossier["subtitle"] == "No NetBox prefix record" else f"is {dossier['subtitle']}"
        return f"{dossier['query']} {presence}. Indexed routes include {english_list([f"{row['route']['protocol']} on {row['hostname']}" for row in sample])}."

    def path_paragraph() -> str | None:
        if dossier["queryType"] not in ("ip", "mac"):
            return None
        ip = dossier["query"] if dossier["queryType"] == "ip" else (dossier["arp"][0]["entry"]["ip"] if dossier["arp"] else None)
        mac = dossier["arp"][0]["entry"]["mac"] if dossier["arp"] else (dossier["query"] if dossier["queryType"] == "mac" else None)
        if not mac:
            return None
        arp_hosts = unique([row["hostname"] for row in dossier["arp"]])
        access = [row for row in dossier["macs"] if row["mode"] == "access"]
        trunks = [row for row in dossier["macs"] if row["mode"] == "trunk"]
        sentences = [
            f"ARP on {english_list(arp_hosts)} binds {ip or 'this host'} to {mac} ({oui_vendor(mac)})."
            if arp_hosts
            else f"{mac} has no ARP binding in the slice."
        ]
        if len(access) == 1:
            sentences.append(f"The MAC table has it on one access port, {access[0]['hostname']} {access[0]['entry']['interface']}.")
        elif len(access) > 1:
            sentences.append("The MAC table has it on more than one access port, so this is not a single stable edge.")
        if trunks and len(access) == 1:
            noun = "port" if len(trunks) == 1 else "ports"
            sentences.append(
                f"It is also on {len(trunks)} trunk {noun} toward the gateway. That is the expected path, not a second access location."
            )
        return " ".join(sentences)

    def source_paragraph() -> str:
        sentences = []
        address = next((card for card in dossier["netbox"] if any(row["label"] == "Assigned to" for row in card["rows"])), None)
        if address:
            def row_value(label: str) -> str | None:
                return next((row["value"] for row in address["rows"] if row["label"] == label), None)
            sentences.append(
                f"NetBox lists {address['title']} as {row_value('Status')}, assigned to {row_value('Assigned to')}, "
                f"in {row_value('Prefix')}, VRF {row_value('VRF')}. {row_value('Description')}"
            )
        elif dossier["queryType"] == "device" and dossier["netbox"]:
            role = next((row["value"] for row in dossier["netbox"][0]["rows"] if row["label"] == "Role"), None)
            site = next((row["value"] for row in dossier["netbox"][0]["rows"] if row["label"] == "Site"), None)
            sentences.append(f"NetBox has the device as {role} at {site}.")
        else:
            sentences.append("NetBox has no object for this query.")
        forward = next((entry for entry in dossier["dns"] if entry["record"]["type"] == "A"), None)
        reverse = next((entry for entry in dossier["dns"] if entry["record"]["type"] == "PTR"), None)
        reverse_lookup = next((lookup for lookup in dossier["lookups"] if lookup["direction"] == "reverse"), None)
        if reverse_lookup and forward and reverse:
            if forward["record"]["name"] == reverse["record"]["value"]:
                sentences.append(
                    f"A reverse DNS lookup of {reverse_lookup['query']} returns {reverse_lookup['answer']}. The CPNR A and PTR agree on that name."
                )
            else:
                sentences.append(
                    f"A reverse DNS lookup of {reverse_lookup['query']} returns {reverse_lookup['answer']}. The CPNR A record is {forward['record']['name']}."
                )
        elif forward:
            sentences.append(f"CPNR has an A record for {forward['record']['name']}. A forward lookup returns {forward['record']['value']}.")
        elif not dossier["dns"] and not dossier["lookups"]:
            sentences.append("No DNS record found. No CPNR record found.")
        if dossier["policies"]:
            names = unique([f"{row['policy']['name']} on {row['hostname']}" for row in dossier["policies"]])[:3]
            sentences.append(
                f"Policy {english_list(names)} references this investigation. SWAN does not have a flow record, so a policy hit is a configuration reference, not proof that a session traversed that device."
            )
        longest = [row for row in dossier["routes"] if row["longest"]]
        wider = [row for row in dossier["routes"] if not row["longest"] and row["route"]["prefix"] != "0.0.0.0/0"]
        if longest and dossier["queryType"] != "device":
            prefixes = unique([row["route"]["prefix"] for row in longest])
            hops = unique([f"{row['route']['protocol']} via {row['route']['nextHop']} on {row['hostname']}" for row in longest])[:4]
            sentences.append(f"The longest routing match is {english_list(prefixes)}: {english_list(hops)}.")
        if wider and dossier["queryType"] != "device":
            covers = unique([f"{row['route']['prefix']} on {row['hostname']}" for row in wider])[:3]
            sentences.append(f"Wider covering routes are also indexed: {english_list(covers)}.")
        if dossier["changes"]:
            recent = sorted(dossier["changes"], key=lambda row: row["change"]["time"], reverse=True)[0]
            sentences.append(
                f"The newest related Network Automation change is “{recent['change']['summary']}” by {recent['change']['user']} "
                f"at {format_regina(recent['change']['time'])} on {recent['hostname']}."
            )
        else:
            sentences.append("Network Automation has no related change in this slice.")
        if not dossier["alarms"]:
            sentences.append("NNMi has no open alarm tied directly to this investigation.")
        elsewhere = [hit for hit in dossier["configHits"] if hit.get("elsewhere")]
        if elsewhere:
            hosts = unique([hit["hostname"] for hit in elsewhere])[:4]
            sentences.append(f"Indexed configuration on {english_list(hosts)} also mentions it.")
        return " ".join(sentences)

    host = [anomaly for anomaly in dossier["anomalies"] if _about_host(anomaly, dossier)]
    context = [anomaly for anomaly in dossier["anomalies"] if not _about_host(anomaly, dossier)]
    paragraphs = [identity()]
    path = path_paragraph()
    if path:
        paragraphs.append(path)
    paragraphs.append(source_paragraph())
    if context and dossier["queryType"] in ("ip", "mac"):
        paragraphs.append("Separately, the VLAN around this address has other evidence. " + " ".join(anomaly["detail"] for anomaly in context))
    leading = [{"severity": anomaly["severity"], "text": f"{anomaly['title']}. {anomaly['detail']}"} for anomaly in [*host, *context]]
    for alarm in dossier["alarms"]:
        explained = False
        for anomaly in dossier["anomalies"]:
            if anomaly["code"] == "mac-on-multiple-access-ports" and any(mac in anomaly["macs"] for mac in alarm.get("macs") or []):
                explained = True
            if anomaly["code"] == "native-vlan-mismatch" and re.search(r"native vlan", alarm["summary"], re.I):
                explained = True
            if anomaly["code"] == "svi-asymmetric" and any(vlan in anomaly["vlanIds"] for vlan in alarm.get("vlanIds") or []) and re.search(r"SVI", alarm["summary"], re.I):
                explained = True
        if explained:
            continue
        interface = f" {alarm['interface']}" if alarm.get("interface") else ""
        leading.append({"severity": alarm["severity"], "text": f"NNMi {alarm['severity']} on {alarm['node']}{interface}: {alarm['summary']}"})
    healthy = []
    access = [row for row in dossier["macs"] if row["mode"] == "access"]
    host_trouble = any(
        _about_host(anomaly, dossier)
        and anomaly["code"] in ("mac-on-multiple-access-ports", "dns-mismatch", "policy-without-arp", "netbox-arp-gap")
        for anomaly in dossier["anomalies"]
    )
    if len(access) == 1 and not host_trouble:
        healthy.append(f"The MAC is stable on one access port: {access[0]['hostname']} {access[0]['entry']['interface']}.")
    forward = next((entry for entry in dossier["dns"] if entry["record"]["type"] == "A"), None)
    reverse = next((entry for entry in dossier["dns"] if entry["record"]["type"] == "PTR"), None)
    if forward and reverse and forward["record"]["name"] == reverse["record"]["value"]:
        healthy.append("Forward and reverse DNS agree.")
    address = next((card for card in dossier["netbox"] if any(row["label"] == "Status" for row in card["rows"])), None)
    status = next((row["value"] for row in address["rows"] if row["label"] == "Status"), None) if address else None
    if status == "active" and dossier["arp"] and not any(anomaly["code"] == "netbox-arp-gap" for anomaly in dossier["anomalies"]):
        healthy.append("NetBox status is active and ARP has learned the address.")
    if not dossier["alarms"] and dossier["queryType"] == "device":
        healthy.append("NNMi has no open alarm on this device.")
    checks = []
    for anomaly in dossier["anomalies"]:
        if anomaly["code"] == "native-vlan-mismatch":
            checks.append("Compare the intended native VLAN with the peer before changing it back. The indexed diff is in the Network Automation section.")
        if anomaly["code"] == "allowed-vlan-mismatch":
            checks.append("Check whether the missing allowed VLANs were pruned on purpose. Hosts in a pruned VLAN will not cross that trunk.")
        if anomaly["code"] == "mac-on-multiple-access-ports":
            checks.append("Confirm which access port should own the MAC. Until one side ages out, treat it as a move or a loop.")
        if anomaly["code"] == "dns-mismatch":
            checks.append("Align the CPNR A record and PTR before putting the name in a ticket. The address itself is learned.")
        if anomaly["code"] in ("policy-without-arp", "netbox-arp-gap"):
            checks.append("If the address is supposed to be live, find the access port and confirm the VLAN SVI. If it is still reserved, leave the pre-staged policy until the host exists.")
        if anomaly["code"] == "svi-asymmetric":
            checks.append("Decide whether the shut SVI is still in maintenance. The peer that is still up is the one hosts can use.")
    if any(re.search(r"CRC", alarm["summary"], re.I) for alarm in dossier["alarms"]):
        checks.append("Check the carrier handoff error counters and the optics before treating this as an internal VLAN problem.")
    if any(re.search(r"Link down", alarm["summary"], re.I) for alarm in dossier["alarms"]):
        checks.append("The down link is an interface state, separate from addresses learned on other ports.")
    if not checks and dossier["arp"] and not dossier["anomalies"]:
        checks.append("The edge port, ARP, and source of truth agree. If the symptom remains, look at the service behind the address rather than the switch port.")
    checks = unique(checks)[:4]
    lines = [
        f"Investigation: {dossier['queryType']} {dossier['query']}",
        f"Resolved: {dossier['title']}",
        dossier["subtitle"],
        "",
        "Chain:",
        *[f"{index}. {node['kind']}: {node['label']} — {node['detail']}" for index, node in enumerate(dossier["chain"], start=1)],
        "",
        "Sources:",
        *[
            f"- {'Live' if source['tier'] == 'live' else 'Indexed'} {source['label']} ({source['system']}): {source['detail']}"
            for source in dossier["sources"]
        ],
    ]
    if dossier["anomalies"]:
        lines.append("")
        lines.append("Findings:")
        lines.extend(f"- [{anomaly['severity']}] {anomaly['title']}: {anomaly['detail']}" for anomaly in dossier["anomalies"])
    if dossier["alarms"]:
        lines.append("")
        lines.append("NNMi:")
        for alarm in dossier["alarms"]:
            interface = f" {alarm['interface']}" if alarm.get("interface") else ""
            lines.append(f"- [{alarm['severity']}] {alarm['node']}{interface}: {alarm['summary']} ({format_regina(alarm['time'])})")
    if dossier["changes"]:
        lines.append("")
        lines.append("Network Automation:")
        for change in dossier["changes"]:
            lines.append(
                f"- {change['hostname']}: {change['change']['summary']} by {change['change']['user']} at {format_regina(change['change']['time'])}"
            )
    lines.extend(["", "SWAN gathered this evidence before asking for an interpretation."])
    headline_base = identity().split(". ")[0]
    major = next((anomaly for anomaly in host if anomaly["severity"] in ("major", "critical")), None)
    headline = headline_base if headline_base.endswith(".") else f"{headline_base}."
    if major and major["code"] == "mac-on-multiple-access-ports":
        headline = f"{headline[:-1] if headline.endswith('.') else headline}. The MAC is learned on more than one access port."
    elif major and dossier["queryType"] in ("vlan", "device") and major["code"] == "native-vlan-mismatch":
        headline = f"{headline[:-1] if headline.endswith('.') else headline}. A trunk in this investigation does not agree on the native VLAN."
    return {"headline": headline, "paragraphs": paragraphs, "leading": leading, "healthy": healthy, "checks": checks, "packet": "\n".join(lines)}



def self_test() -> None:
    assert ENGINE is not None
    commands = load_commands()
    assert len(commands) == 13
    assert "show ip arp" in commands
    assert "show running-config" not in commands
    blocked = run_allowlisted_command("C9300-REGN10-4C-MGT-1", "show running-config", commands)
    assert blocked["sent"] is False
    warning = run_allowlisted_command("C9300-REGN10-4C-MGT-1", "show ip arp", commands)
    assert warning["sent"] is False and "Backend configuration warning" in warning["warning"]
    assert "did not send" in warning["warning"]
    dns = ai_server.dns_lookup("10.255.255.1")
    assert dns["detail"] == "No DNS record found"
    cpnr = ai_server.cpnr_lookup("10.99.1.5")
    assert "CPNR_URL" in cpnr["warning"]
    assert cpnr["detail"] == "No CPNR record found"
    netbox = ai_server.netbox_lookup("10.40.24.46")
    assert "NETBOX_URL" in netbox["warning"] and netbox["sent"] is False

    def dossier(query: str) -> dict:
        result = ENGINE.investigate(query)
        assert result["kind"] == "dossier", query
        return result["dossier"]

    device = dossier("C9300-REGN10-4C-MGT-1")
    assert device["title"] == "C9300-REGN10-4C-MGT-1"
    assert device["devices"][0]["device"]["mgmtIp"] == "10.40.8.14"
    assert len(device["interfaces"]) > 5
    assert any(vlan["vlanId"] == 10 for vlan in device["vlans"])
    assert any(hit["elsewhere"] and "10.40.8.14" in hit["text"] for hit in device["configHits"])
    assert any("SNMP" in change["change"]["summary"] for change in device["changes"])
    badge = dossier("10.40.24.46")
    assert badge["arp"][0]["entry"]["mac"] == "02:40:24:12:44:8a"
    assert any(row["hostname"] == "C9500-REGN10-4C-DIST-1" for row in badge["arp"])
    access = next(row for row in badge["macs"] if row["mode"] == "access")
    assert access["hostname"] == "C9300-REGN10-4C-ACC-2"
    assert access["entry"]["interface"] == "GigabitEthernet1/0/18"
    assert access["entry"]["vlan"] == 240
    assert any(any(row["value"] == "badge-reader-4c-e12" for row in card["rows"]) for card in badge["netbox"])
    assert any(any(row["label"] == "VRF" and row["value"] == "default" for row in card["rows"]) for card in badge["netbox"])
    assert any(card["title"] == "10.40.24.0/24" for card in badge["netbox"])
    assert any(any("10.40.24.0/24 → 10.40.0.0/16" in row["value"] for row in card["rows"]) for card in badge["netbox"])
    assert any(any(row["label"] == "Assigned interface" and row["value"] == "GigabitEthernet1/0/18" for row in card["rows"]) for card in badge["netbox"])
    assert any(row["policy"]["name"] == "badge-auth" for row in badge["policies"])
    assert any(anomaly["code"] == "native-vlan-mismatch" for anomaly in badge["anomalies"])
    assert not any(anomaly["code"] == "mac-on-multiple-access-ports" for anomaly in badge["anomalies"])
    summary = ENGINE.investigate("10.40.24.46")["summary"]
    assert "does not have a flow record" in " ".join(summary["paragraphs"])
    assert "Separately" in " ".join(summary["paragraphs"])
    host = dossier("10.40.100.50")
    assert any(anomaly["code"] == "mac-on-multiple-access-ports" for anomaly in host["anomalies"])
    assert any(anomaly["code"] == "dns-mismatch" for anomaly in host["anomalies"])
    assert any(lookup["answer"] == "workstation-4c-old.regn10.swan.net" and not lookup["agreesWithCpnr"] for lookup in host["lookups"])
    empty = dossier("10.99.1.5")
    assert empty["sources"] and all(source["state"] == "clear" or source["id"] == "route" for source in empty["sources"])
    assert next(source["detail"] for source in empty["sources"] if source["id"] == "dns") == "No DNS record found"
    assert next(source["detail"] for source in empty["sources"] if source["id"] == "cpnr") == "No CPNR record found"
    cisco = dossier("0240.2412.448a")
    assert cisco["queryType"] == "mac" and cisco["title"] == "02:40:24:12:44:8a"
    vlan = dossier("vlan 240")
    assert any("Native differs" in row["note"] for row in vlan["interfaces"])
    prefix = dossier("10.40.24.0/24")
    assert any(row["hostname"] == "ASR1001-REGN07-CORE-1" and row["route"]["prefix"] == "10.40.0.0/16" for row in prefix["routes"])
    config = ENGINE.investigate("ntp server")
    assert config["kind"] == "config-search"
    assert any(group["device"]["hostname"] == "C9300-REGN10-4C-MGT-1" for group in config["groups"])
    choice = ENGINE.investigate("C9300")
    assert choice["kind"] == "choose-device" and len(choice["devices"]) > 3
    stats = ENGINE.slice_stats()
    assert stats["devices"] == 20 and stats["arp"] > 20 and stats["mac"] > stats["arp"]
    print("self-test ok")


ENGINE: Engine | None = None
COMMANDS: list[str] = []


def load_engine() -> Engine:
    global ENGINE, COMMANDS
    if ENGINE is None:
        ENGINE = Engine(json.loads(SLICE_PATH.read_text(encoding="utf-8")))
        COMMANDS = load_commands()
    return ENGINE


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_engine()
    yield


app = FastAPI(title="SWAN V27", version="20.3.5", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _engine() -> Engine:
    return load_engine()


@app.get("/api/health")
def health() -> dict:
    data_root = PUBLIC_DIR / "data" / "manifest.json"
    return {
        "ok": True,
        "version": "20.3.5",
        "entry": "V27 FastAPI",
        "module": "api_server.py",
        "index": "public-data" if data_root.is_file() else "builtin-region-10",
        "live": ["netbox", "dns", "cpnr", "nnmi", "opentext-na"],
    }


@app.get("/api/home")
def home() -> dict:
    engine = _engine()
    return {
        "version": "20.3.5",
        "productionIndex": PRODUCTION_INDEX,
        "indexedSources": INDEXED_SOURCES,
        "liveSources": LIVE_SOURCES,
        "stats": engine.slice_stats(),
        "findings": engine.notable_anomalies(),
        "pipeline": {
            "frontend": "SWAN React V20.3.5",
            "indexed": "configs_swan, ARP, and MAC are built into the correlation and operational indexes before a search.",
            "live": "V27 FastAPI calls ai_server.py for NetBox, NNMi, and OpenText NA.",
        },
    }


@app.get("/api/suggest")
def suggest(q: str = "") -> dict:
    engine = _engine()
    return {"kind": engine.describe_query(q), "suggestions": engine.suggest(q)}


@app.get("/api/investigate")
def investigate(q: str = "", force: str = Query(default="", alias="as")) -> dict:
    return _engine().investigate(q, force == "config")


@app.get("/api/vlan-matrix")
def vlan_matrix() -> dict:
    return {"rows": _engine().vlan_matrix()}


@app.get("/api/netbox")
def netbox(ip: str = "") -> dict:
    return ai_server.netbox_lookup(ip)


@app.get("/api/dns")
def dns(q: str = "") -> dict:
    return ai_server.dns_lookup(q)


@app.get("/api/cpnr")
def cpnr(q: str = "") -> dict:
    return ai_server.cpnr_lookup(q)


@app.get("/api/nnmi/alarms")
def nnmi(q: str = "") -> dict:
    return ai_server.nnmi_alarms(q)


@app.post("/api/na/command")
def na_command(payload: dict = Body(...)) -> dict:
    load_engine()
    return run_allowlisted_command(str(payload.get("device") or ""), str(payload.get("command") or ""), COMMANDS)


def main() -> None:
    if "--self-test" in sys.argv:
        load_engine()
        self_test()
        return
    import uvicorn

    port = int(os.environ.get("SWAN_API_PORT", "4183"))
    print(f"SWAN V27 FastAPI listening on 0.0.0.0:{port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")


if __name__ == "__main__":
    main()


