# Makefile — atajos para levantar, probar y revisar Chess Studio.
# Puertos configurables: make game BACKEND_PORT=4001 FRONTEND_PORT=5174

COMPOSE := docker compose
PYTHON ?= python3
VENV := .venv
VENV_PY := $(VENV)/bin/python
BACKEND_VENV_PY := ../$(VENV_PY)
FRONTEND_VITEST := ./node_modules/.bin/vitest

.PHONY: game game-bg ungame restart logs status build clean help install \
	frontend-install backend-install ensure-frontend-deps ensure-backend-deps \
	test tests test-fe test-be tests-fe tests-be tests/fe tests/be \
	test-frontend test-backend backend-check quality-gate gate-core \
	gate-frontend-critical gate-critical frontend-build

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

## Instala dependencias locales para desarrollo/tests sin Docker.
## Frontend queda en node_modules; backend queda aislado en .venv.
install: frontend-install backend-install

frontend-install:
	cd frontend && npm ci

backend-install:
	@test -x "$(VENV_PY)" || $(PYTHON) -m venv "$(VENV)"
	$(VENV_PY) -m pip install -r backend-python/requirements-dev.txt

## Bootstrap perezoso: make tests funciona también en un checkout recién clonado.
ensure-frontend-deps:
	@if [ ! -x "frontend/node_modules/.bin/vitest" ] || [ ! -x "frontend/node_modules/.bin/vite" ]; then \
		echo "==> Faltan dependencias frontend; ejecutando npm ci..."; \
		$(MAKE) frontend-install; \
	fi

ensure-backend-deps:
	@if [ ! -x "$(VENV_PY)" ] || ! $(VENV_PY) -c "import pytest, chess, fastapi, httpx, jwt" >/dev/null 2>&1; then \
		echo "==> Falta el entorno backend; preparando .venv..."; \
		$(MAKE) backend-install; \
	fi

## Gate rápido y explícito del motor/IA.
gate-core: ensure-backend-deps
	cd backend-python && $(BACKEND_VENV_PY) -m pytest -q test_chess_ai.py test_core_game.py -x

## Gate rápido de reglas críticas que viven en el cliente.
## Usa SIEMPRE el Vitest fijado por package-lock.json; nunca instala npx al vuelo.
gate-frontend-critical: ensure-frontend-deps
	cd frontend && $(FRONTEND_VITEST) run src/combat.test.js src/combatRoster.test.js src/roguelikeMode.test.js src/moveAvailability.test.js src/voiceCommentary.test.js src/playerRating.test.js src/auth.test.js src/admin.test.js src/sound.test.js src/puzzles.test.js

## Los dos gates que deberían pasar antes de llamar "jugable" a una build.
gate-critical: gate-core gate-frontend-critical

## Quality gate local completo. Replica las comprobaciones funcionales de CI.
## En un checkout limpio instala automáticamente lo que falte.
tests: tests-fe tests-be

## Alias: singular histórico y nombre explícito de quality gate.
test: tests
quality-gate: tests

## Frontend: gate crítico + suite completa + build de producción.
tests-fe: gate-frontend-critical test-frontend frontend-build
test-fe: tests-fe
tests/fe: tests-fe

## Backend: gate del core + suite completa + integridad de dependencias.
tests-be: gate-core test-backend backend-check
test-be: tests-be
tests/be: tests-be

test-frontend: ensure-frontend-deps
	cd frontend && npm test

test-backend: ensure-backend-deps
	cd backend-python && $(BACKEND_VENV_PY) -m pytest -v

backend-check: ensure-backend-deps
	$(VENV_PY) -m pip check

frontend-build: ensure-frontend-deps
	cd frontend && npm run build

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
	@echo "  make install        - instala frontend + backend (.venv)"
	@echo "  make gate-core      - ejecuta el gate del motor/IA"
	@echo "  make gate-frontend-critical - gate frontend crítico"
	@echo "  make gate-critical  - ejecuta ambos gates críticos"
	@echo "  make tests          - quality gate local completo; instala deps si faltan"
	@echo "  make tests-fe       - frontend: gate crítico + suite + build"
	@echo "  make tests-be       - backend: gate core + suite + pip check"
	@echo "  make tests/fe       - alias de tests-fe"
	@echo "  make tests/be       - alias de tests-be"
	@echo "  make test           - alias histórico de make tests"
	@echo "  make frontend-build - compila el frontend fuera de Docker"
