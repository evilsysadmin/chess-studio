# Pawn Slug Godot Web runtime smoke — skill

Este skill cubre export Web, bridge React↔Godot y Playwright. No cubre generación de sprites; para eso usar `skills/godot-spritesheets/SKILL.md`.

## Qué debe demostrar el smoke web

El smoke del navegador valida infraestructura/runtime estable:

- iframe/canvas monta;
- bridge llega a ready;
- reload/remount funciona;
- no hay errores fatales de página/red;
- input real del navegador alcanza Godot;
- eventos representativos del juego cruzan el bridge.

No debe convertirse en un bot que tenga que ganar una sección del nivel, sobrevivir IA emergente o recoger un pickup concreto para declarar sano el runtime.

Godot headless y tests de gameplay poseen reglas más profundas como estados/acciones deterministas; el navegador posee integración Web/lifecycle/input real.

## Input real y physics ticks

Godot consulta muchas acciones durante physics ticks. Un `keyboard.press()` de Playwright puede hacer keydown+keyup entre dos ticks y ser invisible para el juego.

Para acciones muestreadas por estado:

- usar key down;
- mantenerla el tiempo suficiente para cruzar al menos un physics frame real;
- key up después.

El contrato actual usa pulsos sostenidos para fuego/granada y un hold mayor para salto de altura completa. No reducir esos holds a taps instantáneos sin demostrar que el código Godot cambió a eventos edge-triggered.

El salto es variable: soltar pronto recorta la velocidad vertical. Un smoke que necesita un salto completo debe mantener la tecla; no tratar un mini-hop como fallo del nivel.

## Determinismo

Preferir una ruta corta y controlada.

- No depender de la IA para colocarse exactamente.
- No exigir matar enemigos/pickups si el objetivo es probar bridge/input.
- Si se usa geometría del nivel, escoger un tramo estable y documentado.
- Mantener las aserciones en eventos reales (`player-fired`, `grenade-thrown`, etc.), no en helpers falsos de test.
- El smoke puede simplificarse cuando el escenario evoluciona, siempre que siga probando la frontera Web real.

## Readiness

Los assets canónicos pueden introducir varianza de cold boot. Usar el timeout versionado del propio test/workflow y calibrarlo con evidencia de runner; actualmente el bridge contempla una ventana de arranque fría más amplia que un boot local caliente.

No esconder un deadlock aumentando timeouts repetidamente. Distinguir:

- asset/network todavía cargando;
- Godot ejecutando pero bridge no ready;
- canvas no montado;
- excepción de página;
- evento de input perdido.

## PR / exact head

Los required checks deben ejecutar contra el head actual de la PR. Si una PR reemplaza otra o avanza su head, no considerar evidencia de un run del SHA anterior como acreditación del nuevo.

## Acceptance

Un cambio de runtime/smoke está listo cuando:

- export/boot real funciona;
- ready bridge aparece dentro del presupuesto;
- movimiento y al menos acciones representativas llegan mediante teclado real;
- lifecycle/reload/remount permanece sano;
- no se depende de una victoria emergente del nivel;
- Godot headless conserva su cobertura propia;
- CI acredita el SHA actual.
