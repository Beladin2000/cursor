#!/usr/bin/env python3
"""Show which live-system variables are set.

Prints SET or UNSET for each name. Values are never printed.
"""

from __future__ import annotations

import os

NAMES = [
    "NETBOX_URL",
    "NETBOX_TOKEN",
    "NETBOX_TIMEOUT",
    "CPNR_URL",
    "CPNR_TOKEN",
    "NNMI_URL",
    "NA_URL",
    "NA_COMMAND_ENDPOINT",
    "NA_USERNAME",
    "NA_PASSWORD",
    "NA_TOKEN",
    "NA_VERIFY_SSL",
    "NA_TIMEOUT",
    "NA_COMMAND_RUNNER",
    "SWAN_API_PORT",
]


def main() -> None:
    for name in NAMES:
        state = "SET" if os.environ.get(name, "").strip() else "UNSET"
        print(f"{name} {state}")


if __name__ == "__main__":
    main()
