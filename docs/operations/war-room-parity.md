# War Room · matriz de paridad 2D ↔ 3D

Última auditoría: 2026-09-02.

Objetivo: que 2D y War Room 3D sean dos renderers de la **misma partida**, no dos implementaciones de ajedrez. Las reglas, el turno, la posición, los clocks y la persistencia pertenecen al estado común; cambiar renderer sólo puede cambiar presentación e interacción equivalente.

## Niveles de evidencia

- **GATE**: existe un E2E de navegador que atraviesa realmente el cambio 2D ↔ 3D y forma parte de un gate de PR relevante.
- **CUBIERTO**: existe cobertura de reglas/unit/componentes, pero aún no un E2E específico que atraviese el cambio de renderer.
- **PENDIENTE**: falta una prueba reproducible suficiente para considerar cerrada la frontera.

No se eleva una fila a GATE por inspección de código o porque “parece que debería funcionar”.

## Matriz

| Contrato | Estado | Evidencia actual | Siguiente prueba necesaria |
| --- | --- | --- | --- |
| Misma posición/FEN | **GATE** | `three-d-war-room.spec.js`: una partida creada en 2D monta War Room sobre el mismo estado; `GameBoardView` entrega los mismos `boardProps` a ambos renderers. | Mantener dentro de todos los slices especiales. |
| Selección al pasar 2D → 3D | **GATE** | `three-d-war-room.spec.js`: e2 queda seleccionada y el renderer 3D expone `data-board3d-selected=e2`. | Añadir también selección 3D → 2D en una pasada repetida. |
| Cancelar y reseleccionar | **GATE** | `three-d-war-room.spec.js`: Enter cancela/reselecciona usando el estado común. | Repetir tras varios cambios de renderer. |
| Targets legales | **GATE** | `three-d-war-room.spec.js`: e3/e4 sobreviven 2D → 3D; `Board3DHighlights.test.js` protege estilo/precedencia. | Añadir captura y movimientos especiales. |
| Jugada ordinaria | **GATE** | `three-d-war-room.spec.js`: e2→e4 desde teclado 3D produce una sola mutación backend. | Repetición 2D↔3D + restore. |
| Touch/coarse pointer | **GATE** | `three-d-war-room-android-touch.spec.js` + rescate Samsung: selección/movimiento sin duplicar POST. | Mantener 360/390/430 y orientación/resize en gate de última milla. |
| Teclado | **GATE** | `three-d-war-room.spec.js`: foco roving equivalente y movimiento por flechas + Enter. | Cubrir estados especiales y orientación negra. |
| Highlights selección/targets/captura/jaque | **CUBIERTO** | `Board3DHighlights.test.js` define precedencias y colores; #188 corrigió visibilidad física sobre la losa. | Acreditar captura y jaque visual durante un flujo cross-renderer. |
| Jaque | **PENDIENTE hasta merge de #207** | PR #207 añade selección en 2D → ejecución e2→e8 en 3D → estado Jaque → vuelta a 2D con h8 marcado, una sola mutación. | Convertir a **GATE** cuando #207 pase Playwright y se mergee. |
| Jaque mate | **PENDIENTE hasta merge de #207** | PR #207 añade selección g6 en 2D → g7# por teclado 3D → diálogo de mate/victoria, una sola mutación. | Convertir a **GATE** cuando #207 pase Playwright y se mergee. |
| Captura normal | **CUBIERTO** | Renderer 3D anima captura y dispone `capturedGhost`; reglas/gameplay general tienen cobertura. | E2E cross-renderer que verifique pieza retirada + una sola mutación. |
| En passant | **CUBIERTO** | `backend-python/test_core_game.py` y `chess_rules_gate.mjs` protegen legalidad/serialización. | E2E 2D↔3D que verifique captura del peón fuera de la casilla destino y FEN final. |
| Enroque | **CUBIERTO** | Reglas backend cubiertas; `Board3D.jsx` tiene animación explícita de torre durante castling. | E2E 2D↔3D que verifique rey + torre y una sola mutación. |
| Promoción | **CUBIERTO** | Reglas backend cubiertas; `Board3D.jsx` detecta promoción y anima el cambio. | E2E 2D↔3D que atraviese selector de promoción y confirme pieza/FEN final. |
| Orientación negras | **CUBIERTO** | `Board3D` comparte `orientation`, invierte foco/cámara/entrada; unit/helpers contemplan orientación. | Gate real jugando como negras y alternando renderer. |
| Tooltip/inspección | **CUBIERTO** | War Room expone modo `Inspeccionar`; 2D mantiene info contextual. | Definir equivalencia accesible exacta y probar móvil/teclado. |
| Clocks | **CUBIERTO** | Clocks pertenecen a `GameBoardView`, fuera del renderer; rail/estado se conserva en montaje normal. | E2E con reloj corriendo durante varios cambios 2D↔3D y sin reset/salto. |
| Chat/comentarios Matthias | **CUBIERTO** | `GameBoardView` mantiene chat/contexto fuera del renderer; War Room reutiliza los mismos mensajes. | Cambiar repetidamente de renderer durante comentario y verificar no duplicación. |
| Renderer switch repetido | **PENDIENTE** | Existe el cambio por Apariencia y selección 2D→3D, pero no torture test de ida/vuelta repetida. | 2D→3D→2D→3D conservando FEN, turno, selección limpia y una sola mutación. |
| Limpieza de estado efímero | **PENDIENTE** | `Board3D` reinicia hover/foco por orientación y desmonta escena; no hay contrato E2E completo. | Verificar selección/hover/inspect/cámara al desmontar/remontar. |
| Resize / orientation change | **CUBIERTO** | Gate War Room verifica desktop corto y 390 px sin overflow; lógica de resize existe. | Añadir resize/orientation durante partida con selección activa y después mover. |
| F5 / restore | **PENDIENTE cross-renderer** | La app tiene gates generales de continuidad/reload, `safeStorage` y restore; no se encontró gate que restaure específicamente una partida activa en War Room 3D. | Jugar, dejar renderer=3D, F5, reconciliar backend y comprobar FEN/turno/renderer/clock. |
| Reconnect | **CUBIERTO general** | `useGameReconnect` y gates de continuidad cubren reconciliación de partida; no están especializados en War Room. | Cortar red estando en 3D y acreditar la misma recuperación sin remount destructivo. |
| Abandono / salida | **CUBIERTO general** | Flujo de partida común, fuera del renderer. | Un E2E desde War Room que abandone y confirme exactamente una transición/cleanup. |
| Reduced motion | **CUBIERTO** | War Room consulta `getEffectiveReducedMotion`; animaciones físicas y Matthias respetan reducción. | Browser gate con media feature activa y operación completa. |
| Fallback 3D → 2D por WebGL | **CUBIERTO** | `Board3D` captura fallo de `WebGLRenderer` y monta `<Board>` con nota de fallback. | E2E que fuerce fallo WebGL y confirme continuidad de la misma partida. |

## Frontera de arquitectura

Un renderer **no puede**:

1. decidir legalidad;
2. mutar clocks o resultados por su cuenta;
3. mantener una copia autoritativa del FEN;
4. persistir una partida independiente;
5. reinterpretar eventos de ajedrez para producir estadísticas distintas.

`GameBoardView` es la frontera actual: compone `boardProps` desde el estado real y elige `Board` o `Board3D`. Los slices futuros deben reforzar esta separación, no saltársela para simplificar un efecto visual.

## Orden de cierre recomendado

1. Mergear #207 si CI + War Room gate quedan verdes; subir Jaque/Mate a **GATE**.
2. Añadir un slice E2E de **enroque + en passant + promoción** con fixtures deterministas, sin tocar reglas del motor.
3. Añadir torture test de **2D→3D→2D→3D**, incluyendo selección/cancelación y un movimiento final único.
4. Añadir **F5/restore en renderer 3D** y después reconnect con red interrumpida.
5. Añadir clocks + orientación negra + reduced-motion/fallback a la última milla.

El P0.1 no se considera cerrado mientras las filas marcadas **PENDIENTE** sigan dependiendo de confianza manual.
