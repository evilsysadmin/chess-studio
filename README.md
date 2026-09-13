# Chess Studio

Chess Studio es un estudio/juego de ajedrez con identidad propia: **War Room 3D**, Matthias como rival y coach residente, análisis factual de tus partidas y entrenamiento personal construido a partir de errores y posiciones reales.

El objetivo no es acumular modos. El loop central es:

`jugar → entender qué ocurrió → entrenar algo personal → volver a jugar → comprobar si mejora`

## Qué encontrarás

- **War Room** como superficie canónica para jugar, con alternativa 2D ligera cuando conviene.
- **Matthias**, rival y coach con comentarios y memoria basados en hechos realmente registrados.
- **Así juegas**, que reúne diagnóstico, errores recurrentes, expediente y práctica personal.
- **Home / Castillo**, una entrada diegética a las áreas principales sin convertir la aplicación en un dashboard.
- **Combat Chess**, **Pawn Slug** y otros experimentos como mundos secundarios, separados del camino básico.
- Partidas rápidas, torneos, relojes, series, Daily Challenge, puzzles personales, replay, historial y herramientas de análisis.

La dirección de producto y el trabajo pendiente viven en el [backlog maestro #34](https://github.com/evilsysadmin/chess-studio/issues/34). Los guardarraíles contra overdesign están en [#1319](https://github.com/evilsysadmin/chess-studio/issues/1319).

## Arranque local con Docker

Requisito: Docker con Compose.

```bash
make game
```

Por defecto:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`
- MongoDB vive en el volumen local `mongo-data`
- en desarrollo local, cualquier usuario autenticado es admin (`ADMIN_USERNAMES="*"`)

Para segundo plano y operaciones habituales:

```bash
make game-bg
make status
make logs
make ungame
```

Los puertos pueden cambiarse, por ejemplo:

```bash
make game BACKEND_PORT=4001 FRONTEND_PORT=5174
```

## Desarrollo y tests

Diagnóstico rápido del checkout:

```bash
make doctor
```

Instalación local de dependencias y hooks:

```bash
make install
```

Bootstrap reproducible de frontend, backend y Playwright:

```bash
make bootstrap-test
```

Suite funcional completa local:

```bash
make test-all-local
```

Entorno hermético opcional en Docker:

```bash
make test-in-docker
```

El quality gate habitual también está disponible como:

```bash
make tests
```

El `Makefile` es la autoridad de los entrypoints de desarrollo/CI; evita duplicar comandos complejos en documentación.

## Estructura del repositorio

```text
frontend/          React/Vite, UI, War Room, Home, entrenamiento y modos cliente
backend-python/    FastAPI, persistencia, motor/servicios y APIs
e2e/               Playwright y journeys de navegador
scripts/           quality gates, auditorías, budgets y tooling
docs/              contratos de diseño, experimentos y operaciones
.github/            workflows de CI/deploy
docker-compose.yml stack local frontend + backend + MongoDB
Makefile            entrypoints canónicos de desarrollo y tests
RELEASE.txt         identificador de release actual
```

## Principios de desarrollo

- PR pequeñas, mergeables y con CI.
- La evidencia ajedrecística se comparte entre postpartida, Así juegas y entrenamiento; no se inventan debilidades.
- Progressive disclosure: lo común debe ser simple; la profundidad aparece cuando el usuario la pide.
- Las superficies canónicas pueden entrar en **freeze** para evitar que el polish vuelva a convertirse en acumulación de chrome.
- Un experimento debe demostrar utilidad/diversión y robustez antes de graduarse.
- Nada de rewrites masivos por deporte: extraer responsabilidades sólo cuando reduzca deuda real.

## Documentación

- [Lenguaje visual](docs/VISUAL_LANGUAGE.md)
- [Operaciones](docs/operations/)
- [Experimentos](docs/experiments/)
- [Entrega y automerge](docs/auto-merge-delivery.md)
- [Castillo vivo: contrato mínimo](docs/home-castle-life-minimal.md)

El antiguo README, que había crecido hasta convertirse en diario de releases y documentación histórica, se conserva íntegro en [`docs/archive/README-release-diary.md`](docs/archive/README-release-diary.md). Se mantiene como archivo, no como puerta de entrada al proyecto.

## Estado

Chess Studio está en desarrollo activo. La prioridad actual es consolidar el loop factual de mejora, cerrar Android/lifecycle y terminar vertical slices existentes antes de abrir más frentes.
