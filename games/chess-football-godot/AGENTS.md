# Chess Football Godot — scoped AGENTS

Este archivo complementa el `AGENTS.md` raíz para `games/chess-football-godot/`.

Lee siempre:
- `docs/experiments/chess-football.md`;
- `skills/godot-spritesheets/SKILL.md` cuando se toquen sprites/atlases;
- `scripts/art/AGENTS.md` cuando se toque Sprite Forge.

## Ownership
- Godot posee input, control directo, movimiento, balón, colisiones, posesión, IA de partido, cámara y marcador durante un partido jugado o visto.
- El manager/frontend no reimplementa esas transiciones.
- El dominio Chess Football define semántica de atributos, tácticas y `MatchResult`; Godot lo adapta al partido, no crea una economía o carrera paralela.
- Nada de FEN, Stockfish, chess.js ni legalidad de movimientos de ajedrez.

## POC
- Mantener 5v5 mientras se valida diversión y lectura.
- Placeholders son correctos hasta que el loop de movimiento/pase/tiro sea sólido.
- No crecer a 11v11, físicas pesadas, estadios premium o cinemáticas antes de cerrar el slice.
- Godot 4.7.2 parse + smoke deben seguir verdes.

## Sprites
- No crear pipeline artística propia.
- Reutilizar Sprite Forge mediante contrato/perfil Football.
- Generación de imagen produce candidatos; aceptación sigue siendo fail-closed, determinista, con manifest, Godot headless y artifacts PNG revisables.
- El canon Football será 3/4 superior con pivote/pies y escala consistentes entre animaciones y variantes de equipo.
