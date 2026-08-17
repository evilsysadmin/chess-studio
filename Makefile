# Makefile — atajos para levantar el juego con Docker Compose.
#
# Uso rápido:
#   make game     -> construye (si hace falta) y levanta backend + frontend
#   make ungame   -> para y elimina los contenedores
#   make logs     -> sigue los logs de ambos servicios
#   make status   -> muestra el estado de los contenedores
#   make clean    -> ungame + borra imágenes construidas por este proyecto
#
# Puertos configurables: make game BACKEND_PORT=4001 FRONTEND_PORT=5174

COMPOSE := docker compose

.PHONY: game ungame restart logs status build clean help

## Levanta el juego (build si hace falta) y se queda mostrando logs.
game:
	$(COMPOSE) up --build

## Igual que "game" pero en segundo plano (no bloquea la terminal).
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

## Solo construye las imágenes, sin levantar nada.
build:
	$(COMPOSE) build

## Para todo y además borra las imágenes construidas (libera espacio en disco).
clean: ungame
	$(COMPOSE) down --rmi local --volumes --remove-orphans

## Lista los comandos disponibles.
help:
	@echo "Comandos disponibles:"
	@echo "  make game      - levanta el juego (backend + frontend) en primer plano"
	@echo "  make game-bg   - igual, pero en segundo plano"
	@echo "  make ungame    - para y elimina los contenedores"
	@echo "  make restart   - ungame + game"
	@echo "  make logs      - sigue los logs de ambos servicios"
	@echo "  make status    - muestra el estado de los contenedores"
	@echo "  make build     - solo construye las imágenes"
	@echo "  make clean     - ungame + borra las imágenes construidas"
