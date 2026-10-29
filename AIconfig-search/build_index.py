#!/usr/bin/env python3
"""Build the configuration search index from a configs_swan checkout.

Writes public/data/manifest.json, device-summaries.json, and chunk-NNNN.json.
Each chunk is a list of {device, line, text} records. The manifest fields
record_count, summary_count, and chunks match the GitLab validation job.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))

from index_common import hostname_from_config, iter_config_files, write_json


def build(config_root: Path, project_root: Path, chunk_size: int) -> dict:
    records = []
    summaries = []
    for path in iter_config_files(config_root):
        text = path.read_text(encoding="utf-8", errors="replace")
        hostname = hostname_from_config(text, path.name)
        kept = 0
        for number, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if not stripped or stripped == "!" or stripped.startswith("! "):
                continue
            records.append({"device": hostname, "line": number, "text": stripped})
            kept += 1
        summaries.append({"hostname": hostname, "path": str(path.relative_to(config_root)), "lines": kept})
    data_root = project_root / "public" / "data"
    chunks = []
    size = max(chunk_size, 1)
    for index in range(0, max(len(records), 1), size):
        batch = records[index : index + size]
        if not batch and records:
            continue
        name = f"chunk-{index // size:04d}.json"
        write_json(data_root / name, batch)
        chunks.append(name)
        if not records:
            break
    manifest = {
        "record_count": len(records),
        "summary_count": len(summaries),
        "chunks": chunks,
        "source": "configs_swan",
    }
    write_json(data_root / "manifest.json", manifest)
    write_json(data_root / "device-summaries.json", summaries)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SWAN configuration index")
    parser.add_argument("--config-root", required=True)
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--chunk-size", type=int, default=10000)
    args = parser.parse_args()
    manifest = build(Path(args.config_root), Path(args.project_root), args.chunk_size)
    print(
        f"config records {manifest['record_count']} devices {manifest['summary_count']} chunks {len(manifest['chunks'])}"
    )


if __name__ == "__main__":
    main()
