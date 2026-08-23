#!/usr/bin/env python3
"""Static/live preflight for the optional Cloudflare Workers AI narrator.

No secrets are required for the default static check.  Pass --worker-url after a
real deploy to verify the public /health endpoint without invoking the model.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKER = ROOT / "infra/cloudflare/worker/index.js"
WRANGLER = ROOT / "infra/cloudflare/wrangler.toml"
TF_MAIN = ROOT / "infra/cloudflare/main.tf"
BACKEND = ROOT / "backend-python/narrative_cloudflare.py"
FRONTEND_REMOTE = ROOT / "frontend/src/narrativeRemote.js"
WORKFLOW = ROOT / ".github/workflows/terraform-cloudflare.yml"

EXPECTED_MODEL = "@cf/meta/llama-3.2-3b-instruct"


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def static_check() -> list[str]:
    errors: list[str] = []
    worker = WORKER.read_text(encoding="utf-8")
    wrangler = WRANGLER.read_text(encoding="utf-8")
    tf_main = TF_MAIN.read_text(encoding="utf-8")
    backend = BACKEND.read_text(encoding="utf-8")
    frontend = FRONTEND_REMOTE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for needle in (
        'env.AI.run(',
        'env.AI_RATE_LIMITER.limit(',
        'CHESS_AI_SHARED_SECRET',
        'x-chess-ai-timestamp',
        'x-chess-ai-signature',
        'timingSafeHexEqual',
        'MAX_BODY_BYTES',
        '"/health"',
    ):
        require(worker, needle, "worker", errors)

    require(worker, EXPECTED_MODEL, "worker model", errors)
    require(wrangler, '[ai]', "wrangler", errors)
    require(wrangler, 'binding = "AI"', "wrangler", errors)
    require(wrangler, '[[ratelimits]]', "wrangler", errors)
    require(wrangler, 'name = "AI_RATE_LIMITER"', "wrangler", errors)

    require(tf_main, 'type = "ai"', "terraform AI binding", errors)
    require(tf_main, 'type         = "ratelimit"', "terraform rate limit binding", errors)
    require(tf_main, 'keep_bindings', "terraform secret preservation", errors)

    for needle in ('CF_AI_WORKER_URL', 'CHESS_AI_SHARED_SECRET', 'sign_request(', 'validate_grounded_output('):
        require(backend, needle, "backend", errors)

    # Secrets and workers.dev must stay server-side; browser talks only to FastAPI.
    forbidden_frontend = ('CHESS_AI_SHARED_SECRET', 'CF_AI_WORKER_URL', 'workers.dev')
    for needle in forbidden_frontend:
        if needle in frontend:
            errors.append(f"frontend: secreto/Worker directo expuesto: {needle}")
    require(frontend, '/narrative', "frontend FastAPI route", errors)

    # First deploys have no Worker to import. The workflow must probe Cloudflare
    # and import only resources that already exist; swallowing terraform import
    # errors with `|| true` hides authentication/provider failures.
    require(workflow, 'Probe existing Cloudflare Worker state', "workflow state probe", errors)
    require(workflow, "steps.cf_state.outputs.worker_exists == 'true'", "workflow conditional Worker import", errors)
    require(workflow, "steps.cf_state.outputs.subdomain_exists == 'true'", "workflow conditional subdomain import", errors)
    require(workflow, 'desired_subdomain="chess-studio-$suffix"', "workflow account workers.dev bootstrap", errors)
    require(workflow, '- name: Ensure account workers.dev namespace', "workflow account workers.dev bootstrap step", errors)
    require(workflow, '-X PUT', "workflow account workers.dev create", errors)
    require(workflow, 'for attempt in {1..12}', "workflow health propagation retry", errors)
    require(workflow, 'workers/workers/$WORKER_NAME', "workflow canonical Worker details API", errors)
    require(workflow, 'subdomain.get("url")', "workflow canonical workers.dev URL", errors)
    require(workflow, 'result.get("deployed_on")', "workflow deployment-state check", errors)
    require(workflow, 'Health HTTP ${health_status:-curl-error}', "workflow diagnosable live health", errors)
    if 'terraform import cloudflare_workers_script.narrative_ai' in workflow and 'narrative_ai "$TF_VAR_cloudflare_account_id/$WORKER_NAME" || true' in workflow:
        errors.append("workflow: terraform import no debe ocultar errores con || true")

    return errors


def live_health(worker_url: str) -> list[str]:
    errors: list[str] = []
    url = worker_url.rstrip("/") + "/health"
    request = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "chess-studio-cf-ai-preflight/1"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if response.status != 200:
                errors.append(f"health: HTTP {response.status}")
            if payload.get("ok") is not True:
                errors.append("health: payload no indica ok=true")
            if payload.get("service") != "chess-studio-narrative-ai":
                errors.append(f"health: servicio inesperado {payload.get('service')!r}")
            if payload.get("model") != EXPECTED_MODEL:
                errors.append(f"health: modelo inesperado {payload.get('model')!r}")
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        errors.append(f"health: no se pudo verificar {url}: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-url", help="URL workers.dev ya desplegada; activa check live de /health")
    args = parser.parse_args()

    errors = static_check()
    if args.worker_url:
        errors.extend(live_health(args.worker_url))

    if errors:
        print("Cloudflare Workers AI preflight: FAIL", file=sys.stderr)
        for item in errors:
            print(f" - {item}", file=sys.stderr)
        return 1

    mode = "static + live" if args.worker_url else "static"
    print(f"Cloudflare Workers AI preflight: OK ({mode})")
    print(f"model={EXPECTED_MODEL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
