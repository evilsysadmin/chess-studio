#!/usr/bin/env python3
"""Static/live preflight for the optional Cloudflare Workers AI narrator.

No secrets are required for the default static check. Pass --worker-url after a
real deploy to verify the public /health endpoint without invoking the model.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

from cloudflare_health_contract import EXPECTED_MODELS, EXPECTED_SERVICE, validate_health_payload

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKER = ROOT / "infra/cloudflare/worker/index.js"
WRANGLER = ROOT / "infra/cloudflare/wrangler.toml"
TF_MAIN = ROOT / "infra/cloudflare/main.tf"
BACKEND = ROOT / "backend-python/narrative_cloudflare.py"
FRONTEND_REMOTE = ROOT / "frontend/src/narrativeRemote.js"
WORKFLOW = ROOT / ".github/workflows/terraform-cloudflare.yml"

EXPECTED_COMMENT_MODEL = EXPECTED_MODELS["comments"]
EXPECTED_PORTRAIT_MODEL = EXPECTED_MODELS["player_portrait"]
EXPECTED_ANALYSIS_MODEL = EXPECTED_MODELS["analysis"]


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def require_pattern(text: str, pattern: str, label: str, errors: list[str]) -> None:
    if re.search(pattern, text) is None:
        errors.append(f"{label}: no cumple el patrón esperado {pattern!r}")


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
        'normalizeUsage',
        'firstChoice?.message?.content',
        'error_name: errorName',
        'const usage = normalizeUsage(result);',
        '"/health"',
    ):
        require(worker, needle, "worker", errors)

    require(worker, EXPECTED_COMMENT_MODEL, "worker comment model", errors)
    require(worker, EXPECTED_PORTRAIT_MODEL, "worker portrait model", errors)
    require(worker, EXPECTED_ANALYSIS_MODEL, "worker analysis model", errors)
    require(worker, "modelFor(eventType)", "worker model routing", errors)
    for voice_rule in (
        "Tutea siempre",
        "Sarcasmo juguetón",
        "Para player_portrait",
        "Para comentarios de partida",
        "exactamente 3 frases compactas",
        "usa una o dos cifras",
        "recomendación práctica",
        "una sola",
        "copia literalmente su nombre",
        "PLAYER_PORTRAIT_GENERATION",
        "temperature: 0.70",
        "max_tokens: 384",
        'qwenNoThink ? "/no_think" : ""',
        "post_game_autopsy",
        "combat_briefing",
        "combat_debrief",
        "observability_summary",
        "ANALYSIS_GENERATION",
    ):
        require(worker, voice_rule, "worker shared voice", errors)
    require(worker, "friendly_sarcastic", "worker tone", errors)
    require(wrangler, '[ai]', "wrangler", errors)
    require(wrangler, 'binding = "AI"', "wrangler", errors)
    require(wrangler, '[[ratelimits]]', "wrangler", errors)
    require(wrangler, 'name = "AI_RATE_LIMITER"', "wrangler", errors)

    require(tf_main, 'type = "ai"', "terraform AI binding", errors)
    require(tf_main, 'type         = "ratelimit"', "terraform rate limit binding", errors)
    require(tf_main, 'keep_bindings', "terraform secret preservation", errors)

    for needle in ('CF_AI_WORKER_URL', 'CHESS_AI_SHARED_SECRET', 'sign_request(', 'validate_grounded_output(', 'validate_player_portrait_contract(', 'portrait_contract_rejected:', 'estimated_neurons', 'request_kinds'):
        require(backend, needle, "backend", errors)

    # Secrets and the direct Worker origin must stay server-side; browser talks only to FastAPI.
    forbidden_frontend = ('CHESS_AI_SHARED_SECRET', 'CF_AI_WORKER_URL', 'ai.shadowops.dpdns.org', 'workers.dev')
    for needle in forbidden_frontend:
        if needle in frontend:
            errors.append(f"frontend: secreto/Worker directo expuesto: {needle}")
    require(frontend, '/narrative', "frontend FastAPI route", errors)

    # First deploys have no Worker/Custom Domain to import. The workflow must
    # discover existing resources and import only those that exist; swallowing
    # terraform import errors would hide real authentication/provider failures.
    require(workflow, 'Probe existing Cloudflare Worker state', "workflow state probe", errors)
    require(workflow, "steps.cf_state.outputs.worker_exists == 'true'", "workflow conditional Worker import", errors)
    require(workflow, "steps.cf_state.outputs.subdomain_exists == 'true'", "workflow conditional workers.dev settings import", errors)
    require(workflow, "steps.cf_state.outputs.custom_domain_exists == 'true'", "workflow conditional Custom Domain import", errors)
    require(workflow, 'CUSTOM_DOMAIN: ai.shadowops.dpdns.org', "workflow Custom Domain", errors)
    require(workflow, '/workers/domains', "workflow Workers Domains API", errors)
    require(workflow, 'cloudflare_workers_custom_domain.narrative_ai', "workflow Custom Domain Terraform import", errors)
    require(workflow, '- name: Verify Custom Domain and health', "workflow Custom Domain health step", errors)
    require(workflow, 'for attempt in {1..60}', "workflow TLS/health propagation retry", errors)
    require(workflow, 'Health HTTP ${health_status:-curl-error}', "workflow diagnosable live health", errors)
    # Deployment health uses the same executable contract as this preflight.
    # Do not inspect inline Python/YAML implementation details: that was brittle
    # and produced false CI failures for semantically equivalent workflows.
    require(workflow, 'python3 scripts/cloudflare_health_contract.py "$health_body"', "workflow shared health contract", errors)

    # Self-check the shared contract so a future edit cannot silently stop
    # requiring one of the routed models.
    expected_payload = {
        "ok": True,
        "service": EXPECTED_SERVICE,
        "model": EXPECTED_COMMENT_MODEL,
        "models": dict(EXPECTED_MODELS),
    }
    if validate_health_payload(expected_payload):
        errors.append("shared health contract: rechaza un payload válido")
    missing_analysis = {**expected_payload, "models": {k: v for k, v in EXPECTED_MODELS.items() if k != "analysis"}}
    if not validate_health_payload(missing_analysis):
        errors.append("shared health contract: no detecta routing analysis ausente")
    require(workflow, 'CF_AI_WORKER_URL=https://ai.shadowops.dpdns.org', "workflow Render handoff", errors)

    require(tf_main, 'resource "cloudflare_workers_custom_domain" "narrative_ai"', "terraform Custom Domain", errors)
    require(tf_main, 'hostname   = var.custom_domain_hostname', "terraform Custom Domain hostname", errors)
    require(tf_main, 'zone_name  = var.custom_domain_zone_name', "terraform Custom Domain zone", errors)
    require(tf_main, 'enabled          = false', "terraform workers.dev disabled", errors)

    forbidden_workflow = (
        '- name: Ensure account workers.dev namespace',
        'desired_subdomain="chess-studio-$suffix"',
        'subdomain.get("url")',
    )
    for needle in forbidden_workflow:
        if needle in workflow:
            errors.append(f"workflow: lógica workers.dev obsoleta presente: {needle}")

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
            errors.extend(f"health: {item}" for item in validate_health_payload(payload))
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        errors.append(f"health: no se pudo verificar {url}: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-url", help="URL pública del Worker ya desplegado; activa check live de /health")
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
    print(f"comments_model={EXPECTED_COMMENT_MODEL}")
    print(f"portrait_model={EXPECTED_PORTRAIT_MODEL}")
    print(f"analysis_model={EXPECTED_ANALYSIS_MODEL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
