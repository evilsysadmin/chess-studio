#!/usr/bin/env python3
"""Static/live preflight for the optional Cloudflare Workers AI narrator."""
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
CI_WORKFLOW = ROOT / ".github/workflows/cicd.yml"
PROMOTION_WORKFLOW = ROOT / ".github/workflows/production-promote.yml"
ROLLBACK_WORKFLOW = ROOT / ".github/workflows/production-rollback.yml"
PAGES_HELPER = ROOT / "scripts/cloudflare_production_pages.py"

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
    ci = CI_WORKFLOW.read_text(encoding="utf-8")
    if not PROMOTION_WORKFLOW.exists():
        return ["pipeline: falta .github/workflows/production-promote.yml"]
    if not ROLLBACK_WORKFLOW.exists():
        return ["pipeline: falta .github/workflows/production-rollback.yml"]
    if not PAGES_HELPER.exists():
        return ["pipeline: falta scripts/cloudflare_production_pages.py"]
    promotion = PROMOTION_WORKFLOW.read_text(encoding="utf-8")
    rollback = ROLLBACK_WORKFLOW.read_text(encoding="utf-8")
    pages_helper = PAGES_HELPER.read_text(encoding="utf-8")

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
        "training_plan",
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

    # CI is quality-only. Production changes are forbidden here so a main push
    # cannot bypass the deployed staging + Workers AI accreditation chain.
    require(ci, "  preflight:\n", "CI contains Preflight job", errors)
    for job in ("frontend", "backend", "security", "e2e"):
        require(ci, f"  {job}:\n", f"CI contains parallel {job} job", errors)
        require(ci, "needs: preflight", f"CI {job} waits for preflight", errors)
    for forbidden in (
        "  terraform:\n",
        "  pages:\n",
        "Cloudflare Worker · Terraform",
        "actions/deploy-pages@",
        "RENDER_API_KEY",
    ):
        if forbidden in ci:
            errors.append(f"CI quality-only contiene despliegue de producción: {forbidden!r}")
    if "workflow_run:" in ci:
        errors.append("CI principal no debe usar workflow_run; staging lo encadena después del quality gate")

    # Promotion must be provenance-bound to the staging AI workflow, use the
    # exact accredited SHA everywhere and serialize Worker -> backend -> frontend.
    for needle, label in (
        ("name: Production · promote", "promotion workflow name"),
        ("workflow_run:", "promotion workflow_run trigger"),
        ("Staging · AI Worker", "promotion staging AI source"),
        ("github.event.workflow_run.conclusion == 'success'", "promotion requires successful staging AI"),
        ("github.event.workflow_run.event == 'workflow_run'", "promotion rejects manual AI runs"),
        ('DEPLOY_SHA: ${{ github.event.workflow_run.head_sha }}', "promotion exact source SHA"),
        ("Gate · staging accredited SHA", "promotion staging gate"),
        ("Require current main before starting promotion", "promotion stale-start guard"),
        ("git ls-remote --exit-code origin refs/heads/main", "promotion compares accredited SHA to main"),
        ("Verify staging backend still serves approved SHA", "promotion rechecks staging backend"),
        ("Verify staging frontend still serves approved SHA", "promotion rechecks staging frontend"),
        ("Verify staging AI health contract", "promotion rechecks staging AI"),
        ("Production · Cloudflare Worker", "promotion Worker stage"),
        ("Production · Render backend", "promotion Render stage"),
        ("needs: cloudflare", "Render waits for Worker"),
        ('python3 scripts/render_production_deploy.py --sha "$DEPLOY_SHA"', "Render exact commit deploy"),
        ("Verify production backend readiness and build identity", "Render live identity gate"),
        ("Production · Cloudflare Pages", "promotion frontend stage"),
        ("needs: backend", "Pages waits for backend"),
        ('ref: ${{ env.DEPLOY_SHA }}', "promotion checkouts exact SHA"),
        ('VITE_BUILD_SHA: ${{ env.DEPLOY_SHA }}', "Pages exposes promoted SHA"),
        ("cloudflare_production_pages.py prepare", "Pages project prepared before deploy"),
        ('--project-name chess-studio-production', "Pages direct upload project"),
        ('--commit-hash "$DEPLOY_SHA"', "Pages direct upload provenance"),
        ("Verify Pages origin before public cutover", "Pages origin gate before cutover"),
        ("cloudflare_production_pages.py activate", "Pages public cutover"),
        ("Verify production frontend build identity", "Pages live identity gate"),
    ):
        require(promotion, needle, label, errors)

    # The helper, not Terraform, owns production frontend DNS so it can enforce
    # verify-before-cutover. The direct Pages origin is deployed first; only then
    # may the public CNAME/custom-domain be reconciled.
    for needle, label in (
        ('PAGES_PROJECT = "chess-studio-production"', "Pages production project"),
        ('PAGES_HOSTNAME = "chess-studio.shadowops.dpdns.org"', "Pages public hostname"),
        ('PAGES_TARGET = f"{PAGES_PROJECT}.pages.dev"', "Pages direct origin"),
        ('phase not in {"prepare", "activate"}', "Pages explicit two-phase helper"),
        ('if phase == "prepare"', "Pages prepare phase"),
        ('domain = ensure_pages_domain()', "Pages custom-domain activation"),
        ('dns = ensure_pages_cname(zone_id)', "Pages DNS activation"),
        ('"proxied": True', "Pages public hostname proxied through Cloudflare"),
    ):
        require(pages_helper, needle, label, errors)
    if 'resource "cloudflare_dns_record" "github_pages"' in tf_main:
        errors.append("terraform: frontend DNS no debe seguir ligado a GitHub Pages")
    if 'evilsysadmin.github.io' in promotion:
        errors.append("promotion: referencia obsoleta a GitHub Pages")

    # First deploys have no Worker/Custom Domain to import. Promotion must
    # discover existing resources and import only those that exist; swallowing
    # Terraform import errors would hide real authentication/provider failures.
    require(promotion, 'Probe existing Cloudflare Worker state', "promotion state probe", errors)
    require(promotion, "steps.cf_state.outputs.worker_exists == 'true'", "promotion conditional Worker import", errors)
    require(promotion, "steps.cf_state.outputs.subdomain_exists == 'true'", "promotion conditional workers.dev import", errors)
    require(promotion, "steps.cf_state.outputs.custom_domain_exists == 'true'", "promotion conditional Custom Domain import", errors)
    require(promotion, 'CUSTOM_DOMAIN: ai.shadowops.dpdns.org', "promotion Custom Domain", errors)
    require(promotion, '/workers/domains', "promotion Workers Domains API", errors)
    require(promotion, 'cloudflare_workers_custom_domain.narrative_ai', "promotion Custom Domain Terraform import", errors)
    require(promotion, '- name: Verify Custom Domain and health', "promotion Custom Domain health step", errors)
    require(promotion, 'for attempt in {1..60}', "promotion propagation retry", errors)
    require(promotion, 'health_contract="$GITHUB_WORKSPACE/scripts/cloudflare_health_contract.py"', "promotion shared health contract path", errors)
    require(promotion, 'python3 "$health_contract" "$health_body"', "promotion shared health invocation", errors)

    # Rollback is deliberately a runtime rollback, never a generic infra rewind.
    # It is manual, serializes with normal promotion, and only accepts a SHA that
    # GitHub records as a prior successful automatic production promotion. The
    # sole infrastructure reconciliation permitted is the already-known Pages
    # custom domain/CNAME, after the rollback SHA is verified on pages.dev.
    for needle, label in (
        ("name: Production · rollback", "rollback workflow name"),
        ("workflow_dispatch:", "rollback manual trigger"),
        ("target_sha:", "rollback explicit target"),
        ("Escribe ROLLBACK", "rollback explicit confirmation"),
        ("actions: read", "rollback promotion-history permission"),
        ("group: chess-studio-production-promote", "rollback serializes with promotion"),
        ("Gate · known-good production SHA", "rollback known-good gate"),
        ("Verify rollback SHA was previously promoted successfully", "rollback provenance check"),
        ("actions/workflows/production-promote.yml/runs", "rollback reads promotion history"),
        ("event=workflow_run", "rollback only trusts automatic promotions"),
        ("compare/$DEPLOY_SHA...$ORCHESTRATOR_SHA", "rollback requires main ancestry"),
        ("Rollback · Cloudflare Worker", "rollback Worker stage"),
        ("--keep-vars", "rollback preserves Worker variables"),
        ("workers_dev = false", "rollback keeps workers.dev disabled"),
        ("El rollback no acepta un wrangler.toml que administre rutas/domains", "rollback refuses Worker route ownership"),
        ("Rollback · Render backend", "rollback Render stage"),
        ('render_production_deploy.py --sha "$DEPLOY_SHA"', "rollback exact Render SHA"),
        ("Rollback · Cloudflare Pages", "rollback frontend stage"),
        ('path: rollback-source', "rollback builds exact historical source"),
        ('VITE_BUILD_SHA: ${{ env.DEPLOY_SHA }}', "rollback frontend exact SHA"),
        ('--project-name chess-studio-production', "rollback uses current Pages project"),
        ("Verify Pages origin rollback identity", "rollback Pages origin gate"),
        ("Reconcile production Pages domain and DNS", "rollback scoped Pages domain reconciliation"),
        ("cloudflare_production_pages.py activate", "rollback current Pages helper"),
        ("Verify production frontend rollback identity", "rollback live frontend identity"),
    ):
        require(rollback, needle, label, errors)

    for forbidden in (
        "terraform apply",
        "terraform plan",
        "cloudflare_dns_record",
        "workers/domains",
    ):
        if forbidden in rollback:
            errors.append(f"rollback no debe modificar infraestructura genérica: {forbidden!r}")

    for obsolete in (ROOT / ".github/workflows/terraform-cloudflare.yml", ROOT / ".github/workflows/static.yml"):
        if obsolete.exists():
            errors.append(f"pipeline: workflow de producción obsoleto todavía existe: {obsolete.name}")

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

    require(tf_main, 'resource "cloudflare_workers_custom_domain" "narrative_ai"', "terraform Custom Domain", errors)
    require(tf_main, 'hostname   = var.custom_domain_hostname', "terraform Custom Domain hostname", errors)
    require(tf_main, 'zone_name  = var.custom_domain_zone_name', "terraform Custom Domain zone", errors)
    require(tf_main, 'enabled          = false', "terraform workers.dev disabled", errors)

    forbidden_promotion = (
        '- name: Ensure account workers.dev namespace',
        'desired_subdomain="chess-studio-$suffix"',
        'subdomain.get("url")',
        'actions/deploy-pages@',
        'actions/configure-pages@',
    )
    for needle in forbidden_promotion:
        if needle in promotion:
            errors.append(f"promotion: lógica obsoleta presente: {needle}")

    if 'terraform import cloudflare_workers_script.narrative_ai' in promotion and 'narrative_ai "$TF_VAR_cloudflare_account_id/$WORKER_NAME" || true' in promotion:
        errors.append("promotion: terraform import no debe ocultar errores con || true")

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
