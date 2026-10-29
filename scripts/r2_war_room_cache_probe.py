#!/usr/bin/env python3
"""Measure Cloudflare *edge* caching of byte-verified immutable War Room GLBs.

This is an observer, not a cache-rule mutator. It uses HTTP GET with no
Cache-Control request bypass, URL query changes, browser cache or Playwright
route interception. Each response must match the active runtime R2 manifest SHA.
Second edge HIT is diagnostic until a narrow reviewed Cache Rule exists.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import time
import urllib.error
import urllib.request

import r2_war_room_live_freeze as freeze
from r2_war_room_runtime_contract import runtime_rooms

ROOMS = runtime_rooms()

USER_AGENT = "chess-studio-r2-warroom-cache-observer/1"
ORIGIN = "https://assets.chess-studio.shadowops.dpdns.org"

def read_get(room: freeze.Room, *, open_url=urllib.request.urlopen, clock=time.perf_counter):
    url = f"{ORIGIN}/{room.immutable_key}"
    # Do not set cache-bypass headers or add a query string: that would
    # measure an artificial cache key, not the URL shipped by the app.
    request = urllib.request.Request(url, method="GET", headers={
        "Accept": "model/gltf-binary",
        "User-Agent": USER_AGENT,
    })
    started = clock()
    try:
        with open_url(request, timeout=60) as response:
            status = int(response.status)
            headers = response.headers
            data = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"{room.variant}: public CDN GET failed: {exc}") from exc
    elapsed_ms = round((clock() - started) * 1000, 1)
    if status != 200:
        raise ValueError(f"{room.variant}: HTTP {status} for immutable GLB")
    if headers.get_content_type() != "model/gltf-binary":
        raise ValueError(f"{room.variant}: unexpected content type: {headers.get_content_type()}")
    freeze.verify_bytes(room, data)
    cache_status = str(headers.get("CF-Cache-Status") or "UNKNOWN").upper()
    ray = str(headers.get("CF-Ray") or "")
    return {
        "variant": room.variant,
        "url": url,
        "size": len(data),
        "sha256": room.sha256,
        "elapsedMs": elapsed_ms,
        "httpStatus": status,
        "cfCacheStatus": cache_status,
        "cfRayColo": ray.rsplit("-", 1)[-1] if "-" in ray else None,
        "cacheControl": headers.get("Cache-Control"),
        "age": headers.get("Age"),
        "etag": headers.get("ETag"),
    }


def probe(*, get=read_get):
    result = []
    for room in ROOMS:
        first, second = get(room), get(room)
        same_colo = bool(first["cfRayColo"] and first["cfRayColo"] == second["cfRayColo"])
        edge_hit = second["cfCacheStatus"] == "HIT"
        result.append({
            "variant": room.variant,
            "url": f"{ORIGIN}/{room.immutable_key}",
            "expectedBytes": room.size,
            "sha256": room.sha256,
            "first": first,
            "second": second,
            "sameColo": same_colo,
            "edgeHitConfirmed": edge_hit,
            "interpretation": "edge-hit" if edge_hit else (
                "colo-changed" if not same_colo else "no-confirmed-edge-hit"
            ),
        })
    return {
        "schema": "warroom-r2-cdn-v1",
        "source": "frontend/src/assets/r2-assets-manifest.json",
        "browserCacheDisabledByDesign": True,
        "edgeCacheConfigurationInspected": False,  # observer cannot establish zone config
        "rooms": result,
    }


def self_test() -> None:
    from email.message import Message
    from unittest.mock import patch

    assert len(ROOMS) == 2
    room = ROOMS[0]
    m = Message()
    m["Content-Type"] = "model/gltf-binary"
    m["CF-Cache-Status"] = "HIT"
    m["CF-Ray"] = "ray-MAD"
    m["Cache-Control"] = "public, max-age=31536000, immutable"

    class FakeResponse:
        status = 200
        headers = m
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            pass
        def read(self):
            return b"test-only"

    def opener(request, timeout):
        assert timeout == 60
        assert request.full_url == f"{ORIGIN}/{room.immutable_key}"
        assert request.get_header("Cache-control") is None
        assert "?" not in request.full_url
        return FakeResponse()

    with patch.object(freeze, "verify_bytes") as verify:
        row = read_get(room, open_url=opener, clock=lambda: 1.0)
        assert row["cfCacheStatus"] == "HIT"
        assert row["cfRayColo"] == "MAD"
        assert row["size"] == 9
        verify.assert_called_once_with(room, b"test-only")

    def fake_get(room):
        return {
            "variant": room.variant,
            "cfCacheStatus": "DYNAMIC",
            "cfRayColo": "MAD",
        }
    report = probe(get=fake_get)
    assert not any(row["edgeHitConfirmed"] for row in report["rooms"])
    assert all(row["interpretation"] == "no-confirmed-edge-hit" for row in report["rooms"])
    assert report["edgeCacheConfigurationInspected"] is False
    print("War Room R2 edge-cache observer self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("self-test", "probe"))
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return 0
    result = probe()
    encoded = json.dumps(result, indent=2, sort_keys=True) + "\n"
    print(encoded)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
