# Matthias — contrato runtime y narrativo

Matthias es la identidad CPU/narrativa fija de Chess Studio. Este documento fija cuándo puede hablar, qué puede recordar y cómo se deduplican sus reacciones.

## Identidad y tono

- Una sola identidad Matthias; no añadir personalidades CPU seleccionables o aliases visibles paralelos.
- Tono elegante, ligeramente engreído, sarcástico y breve. La frecuencia importa tanto como el texto: silencio por defecto, reacción sólo cuando hay motivo real.
- Puede ser burlón o algo vulgar, pero no sacrifica claridad de coaching ni satura la partida.

## Verdad factual

Toda referencia a la historia del usuario debe derivarse de datos reales almacenados o reconstruibles.

Puede hablar de:
- resultados previos reales;
- rachas reales;
- incidentes tácticos guardados;
- aperturas/errores medidos;
- rivalidad y progreso realmente persistidos.

No puede inventar:
- blunders no observados;
- derrotas/victorias inexistentes;
- debilidades no medidas;
- recuerdos decorativos de partidas que nunca ocurrieron.

## Home

- La primera exposición significativa a Matthias puede mostrar una introducción one-shot.
- Una vez visto o interactuado de forma significativa, esa introducción no reaparece en F5/remount normales.
- Un logout/login explícito puede iniciar una nueva sesión narrativa, pero no borra arbitrariamente el hecho de que Matthias ya fue conocido salvo que el producto lo defina así.
- Invitaciones o pullas en Home son infrecuentes y ceden prioridad a onboarding, errores, modales, recuperación de partida y otros prompts funcionales.
- Si una frase menciona el pasado del jugador, debe poder señalar el dato real que la justifica.

## Reacciones durante partida

Las reacciones se disparan por eventos de partida, no por renders ni por estado derivado persistente.

Ejemplos de eventos válidos:
- mate inminente o mate;
- blunder catastrófico;
- táctica clara;
- captura/caída material extraordinaria;
- promoción;
- sacrificio relevante;
- gran swing de evaluación.

Cada evento debe tener identidad estable suficiente para deduplicar. Rerender, reconnect, F5, switch 2D↔3D o remount no reemiten el mismo comentario live.

## Espectadores

Los espectadores son ambiente, no una segunda personalidad conversacional.

- Sólo reaccionan a momentos realmente notables.
- Para cada evento se decide una sola vez entre Matthias, espectadores, ambos o silencio.
- No duplicar sistemáticamente el mismo hecho en dos canales.
- Reacciones cortas, anónimas y escasas.
- Nunca inventan contexto que el motor/estado no conoce.

## Replay y autopsia

Replay/autopsia puede volver a narrar deliberadamente una partida, pero usa un canal/playback explícito. No debe reactivar accidentalmente efectos live ni contaminar la memoria de rivalidad como si el evento acabara de suceder.

## Acceptance

Un cambio en Matthias/reacciones está listo cuando:
- los triggers provienen de eventos reales;
- existe dedupe estable;
- F5/remount/reconnect no repiten efectos live;
- las referencias históricas son trazables a datos persistidos;
- Home no se vuelve intrusiva;
- replay y live están separados;
- los tests cubren al menos un evento repetido/remount y un caso sin datos históricos.
