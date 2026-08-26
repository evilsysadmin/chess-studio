#!/usr/bin/env python3
"""Probe manual de carga ligera para una beta.

No es un benchmark ni intenta tumbar nada. Dispara GET concurrentes a health y
ready para detectar latencias absurdas/errores antes de invitar a más gente.
Uso: python scripts/api_load_probe.py --base-url https://tu-api --requests 60 --concurrency 8
"""
from __future__ import annotations

import argparse
import concurrent.futures
import statistics
import time
import urllib.error
import urllib.request


def hit(url: str, timeout: float) -> tuple[int, float]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            response.read(256)
            status = int(response.status)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
    except Exception:
        status = 0
    return status, (time.perf_counter() - started) * 1000


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def run_probe(base_url: str, requests: int, concurrency: int, timeout: float) -> int:
    base = base_url.rstrip('/')
    urls = [f"{base}/api/health", f"{base}/api/ready"]
    jobs = [urls[i % len(urls)] for i in range(requests)]
    results: list[tuple[int, float]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(hit, url, timeout) for url in jobs]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    latencies = [latency for _, latency in results]
    failures = sum(1 for status, _ in results if status != 200)
    print(f"requests={len(results)} concurrency={concurrency} failures={failures}")
    print(f"latency_ms median={statistics.median(latencies):.1f} p95={percentile(latencies, .95):.1f} max={max(latencies, default=0):.1f}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--requests', type=int, default=60)
    parser.add_argument('--concurrency', type=int, default=8)
    parser.add_argument('--timeout', type=float, default=5.0)
    args = parser.parse_args()
    requests = min(500, max(2, args.requests))
    concurrency = min(32, max(1, args.concurrency))
    return run_probe(args.base_url, requests, concurrency, max(.5, args.timeout))


if __name__ == '__main__':
    raise SystemExit(main())
