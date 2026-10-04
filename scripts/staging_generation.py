#!/usr/bin/env python3
"""One tested home for the staging-generation checks used by Deploy to staging.

Before this script the workflow carried the same ideas as inline bash/Python in
four different styles: "is this still main HEAD?", "does surface X serve this
SHA yet?", the N/N/N backend/frontend/Worker parity and the prebuilt-dist
identity. Each subcommand here is small, deterministic and self-tested.

  main-head       --sha SHA [--github-output F]         superseded=true|false
  dist-identity   --sha SHA [--path frontend/dist/release.json]
  wait            --sha SHA --surfaces frontend,backend,worker [--root]
  watch-committed --sha SHA [--github-output F]          converged=true|false

URLs come from STAGING_URL, STAGING_API_URL and STAGING_AI_URL.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cloudflare_health_contract import validate_health_payload  # noqa: E402

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DEFAULT_URLS = {
    "STAGING_URL": "https://staging.chess-studio.shadowops.dpdns.org",
    "STAGING_API_URL": "https://api-staging.chess-studio.shadowops.dpdns.org/api",
    "STAGING_AI_URL": "https://ai-staging.shadowops.dpdns.org",
}
SURFACES = ("backend", "frontend", "worker")

# fetch(url) -> (status, body text); status 0 on transport errors.
Fetcher = Callable[[str], "tuple[int, str]"]


class GenerationError(RuntimeError):
    pass


def url(name: str) -> str:
    return (os.environ.get(name) or DEFAULT_URLS[name]).rstrip("/")


def valid_sha(value: str) -> str:
    sha = str(value or "").strip().lower()
    if not SHA_RE.match(sha):
        raise GenerationError(f"SHA no es un commit completo: {value!r}")
    return sha


def http_fetch(target: str, *, accept: str = "application/json", timeout: float = 15.0) -> tuple[int, str]:
    # Cloudflare's bot rules reject urllib's default User-Agent with 403.
    request = Request(target, headers={
        "Accept": accept,
        "Cache-Control": "no-cache, no-store",
        "User-Agent": "chess-studio-staging-generation/1",
    })
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError):
        return 0, ""


def build_of(body: str) -> str:
    try:
        payload = json.loads(body)
    except (TypeError, json.JSONDecodeError):
        return "unreadable"
    if not isinstance(payload, dict):
        return "unreadable"
    return str(payload.get("build") or "missing").lower()


def surface_url(surface: str, sha: str) -> str:
    if surface == "backend":
        return f"{url('STAGING_API_URL')}/release?sha={sha}"
    if surface == "frontend":
        return f"{url('STAGING_URL')}/release.json?sha={sha}"
    if surface == "worker":
        return f"{url('STAGING_AI_URL')}/health"
    raise GenerationError(f"superficie desconocida: {surface}")


def observe(surface: str, sha: str, fetch: Fetcher) -> tuple[bool, str]:
    """(ok, human description) for one surface serving ``sha``."""
    status, body = fetch(surface_url(surface, sha))
    build = build_of(body) if status == 200 else "unreachable"
    ok = status == 200 and build == sha
    if ok and surface == "worker":
        errors = validate_health_payload(json.loads(body))
        if errors:
            return False, f"worker={build} (contrato /health: {'; '.join(errors)})"
    return ok, f"{surface}={build} (HTTP {status or 'error'})"


def wait_for_surfaces(
    sha: str,
    surfaces: list[str],
    *,
    attempts: int,
    interval: float,
    fetch: Fetcher = http_fetch,
    sleep: Callable[[float], None] = time.sleep,
    root: bool = False,
) -> bool:
    for attempt in range(1, attempts + 1):
        results = [observe(surface, sha, fetch) for surface in surfaces]
        if all(ok for ok, _ in results):
            if root:
                status, _ = fetch(f"{url('STAGING_URL')}/")
                if status != 200:
                    print(f"::error::Frontend staging raíz devuelve HTTP {status or 'error'}")
                    return False
            print(f"Staging sirve {sha} en {', '.join(surfaces)}")
            return True
        detail = ", ".join(text for _, text in results)
        print(f"Aún no converge: {detail}; esperado {sha} (intento {attempt}/{attempts})")
        if attempt < attempts:
            sleep(interval)
    print(f"::error::{'/'.join(surfaces)} no sirvió {sha} tras {attempts} intentos")
    return False


def current_main(runner: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> str:
    result = runner(
        ["git", "ls-remote", "origin", "refs/heads/main"],
        capture_output=True, text=True, check=False,
    )
    head = (result.stdout or "").split()[0] if (result.stdout or "").split() else ""
    if not SHA_RE.match(head):
        raise GenerationError(f"No pude resolver un main HEAD válido: {head or '<vacío>'}")
    return head


def write_output(path: str | None, **values: str) -> None:
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(lines)
    sys.stdout.write(lines)


def dist_identity(sha: str, path: pathlib.Path) -> bool:
    try:
        return build_of(path.read_text(encoding="utf-8")) == sha
    except OSError:
        return False


def watch_committed(
    sha: str,
    *,
    attempts: int,
    interval: float,
    main_every: int,
    fetch: Callable[[str], "tuple[int, str]"],
    accredited: Callable[[], bool],
    main_head: Callable[[], str],
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    """Zero-cost fast path: the host publishes /_deploy/committed only after its
    post-cutover attestations pass; a rollback restores the previous SHA."""
    for attempt in range(1, attempts + 1):
        status, body = fetch(f"{url('STAGING_API_URL')}/_deploy/committed?probe={attempt}")
        if status == 200 and body.strip().lower() == sha and accredited():
            return True
        if attempt % main_every == 0:
            try:
                if main_head() != sha:
                    return False
            except GenerationError:
                pass
        if attempt < attempts:
            sleep(interval)
    return False


def backend_accredited(sha: str) -> bool:
    script = pathlib.Path(__file__).resolve().parent / "verify_backend_staging.py"
    result = subprocess.run(
        [sys.executable, str(script), "--api-url", url("STAGING_API_URL"), "--sha", sha,
         "--attempts", "1", "--interval", "0"],
        capture_output=True, text=True, check=False,
    )
    return result.returncode == 0


def self_test() -> None:
    sha = "a" * 40
    other = "b" * 40
    health = {"ok": True, "service": "chess-studio-narrative-ai", "build": sha,
              "model": "@cf/qwen/qwen3-30b-a3b-fp8",
              "models": {k: "@cf/qwen/qwen3-30b-a3b-fp8" for k in ("comments", "player_portrait", "analysis")}}

    def fake(served: dict[str, str], *, root_status: int = 200) -> Fetcher:
        def fetch(target: str) -> tuple[int, str]:
            if target.endswith("/health"):
                return 200, json.dumps({**health, "build": served["worker"]})
            if "/release.json" in target:
                return 200, json.dumps({"build": served["frontend"]})
            if "/release?" in target:
                return 200, json.dumps({"build": served["backend"]})
            if target.endswith("/"):
                return root_status, ""
            return 404, ""
        return fetch

    quiet = lambda _seconds: None  # noqa: E731
    all_new = {"backend": sha, "frontend": sha, "worker": sha}
    assert wait_for_surfaces(sha, list(SURFACES), attempts=1, interval=0, fetch=fake(all_new), sleep=quiet)
    assert not wait_for_surfaces(sha, list(SURFACES), attempts=2, interval=0,
                                 fetch=fake({**all_new, "worker": other}), sleep=quiet)
    assert wait_for_surfaces(sha, ["frontend"], attempts=1, interval=0,
                             fetch=fake({**all_new, "backend": other}), sleep=quiet)
    assert not wait_for_surfaces(sha, ["frontend"], attempts=1, interval=0,
                                 fetch=fake(all_new, root_status=503), sleep=quiet, root=True)
    # A Worker serving the SHA but with broken routing is not converged.
    broken = lambda target: (200, json.dumps({**health, "models": {}})) if target.endswith("/health") else fake(all_new)(target)  # noqa: E731
    assert not observe("worker", sha, broken)[0]
    # Converges on a later attempt.
    calls = {"n": 0}

    def late(target: str) -> tuple[int, str]:
        calls["n"] += 1
        return fake(all_new if calls["n"] > 3 else {**all_new, "backend": other})(target)
    assert wait_for_surfaces(sha, list(SURFACES), attempts=3, interval=0, fetch=late, sleep=quiet)

    assert build_of("not json") == "unreadable" and build_of("{}") == "missing"
    tmp = pathlib.Path(os.environ.get("RUNNER_TEMP") or "/tmp") / "staging-generation-selftest.json"
    tmp.write_text(json.dumps({"build": sha.upper()}), encoding="utf-8")
    assert dist_identity(sha, tmp) and not dist_identity(other, tmp)
    assert not dist_identity(sha, tmp.with_suffix(".missing"))

    class Done:
        def __init__(self, out: str) -> None:
            self.stdout = out
    assert current_main(lambda *a, **k: Done(f"{sha}\trefs/heads/main\n")) == sha
    try:
        current_main(lambda *a, **k: Done(""))
        raise AssertionError("main vacío debería fallar")
    except GenerationError:
        pass

    committed = lambda body: (lambda _target: (200, body))  # noqa: E731
    assert watch_committed(sha, attempts=2, interval=0, main_every=8, fetch=committed(sha + "\n"),
                           accredited=lambda: True, main_head=lambda: sha, sleep=quiet)
    assert not watch_committed(sha, attempts=2, interval=0, main_every=8, fetch=committed(sha),
                               accredited=lambda: False, main_head=lambda: sha, sleep=quiet)
    seen = {"n": 0}

    def head() -> str:
        seen["n"] += 1
        return other
    assert not watch_committed(sha, attempts=20, interval=0, main_every=2, fetch=committed(other),
                               accredited=lambda: True, main_head=head, sleep=quiet)
    assert seen["n"] == 1, "un main nuevo corta la espera en la primera comprobación"
    try:
        valid_sha("abc")
        raise AssertionError("SHA corto debería fallar")
    except GenerationError:
        pass
    print("staging-generation self-test OK")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--self-test", action="store_true")
    sub = parser.add_subparsers(dest="command")
    p = sub.add_parser("main-head")
    p.add_argument("--sha", required=True)
    p.add_argument("--github-output")
    p = sub.add_parser("dist-identity")
    p.add_argument("--sha", required=True)
    p.add_argument("--path", default="frontend/dist/release.json")
    p = sub.add_parser("wait")
    p.add_argument("--sha", required=True)
    p.add_argument("--surfaces", required=True)
    p.add_argument("--attempts", type=int, default=60)
    p.add_argument("--interval", type=float, default=5.0)
    p.add_argument("--root", action="store_true", help="exige también HTTP 200 en la raíz del frontend")
    p = sub.add_parser("watch-committed")
    p.add_argument("--sha", required=True)
    p.add_argument("--attempts", type=int, default=48)
    p.add_argument("--interval", type=float, default=1.0)
    p.add_argument("--main-every", type=int, default=8)
    p.add_argument("--github-output")
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0
    try:
        if args.command == "main-head":
            sha = valid_sha(args.sha)
            head = current_main()
            superseded = head != sha
            if superseded:
                print(f"::notice title=Staging superseded::{sha} != main {head}; sin mutación.")
            write_output(args.github_output, superseded=str(superseded).lower(), current_main=head)
            return 0
        if args.command == "dist-identity":
            return 0 if dist_identity(valid_sha(args.sha), pathlib.Path(args.path)) else 1
        if args.command == "wait":
            surfaces = [s.strip() for s in args.surfaces.split(",") if s.strip()]
            unknown = sorted(set(surfaces) - set(SURFACES))
            if not surfaces or unknown:
                raise GenerationError(f"superficies inválidas: {args.surfaces}")
            ok = wait_for_surfaces(valid_sha(args.sha), surfaces, attempts=args.attempts,
                                   interval=args.interval, root=args.root)
            return 0 if ok else 1
        if args.command == "watch-committed":
            sha = valid_sha(args.sha)
            converged = watch_committed(
                sha, attempts=args.attempts, interval=args.interval, main_every=args.main_every,
                fetch=lambda target: http_fetch(target, accept="text/plain", timeout=2.0),
                accredited=lambda: backend_accredited(sha), main_head=current_main,
            )
            if converged:
                print(f"::notice title=OCI zero-cost fast-path::{sha} acreditado completamente por watcher.")
            else:
                print("::warning title=OCI fallback::Watcher no quedó acreditado; uso Run Command.")
            write_output(args.github_output, converged=str(converged).lower())
            return 0
        parser.print_help()
        return 2
    except GenerationError as exc:
        print(f"::error::{exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
