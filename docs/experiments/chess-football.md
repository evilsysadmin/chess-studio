# Chess Football — experimento

## Tesis
Chess Football es un manager de fútbol dentro del universo de Chess Studio. Los partidos son fútbol normal. El ajedrez aporta identidad, estética, nombres, humor y arquetipos; no aporta FEN, legalidad de movimientos, Stockfish ni restricciones de desplazamiento.

## Autoridad y límites
- El dominio estadístico vive aislado bajo `frontend/src/chessFootball/`.
- El POC jugable vive aislado bajo `games/chess-football-godot/`.
- Ninguno depende del motor de ajedrez.
- React proyecta estado de manager; Godot posee gameplay, input, física/colisión y control directo durante un partido jugado.
- No compartir runtime con Pawn Slug. Sólo se reutiliza tooling transversal como Sprite Forge.
- No hay backend, persistencia durable, Blender ni economía compartida durante el POC.

## Un fútbol, tres formas de resolver un partido
- `Simular`: motor estadístico rápido y determinista.
- `Ver`: Godot IA contra IA.
- `Jugar`: Godot con control humano.

Los tres caminos deben converger en un contrato `MatchResult` común: marcador, eventos, estadísticas y consecuencias de carrera. No crear dos modelos de atributos, dos semánticas de táctica ni dos economías.

## Slice manager 1
- 6 clubes estables.
- 18 jugadores procedurales por club.
- atributos futbolísticos de club y carrera básica de jugador.
- calendario de liga ida/vuelta.
- simulación de jornada reproducible por seed.
- clasificación derivada de resultados.
- UI mínima para validar el loop «jornada → resultado → tabla → otra jornada».

## Slice Godot 1
- 5v5 con placeholders.
- control directo, sprint, cambio de jugador, pase, tiro y posesión.
- IA mínima y marcador.
- validación Godot 4.7.2 parse + smoke.
- sin sprites finales hasta demostrar que el control del partido merece crecer.

## Sprite Forge
Chess Football reutiliza el compiler/validator canónico de Sprite Forge mediante contratos/perfiles de dominio. No crear `football_sprite_forge.py`, packers versionados nuevos ni una segunda trituradora. El primer perfil visual será 3/4 superior, con pivote estable y animaciones deportivas mínimas.

## Fuera de alcance todavía
Mercado completo, contratos, cantera activa, tácticas profundas, lesiones, persistencia, temporadas sucesivas, narración Matthias, 11v11, escudos premium, estadios y físicas de simulador pesado.

## Criterio de promoción
No aumentar superficie porque sí. El loop estadístico debe enganchar sin gráficos y el partido Godot debe ser divertido con placeholders. El backlog #34 conserva la lista maestra del experimento.
