"""Shared helpers for the nightly index builders. Standard library only."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

HOSTNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,253}$")
IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
VLAN_RE = re.compile(r"\bvlan\s+(\d{1,4})\b", re.I)


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def hostname_from_config(text: str, fallback: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("hostname "):
            name = stripped.split(None, 1)[1].strip()
            if HOSTNAME_RE.fullmatch(name):
                return name
    stem = Path(fallback).stem
    return stem if HOSTNAME_RE.fullmatch(stem) else stem


def iter_config_files(root: Path) -> list[Path]:
    files = []
    if not root.is_dir():
        return files
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() in {".csv", ".json", ".md", ".png", ".jpg"}:
            continue
        if path.name.startswith("."):
            continue
        files.append(path)
    return files


def latest_csv(directory: Path, prefix: str) -> Path | None:
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(f"{prefix}*.csv"))
    return matches[-1] if matches else None


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def pick(row: dict[str, str], names: list[str]) -> str:
    lowered = {key.strip().lower(): (value or "").strip() for key, value in row.items() if key}
    for name in names:
        if name in lowered and lowered[name]:
            return lowered[name]
    return ""
