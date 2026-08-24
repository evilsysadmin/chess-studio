> **Estado actual (v16.6dh):** esta auditoría conserva el contexto histórico de v16.6de.
> La organización vigente está en `docs/TESTING.md`: frontend usa grupos disjuntos
> **smoke / unit / contract** y ya no existe un gate crítico que repita parte de la suite completa.

# Chess Studio v16.6de — auditoría exhaustiva de la suite de tests

## Resumen ejecutivo

La suite es amplia y protege bien la lógica pura del juego, Combat Chess, auth/API,
persistencia, seguridad y narrativa. El principal hueco histórico no estaba en la
cantidad de tests, sino en **dónde viven**: Vitest usa entorno `node`, por lo que
los eventos DOM/React reales (hover, click, doble click, portales, focus, remount)
quedaban representados sobre todo por contratos estáticos. Los dos únicos E2E que
existían no alcanzaban esa superficie.

Esto encaja con las regresiones observadas recientemente:

- una pieza con `pointer-events: none` hacía inútiles los handlers de React;
- click/doble click de deployment llegaban a la casilla equivocada;
- una batalla Combat podía volver a Setup tras un remount;
- varios tests estáticos se rompían por cambios de copy o recuentos de catálogo.

v16.6de refuerza esa capa con Chromium real y añade coverage ejecutable sobre lógica crítica frontend y backend.

## Inventario actual

El auditor estructural (`scripts/test_suite_audit.mjs`) encuentra:

- **Frontend:** 592 definiciones `it/test` en 81 ficheros Vitest.
- **Frontend parametrizado:** 1 `it.each(PUZZLES)`, que genera 7 casos reales.
- **Backend:** 162 funciones `test_*` en 8 ficheros pytest.
- **Backend parametrizado:** 1 test con 9 casos de grounding de narrativa.
- **Browser E2E/DOM:** 11 casos Playwright en 2 specs.

Por tanto, con los parámetros actuales, la ejecución completa representa
aproximadamente **780 casos efectivos**:

- 599 frontend;
- 170 backend;
- 11 navegador.

El recuento del auditor se denomina deliberadamente **definiciones**, no “tests
reales”, para no fingir precisión ante parametrización dinámica.

## Cambios aplicados en esta auditoría

### 1. E2E de Combat pasa de 2 a 5 flujos

Se añadieron tres regresiones de navegador que cubren la zona que Vitest/node no
puede cubrir correctamente:

1. Campaña no muestra `INICIAR COMBATE` hasta confirmar el despliegue.
2. Mesa de Guerra verifica en navegador:
   - hover sobre pieza abre la ficha;
   - doble click tablero -> Banquillo;
   - doble click Banquillo -> tablero.
3. Una batalla Combat activa sobrevive a `page.reload()` y no vuelve a Setup.

Estos casos habrían detectado los dos incidentes más costosos de las últimas
iteraciones: `pointer-events: none` y pérdida de sesión Combat durante remount.

El auditor exige ahora un mínimo de 11 E2E/DOM y la presencia explícita de los contratos críticos de Combat.

### 2. Diagnóstico de Playwright en CI

Playwright conserva ahora:

- trace en el primer retry;
- screenshot sólo en fallo;
- vídeo en fallo;
- artifact `playwright-test-results` durante 7 días si el job falla.

En CI se usa un worker para hacer estos pocos flujos más deterministas.

### 3. El gate frontend crítico vuelve a ser realmente “crítico”

Antes ejecutaba 60 de 81 ficheros y **448/592 definiciones (75,7%)** antes de que
CI ejecutara inmediatamente la suite completa. Era casi duplicar Vitest.

Ahora contiene 25 ficheros y **246/592 definiciones (41,6%)**, centrados en:

- core Combat;
- sesión/deployment/regresiones;
- auth/API;
- reloj/persistencia;
- estado/puzzles;
- rating/profile;
- narrativa remota;
- continuidad de release.

El resto sigue protegido por `npm test`; simplemente deja de ejecutarse dos veces.

### 4. Contrato estático de Combat menos frágil

`combatOperationalUx.test.js` ya no depende de frases de UI como
“Arrastra, coloca y confirma” o textos de tooltip para afirmar que una feature
existe. Verifica clases, handlers, roles, wiring y componentes estables.

Los contratos estáticos siguen siendo útiles para wiring/CSS, pero **no deben
validar copy** cuando el comportamiento real puede protegerse por E2E o funciones
puras.

### 5. Tests backend puros realmente aislados

El fixture autouse de `conftest.py` importaba `auth`/bcrypt incluso para tests que
no necesitaban auth, Mongo ni `main.py`. Se amplió el grupo puro para incluir:

- `test_narrative_cloudflare.py`;
- `test_narrative_api.py`;
- `test_request_limits.py`.

Resultado comprobado en este entorno: **32/32 PASS** sin bcrypt, Mongo ni
python-chess instalados.

Esto hace los gates parciales más honestos y rápidos.

### 6. Fuera el auto-parche de tests del preparador

`prepare_repo.py` ejecutaba `fix_known_stale_tests.py`, que reescribía una
expectativa obsoleta de roster. Aunque era muy específico, es una mala dirección
para una suite: una herramienta de preparación no debe editar tests para que
encajen con el código actual.

Se eliminó esa llamada automática y el meta-auditor falla si vuelve a aparecer.

## Puntos fuertes

### Lógica frontend

La cobertura directa de módulos de dominio es alta. De los módulos top-level de
`frontend/src`, sólo quedan sin import directo de tests:

- `App.jsx` — cubierto por navegación E2E;
- `openings-data.js` — dataset ejercitado indirectamente por aperturas;
- `test-setup.js` — infraestructura de tests;
- `useArrowKeyNav.js` — ejercitado por replay/UI, sin unit directo;
- `useEscapeToClose.js` — ejercitado ampliamente por UI y E2E, sin unit directo.

Combat Chess tiene tests separados para reglas, balance, identidad, servicio,
roster, deployment, campaña, técnicas, metamorfosis, sesión, debrief y regresiones.

### Core ajedrecístico

- Gate backend separado para IA/core.
- Reglas especiales cubiertas (castling, en passant, promoción, mate/draw).
- Property/fuzz determinista de posiciones legales con 32 seeds y ~2.200 FEN.
- Fuzz de series y persistencia de relojes con seeds reproducibles.

### Backend/API/seguridad

- Auth y ownership de partidas.
- Admin separado de usuario normal.
- CORS e invitaciones.
- request IDs.
- presencia degradable sin romper core.
- reset de contraseña y token one-use.
- API surface gate que fuerza auth en rutas privadas.
- npm/pip/Trivy + imágenes Docker en CI.

### Workers AI

- HMAC exacto.
- sanitización y eliminación de claves sensibles.
- fallback no fatal.
- circuit breaker/half-open.
- kill switch.
- rate limit.
- grounding anti-alucinación parametrizado.
- endpoint protegido y métricas admin-only.

## Deuda y riesgos restantes

### MEDIA — la interacción DOM se cubre en navegador, no con jsdom

Vitest sigue usando `environment: node` de forma deliberada para mantener rápida la
suite de lógica. La interacción React/DOM crítica se valida en Chromium real con
Playwright: pointer-events, hover, focus, click, doble click, Escape, portales y
remount/reload.

Esta arquitectura evita duplicar la misma interacción en un DOM simulado y en
navegador. Si en el futuro aparecen componentes complejos que necesiten cientos
de combinaciones baratas, entonces sí tendrá sentido añadir Testing Library/jsdom.

### MEDIA — coverage ya existe, pero el umbral es un ratchet inicial

Frontend usa `@vitest/coverage-v8` sobre módulos de lógica crítica con umbral
inicial: 60% statements/functions/lines y 50% branches. Backend usa `pytest-cov`
con branch coverage y `fail_under=55`.

Los informes se publican como artifacts de CI (`frontend-coverage` y
`backend-coverage`). Estos valores son el suelo inicial; deben subir tras observar
el baseline real y cubrir ramas concretas, no por perseguir una cifra cosmética.

### BAJA/MEDIA — Playwright usa API simulada, complementado por smoke real

Playwright valida navegador real pero intercepta `http://localhost:4000/api/**`.
Por tanto, no prueba en un único flujo:

`React build -> CORS -> FastAPI -> auth real -> stores -> respuesta -> React`.

Este riesgo ya está compensado por `make compose-smoke`, que levanta nginx + FastAPI + Mongo reales y valida registro/login/JWT/perfil. El siguiente salto útil sería añadir una partida real y una jugada al smoke, sin convertir toda la suite Playwright en integración pesada.

### MEDIA — `test_main.py` es un hotspot

`test_main.py` contiene **96 tests y ~1.305 líneas**. La cobertura es útil, pero
mezcla demasiados dominios:

- auth;
- games;
- admin;
- presence;
- recovery;
- CORS;
- request IDs.

Dividirlo por dominio mejoraría aislamiento y diagnóstico sin aumentar el número
de tests.

### MEDIA — contratos estáticos todavía numerosos

Hay 12 ficheros `STATIC CONTRACT` y ~308 assertions. Están allowlisteados y el
auditor impide que aparezcan más accidentalmente, pero algunos siguen siendo
largos (`releaseContinuity`, `combatOperationalUx`).

Regla recomendada: cada vez que una interacción pase a E2E/componente real,
retirar la aserción textual equivalente del contrato estático.

### MEDIA — componentes grandes sin test directo

Algunos componentes relevantes no tienen referencia directa en unit/static tests,
aunque muchos se atraviesan desde App/E2E. Los más llamativos por tamaño/impacto:

- `Board3DExperiment.jsx`;
- `MusicPlayer.jsx`;
- `ProfileBackupModal.jsx`;
- `PieceInfoModal.jsx`;
- `ErrorBoundary.jsx`.

No todos merecen un unit test; para UI compleja suele ser mejor uno de navegador.

### BAJA — instalación E2E sin lock propio

`e2e/package.json` fija Playwright a una versión exacta, pero CI usa instalación
sin package-lock. Es razonablemente reproducible por versión, aunque no tanto como
`npm ci`. Cuando se regenere dependencias con red disponible, merece la pena
commitear `e2e/package-lock.json`.

## Flakiness

Puntos positivos:

- no hay `.only`, `.skip` ni `.todo` en suite normal;
- RNG de tests usa seeds o `vi.spyOn`, no asignación global desnuda;
- reloj real está prohibido por meta-auditor salvo fake timers/fecha inyectada;
- Web Storage se limpia explícitamente en los tests que lo usan;
- property tests tienen seeds reproducibles;
- el fuzz costoso tiene timeout propio en vez de relajar toda la suite.

Playwright conserva un retry en CI. El trace/video añadido permite distinguir una
regresión de una flake real en vez de aceptar el segundo intento a ciegas.

## Arquitectura de CI resultante

Orden frontend:

1. `npm ci`.
2. auditoría de suite/wiring.
3. release check.
4. gate frontend crítico reducido.
5. suite Vitest completa.
6. build Vite.

Backend:

1. core chess/AI fail-fast.
2. resto por autodiscovery, ignorando sólo core ya ejecutado.
3. `pip check`.

Después:

- security gate;
- scan de imágenes;
- 11 E2E/DOM Playwright.

## Validación realizada durante esta auditoría

En este runtime se ejecutó correctamente:

- `make static-preflight` — PASS;
- `scripts/test_suite_audit.mjs --ci-wiring` — PASS;
- `repo_doctor.py` — 12/12 PASS;
- sintaxis Python — PASS;
- sintaxis JS/MJS de tests/scripts/E2E — PASS;
- API surface gate — PASS;
- audio/data UX/campaign map — PASS;
- backend puro narrativa + request limits — **32/32 PASS**.

No se pudo ejecutar aquí:

- Vitest completo (no hay `node_modules` y no hay acceso de red);
- backend completo (faltan paquetes como python-chess/bcrypt en este runtime);
- Playwright (Chromium/runner no instalados localmente).

Esos tres siguen siendo gates obligatorios de GitHub Actions.

## v16.6dd — segunda pasada de mejora

Esta iteración cierra el hueco de integración que seguía abierto tras v16.6dc.

### Smoke real del stack Docker Compose

Se añade `scripts/compose_smoke.py` y el target `make compose-smoke`. El probe usa
sólo la librería estándar de Python y valida contra contenedores reales:

1. frontend nginx responde;
2. `/api/health` responde;
3. registro real crea usuario en Mongo;
4. `/auth/me` valida JWT;
5. PUT de perfil persiste datos;
6. un login nuevo obtiene otro JWT;
7. GET de perfil recupera exactamente el marcador persistido;
8. `/api/profile` sin token continúa devolviendo 401.

GitHub Actions ejecuta este smoke en un job propio y vuelca `docker compose ps` +
logs si falla. Esto cubre la frontera que antes quedaba entre Playwright mockeado
y pytest/FastAPI aislado.

### E2E de navegador: 5 -> 7

Se añaden dos regresiones de comportamiento:

- clic simple sobre una pieza del tablero fija la Ficha de unidad y NO la mueve al
  Banquillo;
- la batalla Combat usa realmente el rail derecho como Registro de batalla y no
  reintroduce Game Chat.

El auditor conserva esos flujos y v16.6de eleva el mínimo a 11 con una segunda spec DOM.

### Auditoría estructural reforzada

`test_suite_audit.mjs --ci-wiring` comprueba además que:

- CI invoque el smoke Docker real;
- Makefile exponga `compose-smoke`;
- los flujos E2E/DOM críticos sigan presentes;
- coverage frontend/backend esté realmente cableado en CI.

### Resultado

Inventario estructural tras esta pasada:

- frontend Vitest: 592 definiciones / 81 ficheros;
- backend pytest: 162 definiciones / 8 ficheros;
- navegador Playwright: 11 flujos en 2 specs;
- backend puro ejecutable en este entorno: 32/32 PASS.

La prioridad siguiente ya no es sumar tests por volumen: es subir gradualmente los umbrales de coverage según el baseline real y retirar contratos estáticos cuando exista un equivalente ejecutable en navegador.


## v16.6de — coverage y DOM real

### Coverage frontend

El job frontend instala `@vitest/coverage-v8@4.1.10`, exactamente alineado con
Vitest 4.1.10. La suite completa se ejecuta una sola vez con coverage. El scope
inicial se centra en lógica crítica (Combat, auth/API, reloj, rating, perfil,
puzzles, torneo y narrativa); los componentes React no se cuentan artificialmente
como “sin cubrir” porque su comportamiento vive en Chromium real.

Umbrales iniciales bloqueantes:

- statements: 60%;
- branches: 50%;
- functions: 60%;
- lines: 60%.

### Coverage backend

`pytest-cov==7.1.0` acumula coverage entre el gate core y el resto de pytest sin
repetir esos tests. Mide branches y bloquea por debajo de 55%. Se publica
`coverage.xml` como artifact.

### Interacción DOM real

Playwright sube de 7 a 11 casos. Los cuatro nuevos protegen precisamente la zona
que causó regresiones recientes:

1. `.piece-event-target` tiene `pointer-events: auto` en navegador real;
2. focus de teclado sobre una reserva abre la ficha rápida;
3. Escape cierra primero la ficha fijada sin abandonar deployment;
4. hover de pieza no modifica Banquillo ni despliegue.

Esto convierte errores CSS/event bubbling/focus en fallos ejecutables de CI en vez
de contratos de strings.
