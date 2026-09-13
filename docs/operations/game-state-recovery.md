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
