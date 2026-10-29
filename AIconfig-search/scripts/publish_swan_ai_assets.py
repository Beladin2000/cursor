#!/usr/bin/env python3
"""Copy the V27 entry point next to the built web root.

Apache serves public/. The React build writes index.html there. This copy
puts api_server.py beside it. It does not delete public/data.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def publish(project_root: Path) -> Path:
    source = project_root / "api_server.py"
    if not source.is_file():
        raise SystemExit(f"Missing {source}")
    public = project_root / "public"
    public.mkdir(parents=True, exist_ok=True)
    target = public / "api_server.py"
    shutil.copy2(source, target)
    print(f"published {target}")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish api_server.py into public/")
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args()
    publish(Path(args.project_root))


if __name__ == "__main__":
    main()
