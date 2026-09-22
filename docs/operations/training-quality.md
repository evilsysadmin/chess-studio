# Training, puzzles y “Así juegas” — contrato de calidad

Este dominio sigue también [`architecture-ownership.md`](architecture-ownership.md): engine/quality gate posee la validez táctica; la UI sólo presenta resultados acreditados.

Este contrato cubre puzzles curados, puzzles personales/generados, coaching “Así juegas” y CTAs de entrenamiento derivados de partidas reales.

## Principio

No enseñar una lección falsa sólo porque una heurística superficial diga que encaja.

Una posición de entrenamiento debe ser:
- legal;
- reconstruible;
- tácticamente coherente;
- útil para la lección declarada;
- resistente a la mejor defensa legal del rival.

## Puzzle quality

Antes de aceptar un puzzle:

1. reconstruir la posición real;
2. validar legalidad y turno;
3. comprobar la jugada/objetivo nominal;
4. analizar la mejor defensa del rival;
5. verificar que la continuación sigue justificando la lección;
6. comparar con alternativas forzantes superiores;
7. rechazar si la solución nominal pierde material/posición sin compensación objetiva o es trivialmente refutada.

Un jaque que cuelga la pieza a una captura simple no es “correcto” sólo porque da jaque.

Si existe una línea forzante mejor que contradice la lección nominal, el puzzle debe corregirse o rechazarse.

## Curated vs personal/generated

El mismo estándar aplica a ambos.

Los puzzles personales pueden originarse desde incidentes reales guardados/reconstruibles, pero antes de entrar al banco:
- reconstruyen FEN + move/context;
- pasan legalidad;
- pasan quality gate/engine local cuando esté disponible;
- almacenan incident tags sólo cuando pueden demostrarse desde la posición/continuación.

No conservar puzzles legacy que no pueden demostrar el quality contract actual.

## “Así juegas”

El coaching sólo puede afirmar debilidades/tendencias basadas en señales realmente medidas, por ejemplo:
- incidentes tácticos repetidos;
- aperturas con rendimiento débil real;
- desequilibrio por color;
- tendencias de rating;
- uso o no uso de puzzles cuando ese dato exista.

No inferir psicología, estilo o debilidades que la aplicación no mide.

Cada consejo debe distinguir:
- hecho medido;
- interpretación/coaching;
- acción entrenable disponible.

## “Entrenar este error”

El CTA aparece sólo cuando existe una posición personal real que coincide con el filtro del consejo.

- Consejo genérico sin material real → no CTA falso.
- Matching puede ser por incidente/opening u otro tag reconstruible.
- El filtro debe resolver a posiciones concretas y legalmente entrenables.
- No fabricar una posición sintética sólo para que el botón exista.

## Autopsia/post-game

Los highlights y puzzles derivados de autopsia sólo usan incidentes realmente detectados. Evitar dramatizar jugadas silenciosas para llenar la UI.

Cuando una partida genera un puzzle personal, registrar provenance suficiente para volver a reconstruir:
- partida/posición;
- movimiento humano relevante;
- respuesta rival si forma parte del incidente;
- tags derivados;
- versión del quality contract.

## Engine/provider unavailable

Si el gate objetivo requerido no puede ejecutarse, el puzzle queda pending/quarantined; no se acepta por heurística débil ni por “parece bueno”.

## Acceptance

- legality verde;
- best-defense evaluada;
- solución útil y no refutada;
- provenance reconstruible;
- tags demostrables;
- coaching sólo sobre métricas reales;
- CTA sólo con material matching real;
- legacy incompatible retirado o revalidado;
- tests incluyen al menos una solución superficialmente correcta pero tácticamente mala que debe rechazarse.
