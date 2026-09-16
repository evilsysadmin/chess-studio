#!/usr/bin/env python3
"""Classify the Render staging Mongo target without exposing its URI or hosts."""
from __future__ import annotations

import argparse
from dataclasses import dataclass

from oci_runtime_config import read_render_env, resolve_render_staging


@dataclass(frozen=True)
class MongoTarget:
    scheme: str
    provider: str
    host_count: int
    uses_srv: bool
    explicit_port: bool
    database_present: bool
    options_present: bool


def _host_without_port(value: str) -> tuple[str, bool]:
    value = value.strip().lower()
    if value.startswith("["):
        end = value.find("]")
        if end < 0:
            raise ValueError("invalid bracketed host")
        return value[1:end], bool(value[end + 1 :].startswith(":"))
    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host, True
    return value, False


def classify_provider(hosts: list[str]) -> str:
    if hosts and all(host == "mongodb.net" or host.endswith(".mongodb.net") for host in hosts):
        return "mongodb-atlas"
    if hosts and all(host == "aivencloud.com" or host.endswith(".aivencloud.com") for host in hosts):
        return "aiven"
    if hosts and all(host == "mongo.ondigitalocean.com" or host.endswith(".mongo.ondigitalocean.com") for host in hosts):
        return "digitalocean-managed-mongodb"
    if hosts and all(host.endswith(".railway.internal") or host.endswith(".up.railway.app") for host in hosts):
        return "railway"
    return "unknown-or-self-managed"


def classify_mongo_url(raw: str) -> MongoTarget:
    value = str(raw or "").strip()
    if "://" not in value:
        raise ValueError("Mongo URI is missing a scheme")
    scheme, rest = value.split("://", 1)
    scheme = scheme.lower()
    if scheme not in {"mongodb", "mongodb+srv"}:
        raise ValueError("unsupported Mongo URI scheme")

    authority, sep, tail = rest.partition("/")
    host_part = authority.rsplit("@", 1)[-1]
    if not host_part:
        raise ValueError("Mongo URI has no host")
    raw_hosts = [item for item in host_part.split(",") if item.strip()]
    parsed = [_host_without_port(item) for item in raw_hosts]
    hosts = [host for host, _ in parsed]
    if not hosts:
        raise ValueError("Mongo URI has no usable host")

    path, query_sep, _query = tail.partition("?") if sep else ("", "", "")
    return MongoTarget(
        scheme=scheme,
        provider=classify_provider(hosts),
        host_count=len(hosts),
        uses_srv=scheme == "mongodb+srv",
        explicit_port=any(has_port for _, has_port in parsed),
        database_present=bool(path.strip("/")),
        options_present=bool(query_sep),
    )


def diagnose() -> MongoTarget:
    service_id = resolve_render_staging()
    raw = read_render_env(service_id, "MONGO_URL")
    if not raw:
        raise SystemExit("Render staging MONGO_URL is missing")
    try:
        target = classify_mongo_url(raw)
    except ValueError as exc:
        raise SystemExit(f"Unable to classify Render staging Mongo target: {exc}") from None
    print(
        "MONGO_TARGET_METADATA "
        f"scheme={target.scheme} "
        f"provider={target.provider} "
        f"host_count={target.host_count} "
        f"srv={'yes' if target.uses_srv else 'no'} "
        f"explicit_port={'yes' if target.explicit_port else 'no'} "
        f"database={'yes' if target.database_present else 'no'} "
        f"options={'yes' if target.options_present else 'no'}"
    )
    return target


def self_test() -> None:
    atlas = classify_mongo_url("mongodb+srv://user:password@cluster.example.mongodb.net/staging?retryWrites=true")
    assert atlas.provider == "mongodb-atlas"
    assert atlas.uses_srv and atlas.host_count == 1
    assert not atlas.explicit_port and atlas.database_present and atlas.options_present

    direct = classify_mongo_url("mongodb://user:password@db1.example.test:27017,db2.example.test:27018/staging")
    assert direct.provider == "unknown-or-self-managed"
    assert direct.host_count == 2 and direct.explicit_port and not direct.uses_srv

    railway = classify_mongo_url("mongodb://u:p@mongo.railway.internal:27017/db")
    assert railway.provider == "railway"
    print("Render Mongo target diagnostics self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    diagnose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
