#!/usr/bin/env python3
"""Wait for an in-flight PR Quality gate instead of false-failing main admission.

The existing fail-closed admission logic remains authoritative. This wrapper only
handles the race where a PR is merged while its matching ``Quality · CI gate``
workflow is still running. Staging waits for that exact run to finish. If it goes
green, the existing provenance/base/check validation is reused; if it goes red,
admission still fails. A newer main SHA is cancelled by workflow concurrency,
which gives obsolete runs the desired superseded semantics.
"""
from __future__ import annotations

import os
import sys
import time
from typing import Any
from urllib.parse import quote

import main_ci_admission as admission

DEFAULT_ATTEMPTS = 25
DEFAULT_SLEEP_SECONDS = 12.0


def matching_pending_quality_runs(
    workflow_runs: list[dict[str, Any]],
    *,
    head_sha: str,
) -> list[dict[str, Any]]:
    target = head_sha.lower()
    return [
        run
        for run in workflow_runs
        if run.get("event") == "pull_request"
        and run.get("name") == admission.QUALITY_WORKFLOW
        and run.get("path") == admission.QUALITY_PATH
        and str(run.get("head_sha") or "").lower() == target
        and run.get("status") != "completed"
    ]


def pending_quality_runs_for_current_main() -> list[dict[str, Any]]:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    main_sha = os.environ.get("GITHUB_SHA", "").strip().lower()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not repo or "/" not in repo:
        raise admission.AdmissionError("GITHUB_REPOSITORY ausente o inválido")
    if len(main_sha) != 40:
        raise admission.AdmissionError("GITHUB_SHA debe ser un SHA completo")
    if not token:
        raise admission.AdmissionError("GITHUB_TOKEN ausente")

    owner, repo_name = repo.split("/", 1)
    base = f"/repos/{quote(owner)}/{quote(repo_name)}"
    pulls = admission.api_get(f"{base}/commits/{main_sha}/pulls", token)
    if not isinstance(pulls, list):
        raise admission.AdmissionError("respuesta inesperada al buscar PR asociado")

    candidates = [
        pr
        for pr in pulls
        if pr.get("merged_at")
        and str(pr.get("merge_commit_sha") or "").lower() == main_sha
        and (pr.get("base") or {}).get("ref") == "main"
    ]
    if len(candidates) != 1:
        return []

    head_sha = str((candidates[0].get("head") or {}).get("sha") or "").lower()
    if len(head_sha) != 40:
        return []

    payload = admission.api_get(
        f"{base}/actions/workflows/cicd.yml/runs?event=pull_request&head_sha={quote(head_sha)}&per_page=20",
        token,
    )
    runs = (payload or {}).get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise admission.AdmissionError("respuesta inesperada al buscar Quality · CI gate del PR")
    return matching_pending_quality_runs(runs, head_sha=head_sha)


def normalize_premerge_started_green_runs(
    *,
    main_sha: str,
    pulls: list[dict[str, Any]],
    workflow_runs: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[int]]:
    """Allow a Quality run to finish green after merge only if it started before it.

    The legacy evaluator used ``updated_at <= merged_at`` to require CI to be
    green before merge. Main admission itself is the deployment barrier, so an
    already-running Quality may safely finish afterwards: staging simply waits.
    Runs started after merge are never normalized and remain ineligible.
    """
    candidates = [
        pr
        for pr in pulls
        if pr.get("merged_at")
        and str(pr.get("merge_commit_sha") or "").lower() == main_sha.lower()
        and (pr.get("base") or {}).get("ref") == "main"
    ]
    if len(candidates) != 1:
        return workflow_runs, []

    merged_at = admission.parse_time(str(candidates[0].get("merged_at") or ""))
    merged_iso = merged_at.isoformat().replace("+00:00", "Z")
    normalized: list[dict[str, Any]] = []
    late_green_ids: list[int] = []

    for run in workflow_runs:
        copy = dict(run)
        if run.get("status") == "completed" and run.get("conclusion") == "success":
            created_at = admission.parse_time(str(run.get("created_at") or ""))
            updated_at = admission.parse_time(str(run.get("updated_at") or ""))
            if created_at <= merged_at < updated_at:
                copy["updated_at"] = merged_iso
                late_green_ids.append(int(run.get("id") or 0))
        normalized.append(copy)

    return normalized, [run_id for run_id in late_green_ids if run_id]


def run_live_with_waited_green_policy() -> admission.Admission:
    """Reuse the original live admission with one narrow timing-policy adapter."""
    original_evaluator = admission.evaluate_admission

    def deployment_evaluator(**kwargs: Any) -> admission.Admission:
        normalized_runs, late_green_ids = normalize_premerge_started_green_runs(
            main_sha=str(kwargs["main_sha"]),
            pulls=list(kwargs["pulls"]),
            workflow_runs=list(kwargs["workflow_runs"]),
        )
        if late_green_ids:
            print(
                "Main admission waited-for-green · Quality terminó después del merge "
                f"pero ya estaba en vuelo (runs {','.join(map(str, late_green_ids))})"
            )
        return original_evaluator(**{**kwargs, "workflow_runs": normalized_runs})

    admission.evaluate_admission = deployment_evaluator
    try:
        return admission.run_live()
    finally:
        admission.evaluate_admission = original_evaluator


def positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


def positive_float_env(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


def print_admission_ok(result: admission.Admission) -> None:
    reuse = " · disjoint-main reuse" if result.concurrency_reused else ""
    print(
        f"Main admission OK · PR #{result.pr_number} · head {result.pr_head_sha[:12]} · "
        f"Quality run {result.quality_run_id} · tested merge {result.tested_merge_sha[:12]}{reuse}"
    )


def wait_for_admission() -> int:
    attempts = positive_int_env("MAIN_ADMISSION_WAIT_ATTEMPTS", DEFAULT_ATTEMPTS)
    sleep_seconds = positive_float_env("MAIN_ADMISSION_WAIT_SECONDS", DEFAULT_SLEEP_SECONDS)

    for attempt in range(1, attempts + 1):
        try:
            result = run_live_with_waited_green_policy()
        except admission.AdmissionError as exc:
            try:
                pending = pending_quality_runs_for_current_main()
            except admission.AdmissionError as probe_exc:
                print(
                    f"MAIN ADMISSION FAIL: {exc} · no se pudo comprobar Quality pendiente: {probe_exc}",
                    file=sys.stderr,
                )
                return 2

            if not pending:
                print(f"MAIN ADMISSION FAIL: {exc}", file=sys.stderr)
                return 2

            run_ids = ",".join(str(run.get("id") or "?") for run in pending)
            if attempt >= attempts:
                waited = int((attempts - 1) * sleep_seconds)
                print(
                    f"MAIN ADMISSION FAIL: Quality sigue pendiente tras ~{waited}s "
                    f"(runs {run_ids}); último diagnóstico: {exc}",
                    file=sys.stderr,
                )
                return 2

            print(
                f"Main admission WAIT · Quality aún activo (runs {run_ids}) · "
                f"intento {attempt}/{attempts}; reintento en {sleep_seconds:g}s"
            )
            time.sleep(sleep_seconds)
            continue

        print_admission_ok(result)
        return 0

    return 2


def self_test() -> None:
    head = "c" * 40
    base_run = {
        "id": 10,
        "event": "pull_request",
        "name": admission.QUALITY_WORKFLOW,
        "path": admission.QUALITY_PATH,
        "head_sha": head,
        "created_at": "2026-09-04T22:20:13Z",
        "updated_at": "2026-09-04T22:26:13Z",
    }
    assert [run["id"] for run in matching_pending_quality_runs(
        [{**base_run, "status": "queued"}, {**base_run, "id": 11, "status": "in_progress"}],
        head_sha=head,
    )] == [10, 11]
    assert matching_pending_quality_runs(
        [{**base_run, "status": "completed", "conclusion": "failure"}],
        head_sha=head,
    ) == []
    assert matching_pending_quality_runs(
        [{**base_run, "status": "in_progress", "head_sha": "d" * 40}],
        head_sha=head,
    ) == []

    pulls = [{
        "merged_at": "2026-09-04T22:24:13Z",
        "merge_commit_sha": "b" * 40,
        "base": {"ref": "main"},
    }]
    normalized, late_ids = normalize_premerge_started_green_runs(
        main_sha="b" * 40,
        pulls=pulls,
        workflow_runs=[{**base_run, "status": "completed", "conclusion": "success"}],
    )
    assert late_ids == [10]
    assert normalized[0]["updated_at"] == "2026-09-04T22:24:13Z"

    post_merge, late_ids = normalize_premerge_started_green_runs(
        main_sha="b" * 40,
        pulls=pulls,
        workflow_runs=[{
            **base_run,
            "status": "completed",
            "conclusion": "success",
            "created_at": "2026-09-04T22:24:14Z",
        }],
    )
    assert late_ids == []
    assert post_merge[0]["updated_at"] == base_run["updated_at"]

    print(
        "main-ci-admission-wait self-test OK · queued/in-progress retried; "
        "pre-merge-started late green is deploy-eligible; post-merge reruns are not"
    )


def main() -> int:
    if "--self-test" in sys.argv:
        self_test()
        return 0
    return wait_for_admission()


if __name__ == "__main__":
    raise SystemExit(main())
