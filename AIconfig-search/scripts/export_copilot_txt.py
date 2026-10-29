#!/usr/bin/env python3
"""Export an evidence packet as text.

The file is the evidence SWAN gathered. It is not a conclusion.
Accepts an investigation JSON object or a findings index.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


HEADER = (
    "SWAN evidence packet\n"
    "This file is the evidence SWAN gathered. It is not a conclusion.\n"
)


def render(payload) -> str:
    lines = [HEADER]
    if isinstance(payload, dict):
        title = payload.get("title") or payload.get("query") or payload.get("hostname")
        if title:
            lines.append(f"Subject: {title}")
        summary = payload.get("summary")
        if isinstance(summary, str) and summary.strip():
            lines.append("")
            lines.append("Summary")
            lines.append(summary.strip())
        findings = payload.get("findings")
        if isinstance(findings, list) and findings:
            lines.append("")
            lines.append("Findings")
            for finding in findings:
                if isinstance(finding, dict):
                    title = finding.get("title") or finding.get("id") or "Finding"
                    detail = finding.get("detail") or ""
                    lines.append(f"- {title}")
                    if detail:
                        lines.append(f"  {detail}")
                else:
                    lines.append(f"- {finding}")
        chain = payload.get("chain")
        if isinstance(chain, list) and chain:
            lines.append("")
            lines.append("Chain")
            for node in chain:
                if isinstance(node, dict):
                    lines.append(f"- {node.get('label') or node.get('kind')}: {node.get('value') or node.get('text') or ''}")
                else:
                    lines.append(f"- {node}")
    lines.append("")
    lines.append("Source JSON")
    lines.append(json.dumps(payload, ensure_ascii=False, indent=2))
    lines.append("")
    return "\n".join(lines)


def export(source: Path, output: Path) -> Path:
    payload = json.loads(source.read_text(encoding="utf-8"))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(payload), encoding="utf-8")
    print(f"wrote {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Copilot-ready evidence text")
    parser.add_argument("investigation")
    parser.add_argument("-o", "--output", default="")
    args = parser.parse_args()
    source = Path(args.investigation)
    output = Path(args.output) if args.output else source.with_suffix(".txt")
    export(source, output)


if __name__ == "__main__":
    main()
