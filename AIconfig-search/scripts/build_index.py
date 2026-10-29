#!/usr/bin/env python3
"""Run the configuration index builder that lives next to this folder.

GitLab calls AIconfig-search/build_index.py. This file is the same command
from inside scripts/.
"""

from __future__ import annotations

import runpy
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "build_index.py"

if __name__ == "__main__":
    runpy.run_path(str(TARGET), run_name="__main__")
