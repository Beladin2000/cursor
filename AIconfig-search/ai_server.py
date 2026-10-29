"""Live NetBox and DNS lookups for SWAN V20.3.5.

Credentials stay in the environment. This module never embeds a token,
password, or username, and it never writes those values into a response
or a log line.
"""

from __future__ import annotations

import ipaddress
import json
import os
import socket
import urllib.error
import urllib.parse
import urllib.request


def configuration_warning(name: str) -> str:
    return (
        f"Backend configuration warning: {name} is not set. "
        "SWAN did not call the live system."
    )


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def _token_header(token: str) -> str:
    return f"Token {token}"


def _get_json(url: str, token: str, timeout: float) -> dict | list:
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", _token_header(token))
    request.add_header("Accept", "application/json")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    if not raw.strip():
        return {}
    return json.loads(raw)


def _is_ipv4(value: str) -> bool:
    try:
        ipaddress.IPv4Address(value)
        return True
    except ipaddress.AddressValueError:
        return False


def _prefix_length(cidr: str) -> int:
    try:
        return ipaddress.ip_network(cidr, strict=False).prefixlen
    except ValueError:
        return -1


def _contains(cidr: str, ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False


def netbox_lookup(ip: str) -> dict:
    """Exact IP, containing prefixes, VRF, and the most-specific hierarchy."""
    address = ip.strip()
    base = _env("NETBOX_URL").rstrip("/")
    if not base:
        return {
            "configured": False,
            "sent": False,
            "warning": configuration_warning("NETBOX_URL"),
            "address": None,
            "prefixes": [],
            "hierarchy": "",
        }
    if not _is_ipv4(address):
        return {
            "configured": True,
            "sent": False,
            "warning": None,
            "error": "NetBox lookup expects an IPv4 address.",
            "address": None,
            "prefixes": [],
            "hierarchy": "",
        }
    token = _env("NETBOX_TOKEN")
    timeout = float(_env("NETBOX_TIMEOUT") or "8")
    try:
        ip_url = (
            f"{base}/api/ipam/ip-addresses/?address={urllib.parse.quote(address)}"
            "&limit=5"
        )
        prefix_url = (
            f"{base}/api/ipam/prefixes/?contains={urllib.parse.quote(address)}&limit=50"
        )
        ip_payload = _get_json(ip_url, token, timeout)
        prefix_payload = _get_json(prefix_url, token, timeout)
    except urllib.error.HTTPError as exc:
        return {
            "configured": True,
            "sent": True,
            "warning": None,
            "error": f"NetBox returned HTTP {exc.code}.",
            "address": None,
            "prefixes": [],
            "hierarchy": "",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {
            "configured": True,
            "sent": True,
            "warning": None,
            "error": "NetBox could not be reached.",
            "address": None,
            "prefixes": [],
            "hierarchy": "",
        }

    results = ip_payload.get("results", []) if isinstance(ip_payload, dict) else []
    exact = None
    for row in results:
        raw_address = str(row.get("address") or "")
        if raw_address.split("/")[0] == address:
            exact = _netbox_address(row)
            break
    prefixes = []
    raw_prefixes = prefix_payload.get("results", []) if isinstance(prefix_payload, dict) else []
    for row in raw_prefixes:
        cidr = str(row.get("prefix") or "")
        if cidr and _contains(cidr, address):
            prefixes.append(_netbox_prefix(row))
    prefixes.sort(key=lambda row: _prefix_length(row["prefix"]), reverse=True)
    hierarchy = " → ".join(row["prefix"] for row in prefixes)
    return {
        "configured": True,
        "sent": True,
        "warning": None,
        "error": None,
        "address": exact,
        "prefixes": prefixes,
        "hierarchy": hierarchy,
        "empty": exact is None and not prefixes,
    }


def _display(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return str(value.get("display") or value.get("name") or value.get("prefix") or "")
    return str(value)


def _netbox_address(row: dict) -> dict:
    vrf = row.get("vrf")
    assigned = row.get("assigned_object") or {}
    device = assigned.get("device") if isinstance(assigned, dict) else None
    return {
        "address": row.get("address") or "",
        "status": _display(row.get("status")),
        "role": _display(row.get("role")),
        "dnsName": row.get("dns_name") or "",
        "description": row.get("description") or "",
        "vrf": _display(vrf) or "global",
        "tenant": _display(row.get("tenant")),
        "assignedDevice": _display(device) if isinstance(device, dict) else "",
        "assignedInterface": _display(assigned.get("name") if isinstance(assigned, dict) else ""),
    }


def _netbox_prefix(row: dict) -> dict:
    return {
        "prefix": row.get("prefix") or "",
        "description": row.get("description") or "",
        "vrf": _display(row.get("vrf")) or "global",
        "status": _display(row.get("status")),
        "role": _display(row.get("role")),
        "site": _display(row.get("scope") or row.get("site")),
        "vlan": _display(row.get("vlan")),
        "tenant": _display(row.get("tenant")),
    }


def dns_lookup(query: str) -> dict:
    """Forward or reverse lookup through the system resolver. Not a shell."""
    text = query.strip().rstrip(".")
    if not text:
        return {
            "configured": True,
            "sent": False,
            "direction": None,
            "query": "",
            "answers": [],
            "detail": "No DNS record found",
        }
    try:
        if _is_ipv4(text):
            hostname, aliases, _addresses = socket.gethostbyaddr(text)
            answers = [hostname, *[alias for alias in aliases if alias != hostname]]
            direction = "reverse"
        else:
            infos = socket.getaddrinfo(text, None, socket.AF_INET, socket.SOCK_STREAM)
            answers = sorted({item[4][0] for item in infos})
            direction = "forward"
    except (socket.gaierror, socket.herror, OSError):
        answers = []
        direction = "reverse" if _is_ipv4(text) else "forward"
    if not answers:
        return {
            "configured": True,
            "sent": True,
            "direction": direction,
            "query": text,
            "answers": [],
            "detail": "No DNS record found",
        }
    return {
        "configured": True,
        "sent": True,
        "direction": direction,
        "query": text,
        "answers": answers,
        "detail": answers[0],
    }
