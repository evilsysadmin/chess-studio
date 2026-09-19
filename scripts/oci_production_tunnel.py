#!/usr/bin/env python3
"""Prepare, activate, or roll back the temporary OCI production API route."""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request

import oci_cloudflare_tunnel as tunnel

PRODUCTION_API_HOSTNAME = "api.chess-studio.shadowops.dpdns.org"
RENDER_API_CNAME_TARGET = "chess-study-backend.onrender.com"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def validate_sha(value: str) -> str:
    sha = value.strip().lower()
    if not SHA_RE.fullmatch(sha):
        raise SystemExit("expected immutable 40-character lowercase SHA")
    return sha


def tunnel_cname(tunnel_id: str) -> str:
    if not tunnel.UUID_RE.fullmatch(tunnel_id):
        raise SystemExit("invalid Cloudflare tunnel id")
    return f"{tunnel_id}.cfargotunnel.com"


def write_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def ensure_dns_target(target: str, *, comment: str) -> None:
    zid = tunnel.zone_id()
    query = urllib.parse.urlencode({"name": PRODUCTION_API_HOSTNAME, "per_page": "100"})
    result = tunnel.cf_request("GET", f"/zones/{zid}/dns_records?{query}")
    rows = [row for row in (result if isinstance(result, list) else []) if isinstance(row, dict)]
    if len(rows) > 1:
        raise SystemExit(
            f"More than one DNS record exists for {PRODUCTION_API_HOSTNAME}; refusing ambiguous cutover"
        )
    desired = {
        "type": "CNAME",
        "name": PRODUCTION_API_HOSTNAME,
        "content": target,
        "proxied": True,
        "ttl": 1,
        "comment": comment,
    }
    if not rows:
        tunnel.cf_request("POST", f"/zones/{zid}/dns_records", desired)
        action = "created"
    else:
        row = rows[0]
        if row.get("type") != "CNAME" or not row.get("id"):
            raise SystemExit(f"Existing {PRODUCTION_API_HOSTNAME} record is not an editable CNAME")
        current = str(row.get("content") or "").rstrip(".")
        if current == target.rstrip(".") and bool(row.get("proxied")):
            action = "unchanged"
        else:
            tunnel.cf_request("PATCH", f"/zones/{zid}/dns_records/{row['id']}", desired)
            action = "updated"
    print(f"Cloudflare production DNS {action}: {PRODUCTION_API_HOSTNAME} -> {target}")


def current_dns_target() -> str:
    zid = tunnel.zone_id()
    query = urllib.parse.urlencode({"name": PRODUCTION_API_HOSTNAME, "per_page": "100"})
    result = tunnel.cf_request("GET", f"/zones/{zid}/dns_records?{query}")
    rows = [row for row in (result if isinstance(result, list) else []) if isinstance(row, dict)]
    if len(rows) != 1:
        raise SystemExit(
            f"Expected exactly one DNS record for {PRODUCTION_API_HOSTNAME}; found {len(rows)}"
        )
    row = rows[0]
    if row.get("type") != "CNAME" or not bool(row.get("proxied")):
        raise SystemExit("Production API route must be one proxied CNAME")
    target = str(row.get("content") or "").rstrip(".")
    if not target:
        raise SystemExit("Production API CNAME target is empty")
    return target


def assert_configured_route(target: str) -> str:
    if target not in {"render", "oci"}:
        raise SystemExit("production route target must be render or oci")
    actual = current_dns_target()
    if target == "render":
        expected = RENDER_API_CNAME_TARGET
    else:
        rows = tunnel.list_tunnels()
        if len(rows) != 1:
            raise SystemExit(
                f"Expected exactly one active OCI tunnel named {tunnel.TUNNEL_NAME}; found {len(rows)}"
            )
        expected = tunnel_cname(str(rows[0].get("id") or ""))
    if actual.rstrip(".") != expected.rstrip("."):
        raise SystemExit(
            f"Production API route mismatch: configured={target} actual={actual} expected={expected}"
        )
    print(f"Production API route OK: target={target} cname={actual}")
    return actual


def attest_public_current() -> str:
    ready = read_json(f"https://{PRODUCTION_API_HOSTNAME}/api/ready")
    release = read_json(f"https://{PRODUCTION_API_HOSTNAME}/api/release")
    build = str(release.get("build") or "").strip().lower()
    if ready.get("ok") is not True or ready.get("storage") != "mongo":
        raise SystemExit(f"Production API readiness failed: {ready!r}")
    if not SHA_RE.fullmatch(build):
        raise SystemExit(f"Production API release identity is not an immutable SHA: {build!r}")
    print(f"Production API public health OK: sha={build}")
    return build


def status(target: str) -> None:
    assert_configured_route(target)
    build = attest_public_current()
    print(f"CHESS_STUDIO_PRODUCTION_TARGET_SMOKE_OK target={target} sha={build}")


def prepare() -> str:
    tunnel_id = tunnel.ensure_tunnel()
    tunnel.configure_tunnel(tunnel_id)
    tunnel.wait_connection(tunnel_id)
    cname = tunnel_cname(tunnel_id)
    write_output("api_cname_target", cname)
    write_output("tunnel_id", tunnel_id)
    print(f"OCI production tunnel prepared without DNS mutation: {cname}")
    return cname


def read_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "chess-studio-production-cutover/1",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read())
    return payload if isinstance(payload, dict) else {}


def wait_public_sha(expected_sha: str, timeout: int = 180) -> None:
    expected_sha = validate_sha(expected_sha)
    deadline = time.monotonic() + timeout
    last = ""
    while time.monotonic() < deadline:
        try:
            ready = read_json(f"https://{PRODUCTION_API_HOSTNAME}/api/ready")
            release = read_json(
                f"https://{PRODUCTION_API_HOSTNAME}/api/release?sha={expected_sha}"
            )
            ok = (
                ready.get("ok") is True
                and ready.get("storage") == "mongo"
                and str(release.get("build") or "").lower() == expected_sha
            )
            if ok:
                print(
                    f"Production API public attestation OK: host={PRODUCTION_API_HOSTNAME} sha={expected_sha}"
                )
                return
            last = f"ready={ready!r} release={release!r}"
        except Exception as exc:
            last = f"{type(exc).__name__}: {exc}"
        time.sleep(3)
    raise SystemExit(f"Production API public attestation did not converge: {last[:300]}")


def activate(expected_sha: str) -> None:
    cname = prepare()
    ensure_dns_target(
        cname,
        comment="Chess Studio production API · temporary OCI Cloudflare Tunnel",
    )
    wait_public_sha(expected_sha)
    print(f"CHESS_STUDIO_PRODUCTION_ROUTE_OK target=oci sha={validate_sha(expected_sha)}")


def activate_render(expected_sha: str) -> None:
    expected_sha = validate_sha(expected_sha)
    ensure_dns_target(
        RENDER_API_CNAME_TARGET,
        comment="Chess Studio production API · Cloudflare -> Render rollback",
    )
    wait_public_sha(expected_sha)
    print(f"CHESS_STUDIO_PRODUCTION_ROUTE_OK target=render sha={expected_sha}")


def self_test() -> None:
    sample = "01234567-89ab-cdef-0123-456789abcdef"
    assert tunnel_cname(sample) == sample + ".cfargotunnel.com"
    assert validate_sha("a" * 40) == "a" * 40
    try:
        validate_sha("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("floating refs must be rejected")

    rules = tunnel.desired_ingress()["config"]["ingress"]  # type: ignore[index]
    assert rules[0]["hostname"] == tunnel.API_HOSTNAME
    assert rules[0]["service"] == "http://127.0.0.1:4000"
    assert rules[1]["hostname"] == PRODUCTION_API_HOSTNAME
    assert rules[1]["service"] == "http://127.0.0.1:4100"
    assert rules[-1]["service"] == "http_status:404"
    assert RENDER_API_CNAME_TARGET.endswith(".onrender.com")
    assert "status" in ("prepare", "activate", "render", "status")
    print("OCI production tunnel self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("prepare", "activate", "render", "status"))
    parser.add_argument("--sha", default="")
    parser.add_argument("--target", choices=("render", "oci"), default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")
    if args.operation in {"activate", "render"} and not args.sha:
        parser.error("--sha is required for activate/render")
    if args.operation == "status" and not args.target:
        parser.error("--target is required for status")
    if args.operation == "prepare":
        prepare()
    elif args.operation == "activate":
        activate(args.sha)
    elif args.operation == "render":
        activate_render(args.sha)
    else:
        status(args.target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
