# War Room · visual freeze

Baseline cerrada: 2026-09-13.

La War Room canónica entra en **visual freeze** después del cierre de Android landscape, capturas 390×844 / 844×390 / 1440×900 e inspección accesible. El objetivo ya no es añadir más chrome: es conservar una composición limpia, cinematográfica y centrada en el tablero.

## Qué queda congelado

- El tablero/escena sigue siendo la superficie dominante, no una tarjeta dentro de un dashboard.
- El command deck legado no vuelve a ocupar espacio visible en ninguna de las tres vistas canónicas.
- Las vistas canónicas no introducen overflow de documento.
- Android landscape conserva la composición play-first en un solo viewport.
- Desktop 1440×900 conserva una escena claramente dominante; el rail derecho es secundario.
- No se reintroducen placas persistentes de cámara/renderizador, panel izquierdo, barras de estado redundantes, estadísticas o decoración de interfaz sólo para “llenar” espacio.

## Gate automático

`App · visual artifact` genera health JSON y PNG para:

- Android portrait 390×844;
- Android landscape 844×390;
- Desktop 1440×900.

Después, `scripts/war_room_visual_freeze_check.mjs` exige:

| Vista | Ancho mínimo de escena | Alto visible mínimo | Overflow | Command deck legado |
| --- | ---: | ---: | ---: | --- |
| Android portrait | 88% | 34% | ≤1 px | oculto |
| Android landscape | 66% | 68% | ≤1 px | oculto |
| Desktop 1440×900 | 74% | 82% | ≤1 px | oculto |

Los umbrales incluyen margen suficiente para correcciones legítimas; no pretenden fijar cada píxel.

## Cambios permitidos

El freeze **no** impide arreglar bugs, accesibilidad, rendimiento, lifecycle, WebGL fallback, input o regresiones visuales. Tampoco convierte la composición actual en intocable para siempre.

Si un cambio visual deliberado necesita cruzar estos límites, la misma PR debe:

1. explicar qué problema de producto resuelve;
2. revisar las tres PNG canónicas;
3. actualizar el baseline sólo después de esa revisión;
4. evitar añadir chrome permanente cuando la misma información pueda vivir por interacción o progressive disclosure.

Sin esa evidencia, una deriva visual es una regresión, no una mejora.
