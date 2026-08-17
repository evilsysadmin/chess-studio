# Experimento 3D — cómo se llegó al estado actual

Enlace en el footer del menú, marcado explícitamente como
**experimental**. Empezó como un visor de la posición inicial (sin
reglas, solo para ver cómo se sentía un tablero 3D) y se convirtió en un
modo jugable real.

## Qué hace

- Clic para elegir una pieza (raycasting de Three.js contra las mallas),
  jugadas legales resaltadas con un anillo de color (azul = normal, rojo
  = captura).
- La CPU responde de verdad vía `/api/analyze` — mismo endpoint que usan
  Partida normal y Espectador, no una IA aparte.
- Maneja enroque (mueve la torre también), captura al paso, y jaque
  mate/tablas.
- **Cámara por botones**, no por arrastre con el ratón — un giro fijo por
  clic (← Girar / Girar →). Antes usaba `OrbitControls` (arrastrar para
  girar), pero ese gesto (clic + arrastre corto) podía confundirse con el
  clic de seleccionar una pieza. Quitar `OrbitControls` de paso achicó el
  bundle del experimento en ~20KB.
- Coronación siempre a dama, y **juegas siempre con blancas, sin poder
  girar el tablero** (orientación fija) — ambas son decisiones de alcance
  a propósito, para no sumar otro frente entero de verificación visual
  (elegir color + orientación invertida en 3D) encima de lo que ya hay
  que verificar.

## Piezas: geometría simple, dos con tratamiento especial

Las piezas son geometría simple (conos/cilindros/esferas apilados) — la
altura distingue el valor de cada una, como un set de ajedrez geométrico
real. El **peón** y el **caballero** recibieron una vuelta extra de
diseño con temática de "soldado medieval" (casco cónico normando, hombros
de armadura, lanza corta para el peón; cuello inclinado y hocico en dos
tramos para el caballero, corrigiendo un primer intento que "parecía
cachorro"), verificadas visualmente con el pipeline de
[renderizado headless](./headless-3d-rendering.md) antes de integrarlas.
Alfil, torre, dama y rey siguen en la geometría original, sin esa misma
pasada de detalle.

## Aislamiento del resto de la app

A propósito **aislado**: no toca `Board.jsx` (el tablero real que usan
las otras 6 pantallas de ajedrez normal), y `three` se carga con
`React.lazy` — el bundle principal no crece un solo byte para quien nunca
entra ahí (`three` en sí pesa ~522KB, medido de verdad). Cada casilla
tiene su propia instancia de material (no compartida entre las 32 del
mismo color) para poder resaltar una sin pintar las demás de paso.

## Límite honesto que sigue vigente

Las **piezas** (pawn/knight) sí se vieron renderizadas de verdad antes de
integrarlas — ver [renderizado headless](./headless-3d-rendering.md). La
**escena interactiva completa** (cámara en contexto, precisión del
raycasting al hacer clic, cómo se leen los resaltados sobre el tablero
real, la sensación general de jugar) nunca se vio corriendo de verdad:
este entorno no tiene forma de simular interacción de usuario sobre un
canvas WebGL en vivo, solo renderizar y mirar imágenes estáticas. La
lógica de reglas sí se verificó por datos — reproducida con chess.js de
verdad (enroque corto y largo, captura al paso, coronación), sin
colisiones en el mapeo de las 64 casillas a coordenadas 3D.

## Pendiente

Alfil, torre, dama y rey en 3D siguen sin la pasada de diseño temático
que recibieron peón y caballero — pausado, no descartado.
