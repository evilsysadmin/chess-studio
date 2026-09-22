# Chess Football Godot POC

POC jugable aislado para validar el partido arcade de Chess Football antes de producir arte.

## Objetivo del slice

- 5v5 con placeholders procedurales.
- perspectiva cenital/broadcast 2D preparada para futura presentación 2.5D;
- control directo del jugador seleccionado;
- cambio de jugador;
- pase asistido;
- tiro;
- posesión simple;
- IA mínima de apoyo/presión;
- marcador y reinicio tras gol.

## Controles

- WASD: mover jugador activo.
- J: pase.
- K: tiro.
- L: cambiar al jugador más cercano al balón.

## Boundary

Este proyecto no contiene manager, mercado, temporadas, FEN, Stockfish ni reglas de movimiento de ajedrez.
No contiene sprites finales: el gameplay se valida primero con placeholders.

Cuando el POC de control resulte convincente, los frames entrarán por la misma Sprite Forge canónica usada por Pawn Slug mediante un perfil/contrato Chess Football; no se creará otra pipeline de sprites.

## Smoke headless

Con Godot 4.7.2:

```bash
godot --headless --path games/chess-football-godot --script res://tests/match_smoke.gd
```
