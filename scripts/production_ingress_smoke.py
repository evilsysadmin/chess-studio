#!/usr/bin/env python3
"""Verify the production API ingress from outside the platform.

The public hostname must traverse Cloudflare, while Render's default
``*.onrender.com`` hostname must stay disabled. This is deliberately a tiny
synthetic check: no credentials, user data or application mutations.
"""
from __future__ import annotations

import argparse
import urllib.error
import urllib.request
from dataclasses import dataclass
from email.message import Message

DEFAULT_PUBLIC_API = "https://api.chess-studio.shadowops.dpdns.org/api/ready"
DEFAULT_RENDER_ORIGIN = "https://chess-study-backend.onrender.com/api/ready"
USER_AGENT = "chess-studio-ingress-smoke/1"


@dataclass(frozen=True)
class Probe:
    status: int
    headers: Message


def header_value(headers: Message, name: str) -> str:
    return str(headers.get(name) or "").strip()


def public_edge_error(probe: Probe) -> str | None:
    if probe.status != 200:
        return f"API pública respondió HTTP {probe.status}, esperaba 200"
    if not header_value(probe.headers, "cf-ray"):
        return "API pública no trae CF-Ray; el tráfico no acredita paso por Cloudflare"
    return None


def render_origin_error(probe: Probe) -> str | None:
    if probe.status != 404:
        return (
            f"hostname directo de Render respondió HTTP {probe.status}, esperaba 404 "
            "con renderSubdomainPolicy=disabled"
        )
    return None


def probe(url: str, *, timeout: float = 15.0) -> Probe:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": USER_AGENT,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            # Reading a small bounded prefix ensures the response is actually
            # consumable without storing or printing application payloads.
            response.read(4096)
            return Probe(status=int(response.status), headers=response.headers)
    except urllib.error.HTTPError as exc:
        exc.read(4096)
        return Probe(status=int(exc.code), headers=exc.headers)


def self_test() -> None:
    cloudflare_headers = Message()
    cloudflare_headers["CF-Ray"] = "abc123-MAD"
    assert public_edge_error(Probe(200, cloudflare_headers)) is None

    no_edge_headers = Message()
    assert public_edge_error(Probe(200, no_edge_headers)) is not None
    assert public_edge_error(Probe(503, cloudflare_headers)) is not None

    render_headers = Message()
    assert render_origin_error(Probe(404, render_headers)) is None
    assert render_origin_error(Probe(200, render_headers)) is not None
    assert render_origin_error(Probe(301, render_headers)) is not None

    print("production-ingress-smoke self-test OK · Cloudflare edge + Render origin lock")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--public-api", default=DEFAULT_PUBLIC_API)
    parser.add_argument("--render-origin", default=DEFAULT_RENDER_ORIGIN)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.self_test:
        self_test()
        return

    public = probe(args.public_api)
    error = public_edge_error(public)
    if error:
        raise SystemExit(error)

    direct = probe(args.render_origin)
    error = render_origin_error(direct)
    if error:
        raise SystemExit(error)

    cf_ray = header_value(public.headers, "cf-ray")
    print(
        "Production ingress OK · public API via Cloudflare "
        f"(CF-Ray present: {cf_ray[:32]}) · direct Render origin=404"
    )


if __name__ == "__main__":
    main()
