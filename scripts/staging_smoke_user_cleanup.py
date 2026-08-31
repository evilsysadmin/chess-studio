#!/usr/bin/env python3
"""Borra identidades técnicas de smoke exclusivamente de la DB de staging.

El runner ya dispone de RENDER_API_KEY para desplegar staging. Este janitor usa
esa misma credencial para leer MONGO_URL/MONGO_DB_NAME del servicio staging,
valida de forma fail-closed que apunta a chess_study_staging y sólo permite
borrar usernames reservados con formato ``ci_smoke_<16 hex>``.

No imprime MONGO_URL, passwords ni documentos de usuario.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

RENDER_API = "https://api.render.com/v1"
STAGING_SERVICE_NAME = "chess-study-backend-staging"
STAGING_DB_NAME = "chess_study_staging"
CI_USER_RE = re.compile(r"^ci_smoke_[0-9a-f]{16}$")
MAX_SWEEP_USERS = 100


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para limpiar el usuario técnico de staging")
    return value


def render_api(path: str) -> object:
    request = urllib.request.Request(
        f"{RENDER_API}{path}",
        headers={
            "Authorization": f"Bearer {required('RENDER_API_KEY')}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"Render API GET {path}: HTTP {exc.code}: {detail}") from None


def unwrap_env_value(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    row = payload.get("envVar") if isinstance(payload.get("envVar"), dict) else payload
    value = row.get("value") if isinstance(row, dict) else None
    return str(value or "").strip()


def render_env(service_id: str, key: str) -> str:
    encoded = urllib.parse.quote(key, safe="")
    return unwrap_env_value(render_api(f"/services/{service_id}/env-vars/{encoded}"))


def validate_ci_username(username: str) -> str:
    candidate = str(username or "").strip().lower()
    if not CI_USER_RE.fullmatch(candidate):
        raise SystemExit("Refuso borrar un username que no pertenece al namespace técnico ci_smoke_<16 hex>")
    return candidate


def deleted_count(result: object) -> int:
    return int(getattr(result, "deleted_count", 0) or 0)


def cleanup_database(db, username: str) -> dict[str, int]:
    """Replica la cascada de Admin; usuario al final para permitir reintento."""
    username = validate_ci_username(username)
    counts = {
        "games": deleted_count(db["games"].delete_many({"owner": username})),
        "profile": deleted_count(db["profile"].delete_one({"_id": username})),
        "matthias_daily": deleted_count(db["matthias_daily"].delete_one({"_id": username})),
        "matthias_memory": deleted_count(db["matthias_memory"].delete_one({"_id": username})),
        "users": deleted_count(db["users"].delete_one({"_id": username})),
    }
    return counts


def connect_staging_db():
    service_id = required("RENDER_STAGING_SERVICE_ID")
    service = render_api(f"/services/{service_id}")
    row = service.get("service") if isinstance(service, dict) and isinstance(service.get("service"), dict) else service
    if not isinstance(row, dict) or str(row.get("name") or "") != STAGING_SERVICE_NAME:
        raise SystemExit("El service ID no corresponde al backend de staging; no se toca Mongo")

    environment = render_env(service_id, "ENVIRONMENT").lower()
    database_name = render_env(service_id, "MONGO_DB_NAME")
    mongo_url = render_env(service_id, "MONGO_URL")
    if environment != "staging":
        raise SystemExit(f"ENVIRONMENT={environment or '<vacío>'}; esperaba staging. No se toca Mongo")
    if database_name != STAGING_DB_NAME:
        raise SystemExit(f"MONGO_DB_NAME={database_name or '<vacío>'}; esperaba {STAGING_DB_NAME}. No se toca Mongo")
    if not mongo_url:
        raise SystemExit("Staging no expone MONGO_URL; no se puede ejecutar el janitor")

    # Import tardío: --self-test debe funcionar sin dependencias instaladas.
    from pymongo import MongoClient

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10_000, connectTimeoutMS=10_000)
    client.admin.command("ping")
    return client, client[database_name]


def cleanup_one(db, username: str) -> None:
    username = validate_ci_username(username)
    counts = cleanup_database(db, username)
    if db["users"].find_one({"_id": username}, {"_id": 1}) is not None:
        raise SystemExit("El janitor no pudo verificar la desaparición del usuario técnico")
    total = sum(counts.values())
    print(f"Staging smoke janitor: identidad eliminada · {total} documentos limpiados")


def sweep_ci_users(db) -> None:
    rows = list(db["users"].find({"_id": {"$regex": CI_USER_RE.pattern}}, {"_id": 1}).limit(MAX_SWEEP_USERS + 1))
    if len(rows) > MAX_SWEEP_USERS:
        raise SystemExit(f"Hay más de {MAX_SWEEP_USERS} identidades ci_smoke_; aborto el barrido por seguridad")
    for row in rows:
        cleanup_database(db, str(row.get("_id") or ""))
    remaining = db["users"].count_documents({"_id": {"$regex": CI_USER_RE.pattern}}, limit=1)
    if remaining:
        raise SystemExit("Quedaron identidades ci_smoke_ después del barrido")
    print(f"Staging smoke janitor: barrido previo OK · {len(rows)} identidades antiguas eliminadas")


def self_test() -> None:
    class Result:
        def __init__(self, count=1):
            self.deleted_count = count

    class Collection:
        def __init__(self):
            self.calls = []
        def delete_one(self, query):
            self.calls.append(("one", query))
            return Result()
        def delete_many(self, query):
            self.calls.append(("many", query))
            return Result(2)

    class DB(dict):
        def __missing__(self, key):
            value = Collection()
            self[key] = value
            return value

    db = DB()
    counts = cleanup_database(db, "ci_smoke_0123456789abcdef")
    assert counts == {"games": 2, "profile": 1, "matthias_daily": 1, "matthias_memory": 1, "users": 1}
    assert db["games"].calls == [("many", {"owner": "ci_smoke_0123456789abcdef"})]
    assert db["users"].calls == [("one", {"_id": "ci_smoke_0123456789abcdef"})]
    try:
        validate_ci_username("evilsysadmin")
    except SystemExit:
        pass
    else:
        raise AssertionError("El janitor aceptó un username no técnico")
    print("staging-smoke-user-cleanup self-test OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--sweep", action="store_true", help="Borra identidades ci_smoke_ antiguas antes del nuevo smoke")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    client, db = connect_staging_db()
    try:
        if args.sweep:
            sweep_ci_users(db)
        else:
            cleanup_one(db, required("STAGING_E2E_USERNAME"))
    finally:
        client.close()


if __name__ == "__main__":
    main()
