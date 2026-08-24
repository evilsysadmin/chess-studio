# Makefile — atajos para levantar, probar y revisar Chess Studio.
# Puertos configurables: make game BACKEND_PORT=4001 FRONTEND_PORT=5174

COMPOSE := docker compose
PYTHON ?= python3
VENV := $(CURDIR)/.venv
VENV_PY := $(VENV)/bin/python
BACKEND_VENV_PY := $(VENV_PY)
FRONTEND_VITEST := ./node_modules/.bin/vitest
TRIVY := .tools/trivy
SECURITY_DIR := .security
TRIVY_CACHE := .trivy-cache
TRIVY_DB_TTL_MINUTES ?= 720

.PHONY: game game-bg ungame restart logs status build clean help install \
	frontend-install backend-install python-check ensure-hook-script install-hooks ensure-hooks hooks ensure-frontend-deps ensure-backend-deps \
	test tests test-fe test-be tests-fe tests-be tests/fe tests/be e2e e2e-combat-dom e2e-install compose-smoke coverage coverage-fe coverage-be release-gate \
	test-frontend test-frontend-smoke test-frontend-unit test-frontend-contract test-backend test-backend-smoke test-backend-integration backend-check quality-gate gate-core \
	gate-frontend-critical gate-critical combat-smoke frontend-build bundle-report puzzles-check audio-check data-ux-check campaign-map-check release-check test-suite-audit test-suite-audit-ci static-contract-risk-audit static-preflight \
	security security-full security-images security-fe security-be security-trivy security-api ensure-trivy deps-status doctor worker-test

## Diagnóstico local sin instalar nada: runtimes, lockfiles, CI y tooling opcional.
doctor:
	@$(PYTHON) scripts/repo_doctor.py

## Levanta el juego (build si hace falta) y se queda mostrando logs.
game:
	$(COMPOSE) up --build

## Igual que "game" pero en segundo plano.
game-bg:
	$(COMPOSE) up --build -d
	@echo "Levantado en segundo plano. Backend en :$${BACKEND_PORT:-4000}, frontend en :$${FRONTEND_PORT:-5173}."
	@echo "Usa 'make logs' para ver qué está pasando, o 'make ungame' para pararlo."

## Para y elimina los contenedores (no borra las imágenes).
ungame:
	$(COMPOSE) down

## Reinicia todo desde cero.
restart: ungame game

## Sigue los logs de los dos servicios.
logs:
	$(COMPOSE) logs -f

## Estado actual de los contenedores del proyecto.
status:
	$(COMPOSE) ps

## Construye las imágenes Docker, sin levantar nada.
build:
	$(COMPOSE) build

## Para todo y borra imágenes/volúmenes locales del proyecto.
clean: ungame
	$(COMPOSE) down --rmi local --volumes --remove-orphans

## Instala dependencias locales para desarrollo/tests sin Docker y activa
## el hook versionado que bloquea un git push si falla `make tests`.
## Frontend queda en node_modules; backend queda aislado en .venv.
install: frontend-install backend-install install-hooks


## Regenera el hook si el directorio oculto .githooks no llegó al copiar/descomprimir
## el proyecto. De este modo `make tests` se autocura incluso sin dotfiles.
ensure-hook-script:
	@mkdir -p .githooks
	@if [ ! -f .githooks/pre-push ]; then \
		printf '%s\n' \
			'#!/usr/bin/env sh' \
			'set -eu' \
			'' \
			'ROOT="$$(git rev-parse --show-toplevel)"' \
			'cd "$$ROOT"' \
			'' \
			'echo "==> Chess Studio pre-push quality gate: make tests"' \
			'if ! make tests; then' \
			'  echo >&2 ""' \
			'  echo >&2 "Push cancelado: el quality gate local ha fallado."' \
			'  echo >&2 "Corrige los tests o, solo si sabes exactamente por qué, usa: git push --no-verify"' \
			'  exit 1' \
			'fi' \
			'' \
			'echo "==> Quality gate local OK. Push permitido."' \
			> .githooks/pre-push; \
		echo "Hook .githooks/pre-push regenerado."; \
	fi
	@chmod +x .githooks/pre-push

## Instala el hook pre-push versionado del repo. Usamos core.hooksPath para
## no copiar scripts dentro de .git/hooks y mantener el hook bajo control de Git.
install-hooks: ensure-hook-script
	@if ! git rev-parse --show-toplevel >/dev/null 2>&1; then \
		echo "ERROR: install-hooks debe ejecutarse dentro de un repositorio Git."; \
		exit 1; \
	fi
	@current="$$(git config --local --get core.hooksPath || true)"; \
	if [ -n "$$current" ] && [ "$$current" != ".githooks" ]; then \
		echo "ERROR: core.hooksPath ya apunta a '$$current'. No lo sobrescribo automáticamente."; \
		exit 1; \
	fi
	@chmod +x .githooks/pre-push
	@git config --local core.hooksPath .githooks
	@echo "Hook pre-push activo: git push ejecutará 'make tests'."

## Activación perezosa: `make tests` instala el hook si este repo todavía
## no tiene hooksPath. Si ya usas otro sistema de hooks, no lo pisa ni hace
## fallar los tests: te avisa y deja tu configuración intacta.
ensure-hooks:
	@if git rev-parse --show-toplevel >/dev/null 2>&1; then \
		current="$$(git config --local --get core.hooksPath || true)"; \
		if [ -z "$$current" ]; then \
			$(MAKE) --no-print-directory install-hooks; \
		elif [ "$$current" = ".githooks" ]; then \
			$(MAKE) --no-print-directory ensure-hook-script; \
		else \
			echo "AVISO: core.hooksPath ya apunta a '$$current'; no lo modifico."; \
		fi; \
	fi

hooks: install-hooks

frontend-install:
	cd frontend && npm ci

python-check:
	@$(PYTHON) scripts/check_python.py

backend-install: python-check
	@set -eu; \
	if [ ! -x "$(VENV_PY)" ] || ! "$(VENV_PY)" -m pip --version >/dev/null 2>&1 || ! "$(VENV_PY)" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' >/dev/null 2>&1; then \
		echo "==> .venv ausente, dañada o con Python < 3.10; recreando..."; \
		rm -rf "$(VENV)"; \
		$(PYTHON) -m venv "$(VENV)"; \
	fi; \
	if ! "$(VENV_PY)" -m pip --version >/dev/null 2>&1; then \
		echo "==> pip no vino con venv; intentando ensurepip..."; \
		"$(VENV_PY)" -m ensurepip --upgrade; \
	fi
	$(VENV_PY) -m pip install --upgrade pip
	$(VENV_PY) -m pip install --upgrade -r backend-python/requirements-dev.txt
	@$(VENV_PY) -c "import jwt; print('PyJWT activo:', jwt.__version__)"
	@sha256sum backend-python/requirements.txt backend-python/requirements-dev.txt | sha256sum | cut -d' ' -f1 > "$(VENV)/.chess-requirements.sha256"

## Bootstrap perezoso: make tests funciona también en un checkout recién clonado.
ensure-frontend-deps:
	@if [ ! -x "frontend/node_modules/.bin/vitest" ] || [ ! -x "frontend/node_modules/.bin/vite" ]; then \
		echo "==> Faltan dependencias frontend; ejecutando npm ci..."; \
		$(MAKE) frontend-install; \
	fi

ensure-backend-deps:
	@req_hash="$$(sha256sum backend-python/requirements.txt backend-python/requirements-dev.txt | sha256sum | cut -d' ' -f1)"; \
	stamp="$(VENV)/.chess-requirements.sha256"; \
	installed_hash="$$(cat "$$stamp" 2>/dev/null || true)"; \
	if [ ! -x "$(VENV_PY)" ] || ! "$(VENV_PY)" -m pip --version >/dev/null 2>&1 || [ "$$installed_hash" != "$$req_hash" ] || ! $(VENV_PY) -c "import pytest, chess, fastapi, httpx, jwt, pip_audit" >/dev/null 2>&1; then \
		echo "==> Entorno backend ausente o requirements cambiados; actualizando .venv..."; \
		$(MAKE) backend-install; \
	fi

## Capas de tests disjuntas: cada test corre una sola vez en el quality gate.
## Los aliases gate-* se conservan para no romper hábitos/scripts antiguos.
test-backend-smoke: ensure-backend-deps
	@echo "==> BACKEND SMOKE · motor + IA"
	cd backend-python && $(BACKEND_VENV_PY) -m pytest -q test_chess_ai.py test_core_game.py -x

test-backend-integration: ensure-backend-deps
	@echo "==> BACKEND INTEGRATION/API · resto de pytest"
	cd backend-python && $(BACKEND_VENV_PY) -m pytest -q --ignore=test_chess_ai.py --ignore=test_core_game.py

test-frontend-smoke: ensure-frontend-deps
	cd frontend && npm run test:smoke

test-frontend-unit: ensure-frontend-deps
	cd frontend && npm run test:unit

test-frontend-contract: ensure-frontend-deps
	cd frontend && npm run test:contract

gate-core: test-backend-smoke
gate-frontend-critical: test-frontend-smoke
combat-smoke: test-frontend-smoke
gate-critical: test-backend-smoke test-frontend-smoke

## Quality gate local completo. Frontend enseña smoke → unit → contract;
## backend enseña smoke → integration. No hay una segunda suite duplicada.
tests: ensure-hooks tests-fe tests-be security

test: tests
quality-gate: tests

tests-fe: test-frontend bundle-report
test-fe: tests-fe
tests/fe: tests-fe

tests-be: test-backend-smoke test-backend-integration backend-check
test-be: tests-be
tests/be: tests-be

test-frontend: ensure-frontend-deps
	cd frontend && npm test

## Alias histórico: el "resto backend" es la capa integration/API.
test-backend: test-backend-integration

backend-check: ensure-backend-deps
	$(VENV_PY) -m pip check

frontend-build: ensure-frontend-deps
	cd frontend && npm run build

## Presupuesto de bundle deliberadamente informativo: avisa de engordes sin bloquear.
bundle-report: frontend-build
	node scripts/bundle_size_report.mjs


## E2E real en navegador. No vive en el pre-push para no descargar Chromium
## ni ralentizar cada push; CI sí lo trata como quality gate.
## Coverage real. Frontend usa V8 sobre lógica crítica; React/DOM se cubre en Chromium con Playwright.
coverage-fe: ensure-frontend-deps
	@cd frontend && if [ ! -d node_modules/@vitest/coverage-v8 ]; then \
		echo "WARN: @vitest/coverage-v8 no está en el árbol instalado; coverage frontend se omite (informativo)."; \
	else \
		npm run test:coverage || echo "WARN: coverage frontend falló; informativo, no bloquea."; \
	fi

coverage-be: ensure-backend-deps
	@cd backend-python && $(BACKEND_VENV_PY) -m pytest -q --cov=. --cov-branch --cov-config=.coveragerc --cov-report=term-missing --cov-report=xml --cov-fail-under=0 || echo "WARN: coverage backend no disponible; informativo, no bloquea."

coverage: coverage-fe coverage-be

e2e-install: ensure-frontend-deps
	cd e2e && npm ci
	cd e2e && ./node_modules/.bin/playwright install chromium

e2e: e2e-install frontend-build
	cd e2e && ./node_modules/.bin/playwright test

e2e-combat-dom: e2e-install frontend-build
	cd e2e && ./node_modules/.bin/playwright test combat-dom.spec.js

## Smoke de integración REAL: nginx frontend + FastAPI + Mongo + auth/perfil.
## Usa imágenes construidas por docker compose y sólo stdlib Python para el probe.
compose-smoke:
	docker compose up -d --build
	@rc=0; python3 scripts/compose_smoke.py || rc=$$?; \
	  if [ $$rc -ne 0 ]; then docker compose ps; docker compose logs --no-color --tail=200; fi; \
	  docker compose down -v; exit $$rc

## Gate pesado de release: todo lo local + imágenes reales + navegador real.
## No va en pre-push porque Docker+Chromium sería demasiado caro para cada push.
release-gate: tests test-suite-audit-ci coverage security-images e2e compose-smoke
	@echo "==> Release gate completo OK: unit/integration + security + Docker images + Playwright."

## Revalida exclusivamente el banco curado: FEN, reyes/piezas, secuencia,
## mates prometidos y ganancia real en los puzzles de material.
puzzles-check: ensure-frontend-deps
	cd frontend && $(FRONTEND_VITEST) run src/puzzles.test.js

## Smoke del catálogo Web Audio sin npm/Vite: útil incluso si el registry está caído.
audio-check:
	node scripts/audio_catalog_check.mjs

data-ux-check:
	node scripts/data_ux_check.mjs

campaign-map-check:
	node scripts/campaign_map_check.mjs

test-suite-audit:
	node scripts/test_suite_audit.mjs


static-contract-risk-audit:
	@node scripts/static_contract_risk_audit.mjs
test-suite-audit-ci:
	node scripts/test_suite_audit.mjs --ci-wiring


worker-test:
	@echo "==> WORKER AI RUNTIME · fetch/HMAC/routing/sanitización"
	node --test infra/cloudflare/worker/index.test.mjs

## Preflight barato y sin red: música + sintaxis JS + compilación Python.
release-check:
	node scripts/release_consistency_check.mjs

static-preflight: audio-check data-ux-check campaign-map-check release-check test-suite-audit static-contract-risk-audit security-api cf-ai-preflight worker-test
	@find frontend/src scripts -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
	@python3 scripts/python_syntax_check.py
	@echo "==> Static preflight OK (sin npm, Docker ni red)."

## Trivy local fijado por versión. Se instala dentro del repo para que Nobara
## no necesite paquetes globales ni sudo. La caché de la DB se conserva.
ensure-trivy:
	@command -v curl >/dev/null || { echo "ERROR: falta curl para instalar Trivy."; exit 2; }
	@command -v sha256sum >/dev/null || { echo "ERROR: falta sha256sum para verificar Trivy."; exit 2; }
	@command -v tar >/dev/null || { echo "ERROR: falta tar para instalar Trivy."; exit 2; }
	@sh ./scripts/install_trivy.sh

## Node: npm audit informa de todo, pero nuestro parser solo falla con CRITICAL.
security-fe: ensure-frontend-deps
	@mkdir -p "$(SECURITY_DIR)"
	@rm -f "$(SECURITY_DIR)/npm-audit.json"
	@cd frontend && set +e; npm audit --json > "../$(SECURITY_DIR)/npm-audit.json"; rc=$$?; set -e; \
		if [ ! -s "../$(SECURITY_DIR)/npm-audit.json" ]; then echo "ERROR: npm audit no produjo informe."; exit $${rc:-2}; fi
	$(PYTHON) scripts/npm_audit_gate.py "$(SECURITY_DIR)/npm-audit.json"

## Python: pip-audit da inventario de advisories. Como pip-audit no expone un
## umbral de severidad fiable, Trivy decide después qué es CRITICAL y bloquea.
security-be: ensure-backend-deps
	@mkdir -p "$(SECURITY_DIR)"
	@rm -f "$(SECURITY_DIR)/pip-audit.json"
	@cd backend-python && set +e; $(BACKEND_VENV_PY) -m pip_audit -r requirements.txt --format=json --output "../$(SECURITY_DIR)/pip-audit.json"; rc=$$?; set -e; \
		if [ ! -s "../$(SECURITY_DIR)/pip-audit.json" ]; then echo "ERROR: pip-audit no produjo informe (rc=$$rc)."; exit 2; fi
	$(PYTHON) scripts/pip_audit_report.py "$(SECURITY_DIR)/pip-audit.json"

## Gate común: dependencias Node/Python + secretos + misconfiguraciones.
## Política del proyecto: CRITICAL rompe; HIGH grita; MEDIUM/LOW informan.
security-trivy: ensure-trivy
	@mkdir -p "$(SECURITY_DIR)" "$(TRIVY_CACHE)"
	TRIVY="$(CURDIR)/$(TRIVY)" \
	TRIVY_CACHE_DIR="$(CURDIR)/$(TRIVY_CACHE)" \
	TRIVY_DB_TTL_MINUTES="$(TRIVY_DB_TTL_MINUTES)" \
		sh ./scripts/trivy_fs_cached.sh "$(CURDIR)/$(SECURITY_DIR)/trivy.json" "$(CURDIR)"
	$(PYTHON) scripts/security_report.py "$(SECURITY_DIR)/trivy.json"

security-api:
	$(PYTHON) scripts/api_surface_gate.py

security: security-api security-fe security-be security-trivy
	@echo "==> Security gate completo: superficie API + dependencias + Trivy; solo CVE CRITICAL bloquea."

## Gate de release/contenedor: construye las dos imágenes reales y escanea también
## paquetes del SO/base image. No vive en `make tests` para mantener rápido el pre-push.
security-images: ensure-trivy
	TRIVY="$(CURDIR)/$(TRIVY)" TRIVY_CACHE_DIR="$(CURDIR)/$(TRIVY_CACHE)" TRIVY_DB_TTL_MINUTES="$(TRIVY_DB_TTL_MINUTES)" SECURITY_DIR="$(CURDIR)/$(SECURITY_DIR)" sh ./scripts/trivy_image_scan.sh

security-full: security security-images
	@echo "==> Security FULL: repo + dependencias + imágenes Docker."

## Diagnóstico rápido de versiones realmente usadas por el checkout local.
deps-status: ensure-backend-deps
	@echo "requirements: $$(grep -E '^[Pp]y[Jj][Ww][Tt]==' backend-python/requirements.txt || true)"
	@$(VENV_PY) -c "import jwt; print('venv PyJWT:', jwt.__version__)"
	@if [ -x "$(TRIVY)" ]; then $(TRIVY) --version | head -1; else echo "Trivy: no instalado"; fi

help:
	@echo "Comandos disponibles:"
	@echo "  make game           - levanta backend + frontend en primer plano"
	@echo "  make game-bg        - igual, pero en segundo plano"
	@echo "  make ungame         - para y elimina los contenedores"
	@echo "  make restart        - ungame + game"
	@echo "  make logs           - sigue los logs"
	@echo "  make status         - muestra el estado de los contenedores"
	@echo "  make build          - construye imágenes Docker"
	@echo "  make clean          - borra contenedores/imágenes/volúmenes locales"
	@echo "  make install        - instala frontend + backend (.venv) y activa pre-push"
	@echo "  make install-hooks  - activa/regenera .githooks/pre-push (alias: make hooks)"
	@echo "  make test-frontend-smoke    - smoke frontend fail-fast (10 ficheros)"
	@echo "  make test-frontend-unit     - lógica/comportamiento frontend"
	@echo "  make test-frontend-contract - wiring/JSX/source contracts"
	@echo "  make test-backend-smoke     - motor + IA"
	@echo "  make test-backend-integration - API/servicios backend"
	@echo "  make gate-critical  - alias rápido: smoke backend + frontend"
	@echo "  make tests          - quality gate completo, capas disjuntas + security"
	@echo "  make tests-fe       - frontend: smoke + unit + contract + build"
	@echo "  make tests-be       - backend: smoke + integration + pip check"
	@echo "  make tests/fe       - alias de tests-fe"
	@echo "  make tests/be       - alias de tests-be"
	@echo "  make test           - alias histórico de make tests"
	@echo "  make frontend-build - compila el frontend fuera de Docker"
	@echo "  make bundle-report  - resume chunks/gzip y avisa de engordes (informativo)"
	@echo "  make e2e            - smoke E2E con Playwright/Chromium (pesado)"
	@echo "  make compose-smoke  - stack real Docker: frontend + FastAPI + Mongo + auth/perfil"
	@echo "  make coverage       - coverage informativo frontend V8 + backend pytest-cov (no bloquea)"
	@echo "  make e2e-combat-dom - regresiones DOM de Mesa de Guerra en Chromium"
	@echo "  make coverage-fe    - coverage V8 de lógica crítica frontend"
	@echo "  make coverage-be    - coverage branch del backend"
	@echo "  make release-gate   - tests + coverage + security + imágenes Docker + E2E; gate pesado de release"
	@echo "  make puzzles-check   - revalida íntegramente el banco de puzzles"
	@echo "  make audio-check     - valida catálogo/estilos/duración de música sin npm"
	@echo "  make data-ux-check   - valida heatmaps, Daily y grada sin npm"
	@echo "  make campaign-map-check - valida geometría/rutas del mapa Combat sin npm"
	@echo "  make test-suite-audit - audita estructura y aislamiento de la suite"
	@echo "  make test-suite-audit-ci - añade validación semántica del wiring de CI"
	@echo "  make static-contract-risk-audit - informa de tests acoplados a implementación"
	@echo "  make release-check    - coherencia de versión RELEASE.txt ↔ frontend"
	@echo "  make static-preflight - sintaxis JS + Python + API auth + música + Worker runtime, sin red"
	@echo "  make worker-test      - ejecuta fetch/HMAC/routing del Worker AI sin Cloudflare ni npm"
	@echo "  make security        - API auth gate + npm audit + pip-audit + Trivy; solo CVE CRITICAL bloquea"
	@echo "  make security-fe     - auditoría de dependencias Node"
	@echo "  make security-be     - auditoría de dependencias Python"
	@echo "  make security-trivy  - vulns + secretos + misconfiguración"
	@echo "  make security-images - construye y escanea frontend/backend Docker reales"
	@echo "  make security-full   - security + security-images"
	@echo "  make deps-status     - muestra PyJWT del requirements/venv y versión de Trivy"


# BEGIN chess-studio-ai-contract
.PHONY: ai-contract ai-security cf-ai-preflight

ai-security:
	python3 scripts/ai_security_gate.py

cf-ai-preflight:
	python3 scripts/cloudflare_ai_preflight.py

ai-contract: ai-security cf-ai-preflight
	cd backend-python && python -m pytest -q test_narrative_cloudflare.py test_narrative_api.py test_narrative_main_contract.py
	cd frontend && npx vitest run src/narrativeRemote.test.js src/narrativeWiring.test.js src/aiMetrics.test.js src/narrativeProvider.test.js
	$(MAKE) --no-print-directory worker-test
	node --check infra/cloudflare/worker/index.js
# END chess-studio-ai-contract
