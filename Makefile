# Makefile — atajos para levantar, probar y revisar Chess Studio.
# Puertos configurables: make game BACKEND_PORT=4001 FRONTEND_PORT=5174

COMPOSE := docker compose

.PHONY: game game-bg ungame restart logs status build clean help install frontend-install backend-install test test-frontend test-backend gate-core frontend-build

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
install: frontend-install backend-install

frontend-install:
	cd frontend && npm ci

backend-install:
	python -m pip install -r backend-python/requirements-dev.txt

## Gate rápido y explícito del motor/IA.
gate-core:
	cd backend-python && pytest -q test_chess_ai.py test_core_game.py -x

## Suite completa.
test: test-frontend test-backend

test-frontend:
	cd frontend && npm test

test-backend:
	cd backend-python && pytest -v

frontend-build:
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
	@echo "  make install        - instala dependencias locales"
	@echo "  make gate-core      - ejecuta el gate del motor/IA"
	@echo "  make test           - ejecuta frontend + backend tests"
	@echo "  make frontend-build - compila el frontend fuera de Docker"
