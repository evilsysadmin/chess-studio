# V13 — Centro de operaciones

Esta versión convierte el historial existente en metajuego y entrenamiento, sin abrir endpoints públicos nuevos.

## Incluido

- Centro de operaciones/carrera con temporada mensual, récords, contratos y hemeroteca.
- Contratos opcionales/automáticos en partidas sueltas.
- Revancha inmediata, invirtiendo color.
- Modo Racha: cada victoria sube +7 de dificultad.
- Boss Run: seis fases (35, 47, 59, 71, 83, 95).
- Puzzle Rush de 3 minutos, incluyendo modo basado en puzzles personales.
- Entrenamiento recomendado a partir del incidente táctico más repetido.
- Evolución por bloques de 10 partidas y balance por control de tiempo.
- Perfil ajedrecístico derivado de datos medibles del historial.
- Árbol/mapa de aperturas personal.
- Cementerio de derrotas.
- El Replay permite «Jugar desde aquí» para entrenar una posición real desde su FEN. La antigua acción «¿Salvar este cadáver?» del Cementerio se retiró posteriormente por duplicar demasiado al Historial/Replay.
- Película automática del replay, con pausas más largas en errores graves.
- Museo de récords/hitos y hemeroteca de recuerdos reales de rivalidad.
- Tarjeta PNG de resultados para compartir.
- FX contextuales para incidentes tácticos importantes (respetan mute FX).
- Panel admin: actividad reciente, temporada, Puzzle Rush, contratos y runs.

## Seguridad

`POST /api/games` sigue protegido por JWT. El nuevo campo opcional `startingFen` no crea un endpoint anónimo: reutiliza el mismo endpoint autenticado y valida el FEN en backend.

## Persistencia

`chess-study-career` se incluye en el perfil sincronizado con MongoDB. Los contratos activos y runs en curso son estado de sesión y no se mezclan entre identidades.
