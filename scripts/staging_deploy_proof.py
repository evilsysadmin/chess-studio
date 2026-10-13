#!/usr/bin/env python3
"""Prove that an upstream Deploy to staging run actually completed a full generation."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUIRED_JOBS = (
    "Prepare coherent staging generation",
    "Backend · exact OCI generation",
    "Frontend · exact Pages generation",
    "Worker · exact AI generation",
    "Browser smoke · War Room live",
    "Browser smoke · authoritative F5 restore",
    "Staging generation complete",
)


def deployed_generation(jobs: list[dict]) -> bool:
    conclusions = {
        str(job.get("name") or ""): str(job.get("conclusion") or "")
        for job in jobs
        if isinstance(job, dict)
    }
    return all(conclusions.get(name) == "success" for name in REQUIRED_JOBS)


def fetch_jobs(repository: str, run_id: int, token: str) -> list[dict]:
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    request = Request(
        f"{api}/repos/{repository}/actions/runs/{run_id}/jobs?per_page=100",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    # The upstream generation has already completed; transient GitHub API
    # failures must not turn a green deploy into a spurious accreditation fail.
    # Never retry authorization failures or malformed evidence. Still fail closed
    # after a small, bounded number of attempts (no synthetic green proof).
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.load(response)
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        else:
            jobs = payload.get("jobs") if isinstance(payload, dict) else None
            if not isinstance(jobs, list):
                raise RuntimeError("GitHub jobs payload inválido")
            return jobs
        time.sleep(1 << attempt)
    raise AssertionError("unreachable")


def write_output(path: str, deployed: bool) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"deployed={'true' if deployed else 'false'}\n")


def self_test() -> None:
    green = [{"name": name, "conclusion": "success"} for name in REQUIRED_JOBS]
    assert deployed_generation(green)
    assert not deployed_generation(green[:-1])
    failed = [dict(row) for row in green]
    failed[1]["conclusion"] = "skipped"
    assert not deployed_generation(failed)

    # No network/sleep: prove 502 recovery, bounded exhaustion, fail-fast 403,
    # and no retry of malformed accreditation evidence.
    from io import BytesIO
    from unittest.mock import patch

    def http_error(code: int) -> HTTPError:
        return HTTPError("https://api.github.com/jobs", code, "test", None, None)

    valid_response = json.dumps({"jobs": green}).encode("utf-8")
    with patch(f"{__name__}.urlopen", side_effect=[http_error(502), BytesIO(valid_response)]) as get, \
            patch(f"{__name__}.time.sleep") as sleep:
        assert fetch_jobs("owner/repo", 1, "test-token") == green
        assert get.call_count == 2
        sleep.assert_called_once_with(1)
    with patch(f"{__name__}.urlopen", side_effect=http_error(503)) as get, \
            patch(f"{__name__}.time.sleep") as sleep:
        try:
            fetch_jobs("owner/repo", 1, "test-token")
        except HTTPError as exc:
            assert exc.code == 503
        else:
            raise AssertionError("transient failures must fail closed after retries")
        assert get.call_count == 3
        assert sleep.call_count == 2
    with patch(f"{__name__}.urlopen", side_effect=http_error(403)) as get, \
            patch(f"{__name__}.time.sleep") as sleep:
        try:
            fetch_jobs("owner/repo", 1, "test-token")
        except HTTPError as exc:
            assert exc.code == 403
        else:
            raise AssertionError("403 must fail immediately")
        get.assert_called_once()
        sleep.assert_not_called()
    with patch(f"{__name__}.urlopen", return_value=BytesIO(b'{"jobs": {}}')) as get, \
            patch(f"{__name__}.time.sleep") as sleep:
        try:
            fetch_jobs("owner/repo", 1, "test-token")
        except RuntimeError:
            pass
        else:
            raise AssertionError("malformed evidence must fail closed")
        get.assert_called_once()
        sleep.assert_not_called()
    print("staging-deploy-proof self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not repository or not token or not args.run_id:
        raise SystemExit("repository/token/run-id requeridos")
    deployed = deployed_generation(fetch_jobs(repository, args.run_id, token))
    write_output(args.github_output, deployed)
    if deployed:
        print(f"staging deploy proof OK · run {args.run_id}")
    else:
        print(f"::notice title=Staging no-op::Run {args.run_id} no desplegó una generación completa; no se acreditará.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
