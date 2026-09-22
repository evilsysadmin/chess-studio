# War Room · matriz de paridad 2D ↔ 3D

Última auditoría: 2026-09-13.

Objetivo: que 2D y War Room 3D sean dos renderers de la **misma partida**, no dos implementaciones de ajedrez. Las reglas, el turno, la posición, los clocks y la persistencia pertenecen al estado común; cambiar renderer sólo puede cambiar presentación e interacción equivalente.

## Niveles de evidencia

- **GATE**: existe un E2E de navegador que atraviesa realmente el cambio 2D ↔ 3D o ejercita de extremo a extremo el contrato específico dentro de War Room, y forma parte de un gate de PR relevante.
- **CUBIERTO**: existe cobertura de reglas/unit/componentes, pero aún no un E2E específico suficiente para considerar cerrada la frontera.
- **PENDIENTE**: falta una prueba reproducible suficiente para considerar cerrada la frontera.

No se eleva una fila a GATE por inspección de código o porque “parece que debería funcionar”.

## Matriz

| Contrato | Estado | Evidencia actual | Siguiente prueba necesaria |
| --- | --- | --- | --- |
| Misma posición/FEN | **GATE** | `three-d-war-room.spec.js`: una partida creada en 2D monta War Room sobre el mismo estado; `GameBoardView` entrega los mismos `boardProps` a ambos renderers. | Mantener dentro de todos los slices especiales. |
| Selección al pasar 2D → 3D | **GATE** | `three-d-war-room.spec.js`: e2 queda seleccionada y el renderer 3D expone `data-board3d-selected=e2`. | Mantener en cambios repetidos y restore. |
| Cancelar y reseleccionar | **GATE** | `three-d-war-room.spec.js`: Enter cancela/reselecciona usando el estado común. | Mantener tras F5/restore. |
| Targets legales | **GATE** | `three-d-war-room.spec.js`: e3/e4 sobreviven 2D → 3D; `Board3DHighlights.test.js` protege estilo/precedencia. | Mantener especiales y captura ordinaria. |
| Jugada ordinaria | **GATE** | `three-d-war-room.spec.js`: e2→e4 desde 3D produce una sola mutación backend y el mismo test continúa después de varios remounts. | Mantener restore. |
| Touch/coarse pointer | **GATE** | `three-d-war-room-android-touch.spec.js`: selección/movimiento sin duplicar POST. | Mantener 360/390/430 y orientación/resize en gate de última milla. |
| Focus Android | **GATE** | `android-game-focus.spec.js`: Pixel 5 entra en Focus, conserva tablero jugable, ejecuta una sola mutación, muestra comentario de Matthias como bocadillo temporal y restaura la UI al salir. | Mantener orientación/resize general en el lifecycle gate. |
| Teclado | **GATE** | `three-d-war-room.spec.js`: foco roving equivalente y movimiento por flechas + Enter. | Mantener junto a orientación negra. |
| Highlights selección/targets/captura/jaque | **CUBIERTO** | `Board3DHighlights.test.js` define precedencias y colores; la escena 3D dibuja estados físicos sobre la losa. | Acreditar visualmente el highlight de captura ordinaria durante flujo cross-renderer si se eleva a contrato visual específico. |
| Jaque | **GATE** | `three-d-war-room-special-states.spec.js` (#212): selección 2D Qe2 → ejecución 3D Qh5 → misma respuesta backend con `...Re1+` → vuelta a 2D con h1 marcado en jaque y status `Jaque`; una sola mutación. | Mantener como contrato al añadir otros especiales. |
| Jaque mate | **GATE** | `three-d-war-room-special-states.spec.js` (#212): g6→g7# por teclado 3D produce una sola mutación y diálogo real de `Jaque mate`/victoria. | Mantener como contrato terminal. |
| Captura normal | **GATE** | `three-d-war-room.spec.js`: tras `e4 ...d5`, selecciona e4 en 2D, remonta 3D, ejecuta `exd5`, vuelve a 2D con peón blanco real en d5, e4 vacío, pieza negra ausente y exactamente una mutación para la captura. | Mantener junto a en passant para distinguir captura ordinaria de captura lateral. |
| En passant | **GATE** | `three-d-war-room-special-states.spec.js` (#215): e5xd6 e.p. desde 3D retira el peón lateral de d5, conserva el peón blanco en d6 al volver a 2D y produce una sola mutación. | Mantener como contrato de captura fuera de la casilla destino. |
| Enroque | **GATE** | `three-d-war-room-special-states.spec.js` (#214): O-O desde 3D conserva rey en g1 y torre en f1 al volver a 2D, con e1/h1 vacías y una sola mutación. | Mantener como contrato de movimiento compuesto. |
| Promoción | **GATE** | `three-d-war-room-special-states.spec.js` (#216): g7→g8 abre el selector real en 3D, no muta antes de elegir, promociona a Caballo y vuelve a 2D con caballo blanco real en g8; una sola mutación. | Mantener selector + pieza elegida como contrato. |
| Orientación negras | **GATE** | `three-d-war-room-android-touch.spec.js`: crea una partida real con `humanColor=b`, valida foco/cámara desde negras, navega por teclado, juega e7→e5 por touch, alterna 3D→2D y verifica orientación/color/piezas antes de remontar 3D. | Mantener como contrato cross-renderer de orientación. |
| Tooltip/inspección | **GATE** | `war-room-ephemeral-cleanup.spec.js`: entra en `Inspeccionar`, transfiere foco al canvas y anuncia instrucciones; flechas orbitan la misma cámara que el drag, `Home` recentra, `Escape` vuelve a juego, Enter no juega durante inspección y mouse/touch pasan por el mismo contrato antes de validar teardown 3D→2D→3D. | Mantener mouse/touch/teclado al tocar cámara, foco o lifecycle. |
| Clocks | **GATE** | `war-room-interrupted-restore.spec.js` arranca 5+0, deja correr el reloj humano, prueba F5 sin reset y después recorre 3D→2D→3D→2D verificando en cada salto que el mismo snapshot de reloj no se reinicia ni salta. | Mantener al tocar clocks, restore o selector de renderer. |
| Chat/comentarios Matthias | **CUBIERTO** | `GameBoardView` mantiene chat/contexto fuera del renderer; War Room reutiliza los mismos mensajes. | Cambiar repetidamente de renderer durante comentario y verificar no duplicación si se eleva a contrato específico. |
| Renderer switch repetido | **GATE** | `three-d-war-room.spec.js`: recorrido real 2D→3D→2D→3D→2D; conserva FEN y selección e4 al remontar, ejecuta una captura final única y termina sin selección residual. | Mantener junto al gate de clocks. |
| Limpieza de estado efímero | **GATE** | `war-room-ephemeral-cleanup.spec.js`: deja selección compartida en e2 con targets e3/e4, además de foco, modo inspección y cámara arrastrada; desmonta 3D pasando a 2D y remonta War Room exigiendo que selección/targets compartidos sobrevivan, mientras inspect/foco/cámara vuelven al estado canónico y queda un único canvas. | Mantener al añadir nuevos estados privados del renderer. |
| Resize / orientation change | **GATE** | `mobile-war-room-lifecycle.spec.js`: mantiene una selección real durante 12 ciclos portrait↔landscape + background/foreground, conserva un único canvas y después ejecuta exactamente una jugada real. | Mantener como lifecycle Android al tocar resize/cámara/render policy. |
| F5 / restore | **GATE** | `war-room-interrupted-restore.spec.js`: juega y captura en War Room 3D, recarga tras movimientos confirmados, vuelve con renderer 3D limpio, reconcilia la posición autoritativa, preserva el clock sin reset, cruza 3D→2D→3D→2D y termina sin mutaciones duplicadas. | Mantener junto a reconnect y lifecycle. |
| Reconnect | **GATE** | `offline-pending-move-reconnect.spec.js`: provoca offline→online con `/move` pendiente ya dentro de War Room; difiere la reconciliación hasta acabar la mutación, conserva el mismo canvas, consume la foto autoritativa y no duplica POST. | Mantener junto a lifecycle y añadir una variante con corte de red ya estabilizada si cambia el reconciliador. |
| Abandono / salida | **GATE** | `war-room-ephemeral-cleanup.spec.js`: abandona desde War Room con selección + inspect activos, confirma vuelta única a Home, exige desmontaje total de shell/canvas 3D y eliminación del snapshot de sesión activa sin ErrorBoundary. | Mantener al tocar salida, snapshot activo o lifecycle del renderer. |
| Reduced motion | **GATE** | `mobile-war-room-lifecycle.spec.js` corre War Room con `reducedMotion: reduce`, conserva selección durante rotaciones/background y ejecuta una jugada real; `war-room-undo-rewind.spec.js` además juega, deshace, recarga y cruza a 2D bajo la misma media feature. | Mantener al añadir nuevos FX/microanimaciones de War Room. |
| Fallback 3D → 2D por WebGL | **GATE** | `war-room-webgl-fallback.spec.js` cubre tanto arranque sin WebGL como `webglcontextlost` en mitad de partida; en ambos casos aparece el tablero 2D, desaparece el canvas 3D y e2→e4 sigue produciendo exactamente una mutación sin ErrorBoundary. | Mantener al tocar lifecycle/context recovery/fallback. |
| Onboarding inicial guiado por Matthias | **PENDIENTE** | Contrato fijado: Matthias guía selección de una pieza, muestra destinos legales reales y acompaña una o dos interacciones; es skippable, reabrible desde ayuda y equivalente con mouse/touch/teclado. | Añadir E2E first-run + replay desde Help verificando que los destinos vienen del estado legal compartido y que el estado tutorial se limpia al cerrar/completar. |

## Onboarding first-run de War Room

Matthias es el guía diegético del primer contacto con War Room. No usar una voz genérica de sistema ni una capa tutorial desconectada del mundo.

Contrato:

- en la primera entrada significativa, Matthias pide seleccionar/tocar una pieza real;
- al seleccionarla, el tablero muestra **los destinos legales que ya calcula el estado compartido**; el tutorial nunca inventa legalidad ni mantiene una lista paralela;
- Matthias reacciona a esa selección y guía una o dos interacciones simples, suficientes para enseñar seleccionar → leer destinos → mover;
- funciona con mouse, touch y teclado/focus; no diseñar un recorrido que sólo exista con hover;
- puede omitirse inmediatamente y debe poder relanzarse más tarde desde Ayuda/tutoriales;
- completar u omitir limpia overlays/highlights/estado efímero del tutorial sin tocar FEN, clocks, selección persistida o una partida en curso;
- reduced-motion conserva claridad sin depender de animaciones decorativas;
- el copy usa el tono establecido de Matthias: breve, elegante y algo socarrón; la enseñanza prima sobre el chiste.

El onboarding es presentación/interaction coaching, no un segundo motor de reglas. Cualquier movimiento guiado atraviesa la misma ruta real que una jugada normal.

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
3. ~~F5/restore + clocks durante switches.~~ **Gateados** en `war-room-interrupted-restore.spec.js`.
4. ~~Reconnect específico con red interrumpida.~~ **Gateado** en `offline-pending-move-reconnect.spec.js`, incluido `/move` pendiente sin remount ni mutación duplicada.
5. ~~Separación de estado compartido vs. efímero: selección/targets sobreviven; foco/inspect/cámara se limpian tras remount.~~ **Gateada** en `war-room-ephemeral-cleanup.spec.js`.
6. ~~Resize/orientation con selección activa + reduced-motion funcional.~~ **Gateados** en `mobile-war-room-lifecycle.spec.js`; undo/F5 añade evidencia extra para reduced-motion.
7. ~~Orientación negras cross-renderer + fallback WebGL antes/durante partida.~~ **Gateados** en `three-d-war-room-android-touch.spec.js` y `war-room-webgl-fallback.spec.js`.
8. ~~Abandono desde War Room con teardown del renderer/snapshot.~~ **Gateado** en `war-room-ephemeral-cleanup.spec.js`.
9. ~~Inspección accesible con foco, teclado, mouse/touch, recenter y salida.~~ **Gateada** en `war-room-ephemeral-cleanup.spec.js`.
10. Mantener en cada slice los gates ya cerrados de jaque, mate, enroque, en passant, promoción, captura ordinaria, Android y Focus; chat/highlights sólo requieren E2E propio si se elevan a contratos específicos.

La frontera de renderer está ampliamente gateada. Los huecos restantes son de evidencia visual/contextual opcional para highlights y chat, no de legalidad, persistencia, clocks, lifecycle, orientación, abandono, inspección accesible o degradación WebGL.
