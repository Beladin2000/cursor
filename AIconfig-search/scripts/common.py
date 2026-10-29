"""Shared JSON and hostname helpers.

Older builders import this module. The functions live in index_common.py.
"""

from index_common import (  # noqa: F401
    HOSTNAME_RE,
    IPV4_RE,
    VLAN_RE,
    hostname_from_config,
    iter_config_files,
    pick,
    read_csv_rows,
    read_json,
    write_json,
)
