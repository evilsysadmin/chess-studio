# War Room · matriz de paridad 2D ↔ 3D

Última auditoría: 2026-09-03.

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
| Selección al pasar 2D → 3D | **GATE** | `three-d-war-room.spec.js`: e2 queda seleccionada y el renderer 3D expone `data-board3d-selected=e2`. | Mantener en cambios repetidos y restore. |
| Cancelar y reseleccionar | **GATE** | `three-d-war-room.spec.js`: Enter cancela/reselecciona usando el estado común. | Mantener tras F5/restore. |
| Targets legales | **GATE** | `three-d-war-room.spec.js`: e3/e4 sobreviven 2D → 3D; `Board3DHighlights.test.js` protege estilo/precedencia. | Mantener especiales y captura ordinaria. |
| Jugada ordinaria | **GATE** | `three-d-war-room.spec.js`: e2→e4 desde 3D produce una sola mutación backend y el mismo test continúa después de varios remounts. | Añadir restore. |
| Touch/coarse pointer | **GATE** | `three-d-war-room-android-touch.spec.js`: selección/movimiento sin duplicar POST. | Mantener 360/390/430 y orientación/resize en gate de última milla. |
| Focus Android | **GATE** | `android-game-focus.spec.js`: Pixel 5 entra en Focus, conserva tablero jugable, ejecuta una sola mutación, muestra comentario de Matthias como bocadillo temporal y restaura la UI al salir. | Añadir orientación/resize durante Focus. |
| Teclado | **GATE** | `three-d-war-room.spec.js`: foco roving equivalente y movimiento por flechas + Enter. | Cubrir orientación negra. |
| Highlights selección/targets/captura/jaque | **CUBIERTO** | `Board3DHighlights.test.js` define precedencias y colores; la escena 3D dibuja estados físicos sobre la losa. | Acreditar visualmente el highlight de captura ordinaria durante flujo cross-renderer. |
| Jaque | **GATE** | `three-d-war-room-special-states.spec.js` (#212): selección 2D Qe2 → ejecución 3D Qh5 → misma respuesta backend con `...Re1+` → vuelta a 2D con h1 marcado en jaque y status `Jaque`; una sola mutación. | Mantener como contrato al añadir otros especiales. |
| Jaque mate | **GATE** | `three-d-war-room-special-states.spec.js` (#212): g6→g7# por teclado 3D produce una sola mutación y diálogo real de `Jaque mate`/victoria. | Mantener como contrato terminal. |
| Captura normal | **GATE** | `three-d-war-room.spec.js`: tras `e4 ...d5`, selecciona e4 en 2D, remonta 3D, ejecuta `exd5`, vuelve a 2D con peón blanco real en d5, e4 vacío, pieza negra ausente y exactamente una mutación para la captura. | Mantener junto a en passant para distinguir captura ordinaria de captura lateral. |
| En passant | **GATE** | `three-d-war-room-special-states.spec.js` (#215): e5xd6 e.p. desde 3D retira el peón lateral de d5, conserva el peón blanco en d6 al volver a 2D y produce una sola mutación. | Mantener como contrato de captura fuera de la casilla destino. |
| Enroque | **GATE** | `three-d-war-room-special-states.spec.js` (#214): O-O desde 3D conserva rey en g1 y torre en f1 al volver a 2D, con e1/h1 vacías y una sola mutación. | Mantener como contrato de movimiento compuesto. |
| Promoción | **GATE** | `three-d-war-room-special-states.spec.js` (#216): g7→g8 abre el selector real en 3D, no muta antes de elegir, promociona a Caballo y vuelve a 2D con caballo blanco real en g8; una sola mutación. | Mantener selector + pieza elegida como contrato. |
| Orientación negras | **CUBIERTO** | `Board3D` comparte `orientation`, invierte foco/cámara/entrada; unit/helpers contemplan orientación. | Gate real jugando como negras y alternando renderer. |
| Tooltip/inspección | **CUBIERTO** | War Room expone modo `Inspeccionar`; 2D mantiene info contextual. | Definir equivalencia accesible exacta y probar móvil/teclado. |
| Clocks | **CUBIERTO** | Clocks pertenecen a `GameBoardView`, fuera del renderer; rail/estado se conserva en montaje normal. | E2E con reloj corriendo durante varios cambios 2D↔3D y sin reset/salto. |
| Chat/comentarios Matthias | **CUBIERTO** | `GameBoardView` mantiene chat/contexto fuera del renderer; War Room reutiliza los mismos mensajes. | Cambiar repetidamente de renderer durante comentario y verificar no duplicación. |
| Renderer switch repetido | **GATE** | `three-d-war-room.spec.js`: recorrido real 2D→3D→2D→3D→2D; conserva FEN y selección e4 al remontar, ejecuta una captura final única y termina sin selección residual. | Mantener en F5/restore y añadir torture con clocks. |
| Limpieza de estado efímero | **PENDIENTE** | El gate repetido ya acredita limpieza de selección tras la captura, pero hover/inspect/cámara todavía no tienen ciclo E2E completo de desmontaje/remontaje. | Verificar hover/inspect/cámara al desmontar/remontar. |
| Resize / orientation change | **CUBIERTO** | Gates War Room verifican desktop y Android sin overflow; lógica de resize existe. | Añadir resize/orientation durante partida con selección activa y después mover. |
| F5 / restore | **PENDIENTE cross-renderer** | La app tiene gates generales de continuidad/reload, `safeStorage` y restore; falta un gate que restaure específicamente una partida activa en War Room 3D. | Jugar, dejar renderer=3D, F5, reconciliar backend y comprobar FEN/turno/renderer/clock. |
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

1. ~~Captura normal cross-renderer.~~ **Gateada** en `three-d-war-room.spec.js`.
2. ~~Torture básico 2D→3D→2D→3D.~~ **Gateado** en el mismo recorrido de captura.
3. Añadir **F5/restore en renderer 3D** y después reconnect con red interrumpida.
4. Cerrar limpieza efímera de hover/inspect/cámara.
5. Añadir clocks + orientación negra + resize/orientation + reduced-motion/fallback a la última milla.
6. Mantener en cada slice los gates ya cerrados de jaque, mate, enroque, en passant, promoción, captura ordinaria, Android y Focus.

El P0.1 no se considera cerrado mientras las filas marcadas **PENDIENTE** sigan dependiendo de confianza manual.
