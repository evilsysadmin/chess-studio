# V16 — Core gate, presencia admin y audio V2

## Objetivo

Esta versión no añade otro modo de juego. Endurece lo que ya existe: reglas,
IA, tests críticos, presencia de usuarios y la integración del reproductor.

## Gate del core

- La app trata triple repetición y regla de 50 jugadas como tablas automáticas.
  Ahora `status`, `isGameOver`, creación desde FEN, pistas, análisis y turno de
  la CPU usan la misma política (`claim_draw=True`).
- `undo` reconstruye correctamente partidas con `startingFen`, turno inicial
  negro y hándicap. Antes asumía siempre la posición inicial estándar.
- Se añadieron regresiones para enroque, en passant, promociones, repetición,
  ahogado, material insuficiente y regla de 50 jugadas.
- El aislamiento de partidas por propietario ya estaba implementado y probado:
  otro usuario obtiene 404 y no puede leer/borrar la partida.

## IA / minimax

El motor sigue siendo propio y ligero: iterative deepening, alpha-beta, tabla de
transposiciones, move ordering y quiescence.

Cambios de V16:

- Los cinco tramos visibles coinciden con los tramos de profundidad:
  - Principiante 0-19: profundidad máxima 2.
  - Aficionado 20-44: profundidad máxima 3.
  - Intermedio 45-69: profundidad máxima 4.
  - Avanzado 70-89: profundidad máxima 5.
  - Implacable 90-100: profundidad máxima 6.
- El azar puro desaparece a partir de nivel 40 y tanto azar como selección
  deliberadamente ruidosa son cero desde nivel 45. Intermedio o superior no
  puede regalar una pieza simplemente porque `random()` lo decidió.
- Los mates puntúan por distancia: se prefiere dar mate antes y retrasar un mate
  inevitable cuando se está perdiendo.
- Si el reloj corta antes de completar profundidad 1, hay un fallback estático
  de un ply en lugar de devolver la primera jugada legal arbitraria.
- El rey usa una tabla específica de final cuando queda poco material, por lo
  que deja de esconderse absurdamente en finales donde debe centralizarse.
- Tests de regresión: dama gratis, promoción ganadora, legalidad sobre posiciones
  representativas y ausencia de sabotaje aleatorio desde Intermedio.

No se asigna un Elo artificial a estos niveles. Para estimar fuerza real hace
falta ejecutar el motor en el entorno final y compararlo sobre un conjunto de
posiciones/partidas de referencia.

## CI

GitHub Actions ya ejecutaba frontend + backend en cada push/PR. V16 añade un
paso explícito `Gate del core ajedrecístico` antes de la suite completa y
`pip check` después. `make gate-core` permite correr el mismo gate localmente.

Node queda fijado a 20.19.0 en CI/Pages para satisfacer también el engine de la
versión de Vite que arrastra Vitest 4.

## Admin: última actividad / presencia

- Los usuarios guardan `last_activity` en la colección `users`.
- Cada request autenticada puede renovarlo, con coalescing de escritura de 30 s.
- Una pestaña autenticada manda heartbeat ligero cada 60 s a `/api/auth/activity`.
- Panel admin refresca la lista cada 30 s.
- Estados:
  - `online`: actividad en los últimos 90 s.
  - `recent`: actividad entre 90 s y 15 min.
  - `offline`: más de 15 min.
  - `never`: cuenta antigua que aún no ha vuelto a autenticarse/usar la app.
- El detalle muestra además el timestamp exacto.

Es presencia aproximada de aplicación, no websocket de mensajería instantánea.

## Audio / reproductor

- El mini reproductor queda centrado como una única unidad.
- `MUSIC ON/OFF` y `FX ON/OFF` pasan dentro del propio reproductor; ya no flotan
  como controles separados en la cabecera.
- El motor de temas estructurados soporta segunda voz/contramelodía e
  instrumentos por sección.
- Alejandría 02:41, Cairo 00:47 y Beirut 01:13 reciben líneas de
  pregunta-respuesta específicas para ganar melodía y profundidad sin llenar
  todo el espacio sonoro.

## Verificación en este paquete

Se han ejecutado checks de sintaxis Python (`py_compile`), sintaxis de los
módulos JS no-JSX (`node --check`) y parseo YAML de los workflows.

La suite completa no pudo ejecutarse dentro del entorno de edición porque el
ZIP no incluye `node_modules`/dependencias Python y el entorno no tiene acceso
externo para instalarlas. El primer push debe dejar que GitHub Actions ejecute
el gate completo; no se declara un PASS de tests que no se haya ejecutado.
