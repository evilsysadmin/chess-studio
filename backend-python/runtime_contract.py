"""Small environment contract for OCI staging runtime materialization."""
from __future__ import annotations

import os
from typing import Mapping

RUNTIME_SCHEMA_KEY = "CHESS_STUDIO_RUNTIME_SCHEMA"
RUNTIME_SCHEMA_VERSION = "vault-git-v1"


def staging_runtime_contract_ready(environ: Mapping[str, str] | None = None) -> bool:
    env = os.environ if environ is None else environ
    if str(env.get("ENVIRONMENT") or "").strip().lower() != "staging":
        return True
    return str(env.get(RUNTIME_SCHEMA_KEY) or "").strip() == RUNTIME_SCHEMA_VERSION
