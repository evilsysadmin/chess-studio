#!/usr/bin/env python3
"""Keep oversized OCI Run Command shell payloads inside Oracle's 4096-byte limit."""
from __future__ import annotations

import base64
import zlib

MAX_RUN_COMMAND_BYTES = 4096


def compact_shell_command(command: str) -> str:
    raw = command.encode("utf-8")
    if not raw:
        raise ValueError("Run Command payload must not be empty")
    if len(raw) <= MAX_RUN_COMMAND_BYTES:
        return command

    payload = base64.b64encode(zlib.compress(raw, level=9)).decode("ascii")
    wrapped = (
        "python3 - <<'PY'\n"
        "import base64,subprocess,zlib\n"
        f"script=zlib.decompress(base64.b64decode({payload!r})).decode('utf-8')\n"
        "raise SystemExit(subprocess.run(['bash','-lc',script]).returncode)\n"
        "PY\n"
    )
    size = len(wrapped.encode("utf-8"))
    if size > MAX_RUN_COMMAND_BYTES:
        raise ValueError(
            f"Compressed Run Command payload is still too large: {size} bytes > {MAX_RUN_COMMAND_BYTES}"
        )
    return wrapped


def self_test() -> None:
    small = "printf '%s\\n' ok"
    assert compact_shell_command(small) == small

    large = "printf '%s\\n' probe\n" + ("# deterministic padding\n" * 500)
    compact = compact_shell_command(large)
    assert compact != large
    assert len(compact.encode("utf-8")) <= MAX_RUN_COMMAND_BYTES
    assert "zlib.decompress" in compact
    print("OCI Run Command compaction self-test: OK")


if __name__ == "__main__":
    self_test()
