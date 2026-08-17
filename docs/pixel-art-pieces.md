# Piezas pixel art — cómo se llegó al diseño final

Set medieval en pixel art, diseño propio (32×40, PNG con contorno
automático, `image-rendering: pixelated`), en `frontend/src/pieces-medieval/`.
Reemplazó al set "Cburnett" (Colin M.L. Burnett/Lichess, GPLv2+, SVG
vectorial) que usó el proyecto hasta esta ronda.

## Lo que se probó antes y se descartó — con motivo, no solo gusto

- **Heroes of Might & Magic 3** (pack CC-BY, buena calidad): muy
  "criaturas de fantasía" (demonios, grifos, elementales), no "soldado
  medieval" — no encajaba con el tono que se buscaba.
- **Set minimalista de siluetas** (gratis): demasiado plano/liso, sin
  detalle.
- **Mega-pack de 470+ piezas** por $2.69, con cláusula de "no
  redistribuir": problemático para un repo público — aunque se pagara,
  meter los archivos sueltos en un repo clonable por cualquiera pisa
  cerca de "redistribuir", sin ser lo mismo que un juego compilado donde
  el usuario final nunca ve los archivos.

## El proceso real

Para cada pieza se extrajo el **mapa de silueta exacto** (qué píxeles
están ocupados, sin colores) de una imagen de referencia que el usuario
compartió, y se reconstruyó desde cero con paleta propia — así se
aprovecha la proporción/estructura que ya funciona visualmente sin
depender de ningún archivo de terceros ni su licencia.

Cada pieza pasó por 2-5 iteraciones reales (compilar, renderizar, mirar,
corregir) antes de aprobarse — nada se dio por bueno sin verlo
literalmente, usando un pipeline de renderizado headless (ver
[`headless-3d-rendering.md`](./headless-3d-rendering.md) para cómo se
armó esa capacidad). Entre los problemas que se encontraron y
corrigieron así:

- **Peón, primer intento**: partes del cuerpo (cabeza, torso, piernas)
  desconectadas, sin transición — no se leía como persona.
- **Dama, primer intento**: una corona de cinco puntas que se leía como
  hombreras de robot, por falta de huecos reales entre puntas.
- **Caballo**: "parecía cachorro" por el hocico corto y el ojo redondo
  grande — corregido alargando el hocico en dos tramos y achicando el ojo
  a forma de almendra.
- **Caballo, ya integrado al tablero real**: usaba una paleta "marrón
  caballo" separada del crema/carbón del resto del ejército — se veía
  como la pieza rara al lado de las demás. Corregido unificando el
  material (el caballo se distingue por la forma, no por ser de otro
  color).
- **Gema de la dama y cruz del rey**: quedaron sin recolorear en la
  primera pasada del script de recoloreo (se veían igual en blancas y
  negras) — la dama tenía un blanco suelto arriba (parecía un "capirote"),
  y la cruz del rey (lo que más necesita destacar) se camuflaba contra su
  propio cuerpo negro. Ambas corregidas.
- **Peón, tabardo**: la franja de color de equipo era angosta y
  centrada en el pecho — se leía como corbata. Ensanchada a tabardo real
  (cubre casi todo el torso) con un cinturón horizontal que corta la
  línea vertical.
- **Espada del peón**: colgando hacia abajo se leía como "bastón de
  desfile" — girada hacia arriba, junto al cuerpo, para una pose más de
  guardia firme.
- **Peón blanco, todo el conjunto**: sin ningún acento oscuro, el
  crema+dorado de arriba abajo se leía "todo blanco" — parecía uniforme
  de enfermero, no de soldado. Se cambiaron dos detalles que ya existían
  en la estructura (el cinturón horizontal, el borde inferior del casco)
  de sus colores originales a un negro cuero discreto — rompe el bloque
  claro sin volverse el centro de atención de la pieza.

## Recoloreo programático, no dibujado dos veces

Blancas en crema+dorado, negras en carbón+carmesí — un script Python
(`recolor.py`, no versionado en el repo, vivió en el entorno de trabajo)
remapea colores exactos desde una paleta base común (acero+rojo) a los
dos bandos. Esto evita dibujar cada pieza dos veces a mano, y garantiza
que ambos bandos comparten exactamente la misma estructura/proporción.
