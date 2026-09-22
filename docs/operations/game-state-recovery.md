# Game-state doctor y restore drill

Objetivo: poder responder **“¿este savegame se reconstruye exactamente con las reglas actuales?”** y comprobar un restore sin convertir el diagnóstico en otra ruta de escritura.

El doctor es deliberadamente **read-only**. No conecta a Mongo, no corrige SAN y no reescribe documentos.

## 1. Exportar y diagnosticar

Exporta el documento raw de `games` antes de tocar nada. El `_id` de una partida normal es el game id.

```bash
mongoexport \
  --uri "$MONGODB_URI" \
  --collection games \
  --query '{"_id":"GAME_ID"}' \
  --jsonFormat=canonical \
  --out /tmp/chess-game-before.jsonl

python3 scripts/game_state_doctor.py /tmp/chess-game-before.jsonl
```

El doctor reutiliza `chess_core.load_board()` y `serialize_game()`. Comprueba forma persistida, owner, historial SAN legal, posición reconstruible y coherencia de `lastMove`. Si todo es sano emite además un `fingerprint` estable que ignora ruido operacional como `updatedAt`.

Códigos de salida:

- `0`: todos los documentos son reconstruibles y, si existe baseline, coinciden.
- `1`: corrupción o drift canónico detectado.
- `2`: input/JSON inválido o ilegible.

## 2. Restore drill seguro

El ensayo periódico se hace **fuera de la colección `games` de producción**. Local o staging son preferibles; si se usa el mismo cluster, emplear una colección scratch dedicada.

1. Exporta uno o varios savegames sintéticos sanos como baseline.
2. Valida el baseline con el doctor.
3. Importa esa copia en una colección scratch, por ejemplo `games_restore_drill`.
4. Borra sólo la colección scratch y vuelve a importarla desde el mismo snapshot.
5. Reexporta la colección scratch.
6. Compara el resultado restaurado contra el baseline:

```bash
python3 scripts/game_state_doctor.py \
  /tmp/chess-game-restored.jsonl \
  --baseline /tmp/chess-game-before.jsonl
```

El drill pasa únicamente si los mismos game ids vuelven sanos y con el mismo fingerprint canónico. Esto detecta restores aparentemente exitosos que cambian historial, FEN derivado, turno, status, dificultad, color, hándicap o configuración relevante.

## 3. Rollback de un savegame en incidente

No usar `--drop` ni restauraciones masivas sobre `games` de producción.

Para un rollback dirigido:

1. Asegura que la partida afectada ya no está recibiendo escrituras concurrentes.
2. Exporta **otra** copia del estado actual para preservar evidencia del incidente.
3. Valida el snapshot candidato de rollback con el doctor; un baseline corrupto no se restaura.
4. Reemplaza/upserta únicamente el `_id` afectado mediante la herramienta operativa de Mongo aprobada.
5. Reexporta inmediatamente el documento restaurado.
6. Ejecuta el doctor con `--baseline` contra el snapshot elegido.
7. Sólo después valida la ruta autenticada `GET /api/games/{id}` con el propietario correcto.

Si el doctor devuelve `1`, el rollback no se considera válido aunque Mongo haya informado éxito.

## Guardarraíles

- El fingerprint no contiene tokens ni credenciales.
- No usar una respuesta serializada de `/api/games/{id}` como sustituto del documento raw: el doctor espera los campos persistidos (`owner`, `moves`, `difficulty`, `humanColor`, etc.).
- Un historial no vacío sin `lastMove` se admite como posible legacy con warning; un `lastMove` que contradice el replay es error.
- La herramienta no “arregla” automáticamente una partida dañada. Ante corrupción, preservar export, identificar causa y decidir explícitamente entre restore conocido o descartar el savegame.

## 4. Sesión activa en frontend: snapshot de continuidad, no segunda autoridad

Para partidas normales y de torneo, **Mongo/backend sigue siendo la autoridad del estado de juego**. El snapshot local de sesión activa existe para continuidad UX: recordar qué partida/contexto había que recuperar tras F5, deploy, ErrorBoundary o vuelta a una vista activa.

Contrato:

- persistir un sobre local válido con game id y el contexto necesario para reconstruir la experiencia (modo/learning, contrato especial, serie, control de tiempo/clock y contexto compatible cuando aplique);
- marcar una sesión como `Guardado` sólo cuando el contrato de persistencia exigido haya tenido éxito; un write local bloqueado/cuota no se disfraza de snapshot válido;
- al restaurar normal/torneo, usar el snapshot/ids para localizar la partida y reconciliar contra el backend autoritativo; no tratar una copia local del tablero como una base de datos alternativa;
- respuestas tardías de una restauración anterior se descartan/cancelan; un cambio de target/session no puede ser sobrescrito por el fetch viejo;
- rutas de recovery deben ofrecer reintento cuando la autoridad remota está temporalmente indisponible; no saltar silenciosamente a Home y perder la continuidad aparente de una partida que puede seguir existiendo;
- errores terminales/ownership se tratan de forma deliberada y distinta de errores transitorios; no borrar snapshots por cualquier fallo de red;
- una actualización/deploy no fuerza reload destructivo mientras hay una partida de tablero activa si la política actual permite diferirlo.

Combat/Roguelike puede tener snapshots locales propios de campaña/batalla para su dominio específico. Eso no autoriza a reutilizar esos snapshots como autoridad de ajedrez estándar.

## 5. Reconnect offline → online

Reconnect es reconciliación, no repetición ciega.

- No ejecutar dos reconciliaciones simultáneas para el mismo target.
- Si existe una mutación de jugada pendiente, esperar a que termine antes de reconciliar; no competir con el POST ni emitir una segunda jugada.
- Una respuesta remota tardía de una generación/target anterior se descarta.
- No reemplazar estado local más avanzado por una foto remota con historial más corto.
- Una nueva transición offline→online puede abrir un nuevo intento después de haber cerrado/cancelado el anterior.
- Mantener clocks/contexto de sesión coherentes durante la reconciliación; reconnect no es una nueva partida.
- F5, 2D↔3D y reconnect deben converger en la misma partida autoritativa sin duplicar mutaciones.

Los tests de continuidad y network-race forman parte del contrato. Si se mueve esta lógica entre hooks/módulos, mover también los guards/gates en vez de dejar checks que inspeccionen un dueño obsoleto.

