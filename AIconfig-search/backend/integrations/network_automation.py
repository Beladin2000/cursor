"""OpenText Network Automation allowlisted show commands.

The executable named by NA_COMMAND_RUNNER receives the device and the
command as two arguments. Nothing in this module stores a username,
password, or token. Those names stay in the environment when a deployment
has them: NA_URL, NA_COMMAND_ENDPOINT, NA_USERNAME, NA_PASSWORD, NA_TOKEN,
NA_VERIFY_SSL, NA_TIMEOUT, NA_COMMAND_RUNNER.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMAND_FILES = (
    ROOT / "react" / "src" / "liveCommands.json",
    ROOT / "backend" / "approved_commands.json",
)
HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,253}$")


def load_commands() -> list[str]:
    for path in COMMAND_FILES:
        if path.is_file():
            commands = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(commands, list) and commands:
                return [str(command) for command in commands]
    raise FileNotFoundError("Allowlisted command list is missing")


def run_allowlisted_command(device: str, command: str, commands: list[str] | None = None) -> dict:
    command = (command or "").strip()
    device = (device or "").strip()
    allowed = commands if commands is not None else load_commands()
    if command not in allowed or command == "show running-config":
        return {"ok": False, "sent": False, "error": "Command is not allowlisted. SWAN did not send it."}
    if not HOST_RE.fullmatch(device):
        return {"ok": False, "sent": False, "error": "Device name is not a hostname SWAN will pass to the runner."}
    runner = os.environ.get("NA_COMMAND_RUNNER", "").strip()
    if not runner:
        return {
            "ok": False,
            "sent": False,
            "warning": (
                "Backend configuration warning: the Network Automation command path is not configured. "
                f"SWAN did not send “{command}”. Set NA_COMMAND_RUNNER to an executable that accepts the device and this allowlisted command."
            ),
        }
    timeout = int(os.environ.get("NA_TIMEOUT", "30") or "30")
    try:
        completed = subprocess.run(
            [runner, device, command],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "sent": True, "error": "The command runner timed out."}
    except OSError:
        return {
            "ok": False,
            "sent": False,
            "warning": f"Backend configuration warning: NA_COMMAND_RUNNER could not be started. SWAN did not send “{command}”.",
        }
    return {
        "ok": completed.returncode == 0,
        "sent": True,
        "exitCode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }
