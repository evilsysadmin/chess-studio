# Chess Football — experimento

## Tesis
Chess Football es un manager de fútbol dentro del universo de Chess Studio. Los partidos son fútbol normal. El ajedrez aporta identidad, estética, nombres, humor y arquetipos; no aporta FEN, legalidad de movimientos, Stockfish ni restricciones de desplazamiento.

## Boundary técnico
- El dominio vive aislado bajo frontend/src/chessFootball/.
- El motor de simulación es una función pura y determinista por seed.
- React sólo proyecta estado y emite intents.
- No hay backend, persistencia durable, Blender, 3D ni economía compartida en el POC.
- No se reutiliza el motor de ajedrez.
- La entrada vive en Experimentos geniales y se carga con lazy().
- Si aparece partido visual/arcade, debe consumir la misma autoridad de simulación; no se crea un segundo motor.

## Slice 1
- 6 clubes estables.
- 18 jugadores procedurales por club.
- atributos futbolísticos de club y carrera básica de jugador.
- calendario de liga ida/vuelta.
- simulación de jornada reproducible.
- clasificación derivada de resultados.
- UI mínima para validar el loop «jornada → resultado → tabla → otra jornada».

## Fuera de alcance todavía
Mercado, contratos, cantera activa, tácticas, alineaciones editables, lesiones, moral dinámica, guardado, temporadas sucesivas, narración Matthias, escudos premium, estadios y partido arcade.

## Criterio de promoción
No aumentar superficie hasta que el loop estadístico mínimo resulte entretenido por sí solo y mantenga tests deterministas. El backlog #34 conserva la lista maestra del experimento.
