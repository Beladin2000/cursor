#!/usr/bin/env python3
"""Copy running configurations into an export directory.

Pass --config-root to copy the files that were indexed.
Pass --data-root to rebuild a text file per device from the search chunks.
Chunk export drops blank lines and comments, because the index does too.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from index_common import iter_config_files, read_json


def from_configs(config_root: Path, output_dir: Path) -> int:
    count = 0
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in iter_config_files(config_root):
        target = output_dir / path.name
        target.write_text(path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        count += 1
    return count


def from_chunks(data_root: Path, output_dir: Path) -> int:
    manifest = read_json(data_root / "manifest.json")
    grouped: dict[str, list[str]] = {}
    for chunk_name in manifest.get("chunks", []):
        for record in read_json(data_root / str(chunk_name).lstrip("/").removeprefix("data/")):
            grouped.setdefault(record.get("device") or "unknown", []).append(record.get("text", ""))
    output_dir.mkdir(parents=True, exist_ok=True)
    for device, lines in grouped.items():
        (output_dir / f"{device}.cfg").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(grouped)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export running configurations")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--config-root", default="")
    parser.add_argument("--data-root", default="")
    args = parser.parse_args()
    output = Path(args.output_dir)
    if args.config_root:
        count = from_configs(Path(args.config_root), output)
    elif args.data_root:
        count = from_chunks(Path(args.data_root), output)
    else:
        raise SystemExit("Pass --config-root or --data-root")
    print(f"exported configs {count}")


if __name__ == "__main__":
    main()
