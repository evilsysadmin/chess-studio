#!/usr/bin/env python3
"""Wait for an in-flight PR Quality gate instead of false-failing main admission.

The existing fail-closed admission logic remains authoritative. This wrapper only
handles the race where a PR is merged while its matching ``Quality · CI gate``
workflow is still running. Staging must wait for that exact immutable PR run to
finish; it may proceed only if that run becomes green and still proves the same
main composition.

If main advances while we wait, ``main-admission.yml`` uses ``cancel-in-progress``
so GitHub cancels the obsolete run: effectively ``superseded`` rather than red.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import os
import sys
import time
from typing import Any
from urllib.parse import quote

import main_ci_admission as admission

DEFAULT_ATTEMPTS = 25
DEFAULT_SLEEP_SECONDS = 12.0


@dataclass(frozen=True)
class QualityContext:
    api_base: str
    token: str
    main_sha: str
    first_parent: str
    first_parent_time: datetime
    pulls: list[dict[str, Any]]
    pr_number: int
    head_sha: str
    merged_at: datetime
    workflow_runs: list[dict[str, Any]]
    check_runs: list[dict[str, Any]]


def matching_quality_runs(
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
    ]


def pending_quality_runs(
    workflow_runs: list[dict[str, Any]],
    *,
    head_sha: str,
) -> list[dict[str, Any]]:
    return [
        run
        for run in matching_quality_runs(workflow_runs, head_sha=head_sha)
        if run.get("status") != "completed"
    ]


def load_quality_context() -> QualityContext:
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    main_sha = os.environ.get("GITHUB_SHA", "").strip().lower()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not repo or "/" not in repo:
        raise admission.AdmissionError("GITHUB_REPOSITORY ausente o inválido")
    if len(main_sha) != 40:
        raise admission.AdmissionError("GITHUB_SHA debe ser un SHA completo")
    if not token:
        raise admission.AdmissionError("GITHUB_TOKEN ausente")

    parents = admission.git_output("show", "-s", "--format=%P", main_sha).split()
    if not parents:
        raise admission.AdmissionError("main SHA no tiene padre; no se acredita un commit raíz")
    first_parent = parents[0].lower()
    first_parent_time = admission.parse_time(
        admission.git_output("show", "-s", "--format=%cI", first_parent)
    )

    owner, repo_name = repo.split("/", 1)
    api_base = f"/repos/{quote(owner)}/{quote(repo_name)}"
    pulls = admission.api_get(f"{api_base}/commits/{main_sha}/pulls", token)
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
        raise admission.AdmissionError(
            f"main {main_sha[:12]} no procede de un único PR mergeado a main"
        )

    pr = candidates[0]
    pr_number = int(pr.get("number") or 0)
    head_sha = str((pr.get("head") or {}).get("sha") or "").lower()
    if not pr_number or len(head_sha) != 40:
        raise admission.AdmissionError("el PR acreditado no expone número/head SHA completos")
    merged_at = admission.parse_time(str(pr.get("merged_at") or ""))

    runs_payload = admission.api_get(
        f"{api_base}/actions/workflows/cicd.yml/runs?event=pull_request&head_sha={quote(head_sha)}&per_page=20",
        token,
    )
    workflow_runs = (
        (runs_payload or {}).get("workflow_runs") if isinstance(runs_payload, dict) else None
    )
    if not isinstance(workflow_runs, list):
        raise admission.AdmissionError("respuesta inesperada al buscar Quality · CI gate del PR")

    checks_payload = admission.api_get(
        f"{api_base}/commits/{head_sha}/check-runs?per_page=100",
        token,
    )
    check_runs = (
        (checks_payload or {}).get("check_runs") if isinstance(checks_payload, dict) else None
    )
    if not isinstance(check_runs, list):
        raise admission.AdmissionError("respuesta inesperada al buscar checks del PR")

    return QualityContext(
        api_base=api_base,
        token=token,
        main_sha=main_sha,
        first_parent=first_parent,
        first_parent_time=first_parent_time,
        pulls=pulls,
        pr_number=pr_number,
        head_sha=head_sha,
        merged_at=merged_at,
        workflow_runs=workflow_runs,
        check_runs=check_runs,
    )


def normalize_late_green_run(
    run: dict[str, Any],
    *,
    merged_at: datetime,
) -> dict[str, Any] | None:
    """Adapt one run only when it was already in flight at merge and later passed.

    ``main_ci_admission.evaluate_admission`` historically encoded "CI had to be
    green before merge" as ``run.updated_at <= merged_at``. Main admission is now
    the deployment barrier, so a run that *started before merge* may finish green
    afterwards: deployment simply waits for it. Post-merge reruns are still not
    eligible.
    """
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        return None
    created_at = admission.parse_time(str(run.get("created_at") or ""))
    if created_at > merged_at:
        return None

    normalized = dict(run)
    updated_at = admission.parse_time(str(run.get("updated_at") or ""))
    if updated_at > merged_at:
        normalized["updated_at"] = merged_at.isoformat().replace("+00:00", "Z")
    return normalized


def late_green_admission(context: QualityContext) -> admission.Admission:
    """Reuse the original evaluator after waiting for a pre-merge-started run."""
    normalized_runs: list[dict[str, Any]] = []
    provenances: dict[int, dict[str, Any]] = {}
    compatible_runs: set[int] = set()

    for run in matching_quality_runs(context.workflow_runs, head_sha=context.head_sha):
        normalized = normalize_late_green_run(run, merged_at=context.merged_at)
        if normalized is None:
            continue
        run_id = int(run.get("id") or 0)
        if not run_id:
            continue

        provenance = admission.fetch_run_provenance(
            context.api_base,
            run_id,
            context.token,
        )
        if provenance is None:
            continue
        provenances[run_id] = provenance
        if not admission.provenance_identity_matches(
            provenance,
            pr_number=context.pr_number,
            head_sha=context.head_sha,
        ):
            continue

        provenance_base = str(provenance.get("base_sha") or "").lower()
        if provenance_base != context.first_parent:
            tested_merge_sha = str(provenance.get("tested_merge_sha") or "").lower()
            safe, pr_count, intervening_count = admission.disjoint_concurrency_proof(
                context.api_base,
                provenance_base,
                context.first_parent,
                tested_merge_sha,
                context.token,
            )
            if safe:
                compatible_runs.add(run_id)
                print(
                    f"Main admission concurrency proof OK · Quality run {run_id} · "
                    f"tested merge {tested_merge_sha[:12]} · "
                    f"base {provenance_base[:12]} -> parent {context.first_parent[:12]} · "
                    f"{pr_count} rutas PR / {intervening_count} rutas intermedias disjuntas"
                )

        normalized_runs.append(normalized)

    return admission.evaluate_admission(
        main_sha=context.main_sha,
        first_parent=context.first_parent,
        first_parent_time=context.first_parent_time,
        pulls=context.pulls,
        workflow_runs=normalized_runs,
        check_runs=context.check_runs,
        provenances=provenances,
        compatible_runs=compatible_runs,
    )


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


def print_admission_ok(result: admission.Admission, *, late_green: bool = False) -> None:
    reuse = " · disjoint-main reuse" if result.concurrency_reused else ""
    waited = " · waited-for-green" if late_green else ""
    print(
        f"Main admission OK · PR #{result.pr_number} · head {result.pr_head_sha[:12]} · "
        f"Quality run {result.quality_run_id} · tested merge {result.tested_merge_sha[:12]}"
        f"{reuse}{waited}"
    )


def wait_for_admission() -> int:
    attempts = positive_int_env("MAIN_ADMISSION_WAIT_ATTEMPTS", DEFAULT_ATTEMPTS)
    sleep_seconds = positive_float_env("MAIN_ADMISSION_WAIT_SECONDS", DEFAULT_SLEEP_SECONDS)

    for attempt in range(1, attempts + 1):
        try:
            result = admission.run_live()
        except admission.AdmissionError as original_exc:
            try:
                context = load_quality_context()
            except admission.AdmissionError as probe_exc:
                print(
                    f"MAIN ADMISSION FAIL: {original_exc} · no se pudo comprobar Quality: {probe_exc}",
                    file=sys.stderr,
                )
                return 2

            pending = pending_quality_runs(
                context.workflow_runs,
                head_sha=context.head_sha,
            )
            if pending:
                run_ids = ",".join(str(run.get("id") or "?") for run in pending)
                if attempt >= attempts:
                    waited = int((attempts - 1) * sleep_seconds)
                    print(
                        f"MAIN ADMISSION FAIL: Quality sigue pendiente tras ~{waited}s "
                        f"(runs {run_ids}); último diagnóstico: {original_exc}",
                        file=sys.stderr,
                    )
                    return 2
                print(
                    f"Main admission WAIT · Quality aún activo (runs {run_ids}) · "
                    f"intento {attempt}/{attempts}; reintento en {sleep_seconds:g}s"
                )
                time.sleep(sleep_seconds)
                continue

            try:
                late_result = late_green_admission(context)
            except admission.AdmissionError as late_exc:
                print(f"MAIN ADMISSION FAIL: {late_exc}", file=sys.stderr)
                return 2

            print_admission_ok(late_result, late_green=True)
            return 0

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
    assert [run["id"] for run in pending_quality_runs(
        [{**base_run, "status": "queued"}, {**base_run, "id": 11, "status": "in_progress"}],
        head_sha=head,
    )] == [10, 11]
    assert pending_quality_runs(
        [{**base_run, "status": "completed", "conclusion": "failure"}],
        head_sha=head,
    ) == []
    assert pending_quality_runs(
        [{**base_run, "status": "in_progress", "head_sha": "d" * 40}],
        head_sha=head,
    ) == []

    merged_at = admission.parse_time("2026-09-04T22:24:13Z")
    late_green = normalize_late_green_run(
        {**base_run, "status": "completed", "conclusion": "success"},
        merged_at=merged_at,
    )
    assert late_green is not None
    assert admission.parse_time(late_green["updated_at"]) == merged_at
    assert normalize_late_green_run(
        {
            **base_run,
            "status": "completed",
            "conclusion": "success",
            "created_at": "2026-09-04T22:24:14Z",
        },
        merged_at=merged_at,
    ) is None
    assert normalize_late_green_run(
        {**base_run, "status": "completed", "conclusion": "failure"},
        merged_at=merged_at,
    ) is None

    assert positive_int_env("__MISSING_MAIN_ADMISSION_INT__", 25) == 25
    assert positive_float_env("__MISSING_MAIN_ADMISSION_FLOAT__", 12.0) == 12.0
    print(
        "main-ci-admission-wait self-test OK · queued/in-progress retried; "
        "completed/wrong-head/wrong-workflow remain terminal; "
        "pre-merge-started late green is deploy-eligible, post-merge reruns are not"
    )


def main() -> int:
    if "--self-test" in sys.argv:
        self_test()
        return 0
    return wait_for_admission()


if __name__ == "__main__":
    raise SystemExit(main())
