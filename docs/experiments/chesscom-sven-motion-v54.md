# CHESSCOM Sven V54 · Validación de poses antes del fusil

El SWAT CC0 original de Quaternius incluye **24 animaciones reales**. V53 conserva ese rig y añade equipamiento. Sin embargo, el nombre `Gun_Shoot` no implica automáticamente que haya una carabina agarrada con ambas manos.

## Hallazgo objetivo

Al muestrear directamente los canales glTF de las muñecas sobre el GLB V53:

- `Idle_Gun`: manos separadas aproximadamente 0,29–0,31 m.
- `Gun_Shoot`: alrededor de 0,45–0,50 m; la muñeca derecha sube, mientras la izquierda permanece relativamente baja.
- `Run_Shoot`: distancia muy variable, aproximadamente 0,20–0,55 m en las muestras.
- `Death`: los brazos acaban extendidos y separados; no debe quedar una carabina pegada a la muñeca.

Estos datos son del GLB exportado y **no demuestran agarre estable de un fusil**. El clip de disparo se parece más a una acción de una mano. No debemos reutilizarlo como animación definitiva de una carabina.

## Qué añade V54

- Script Blender que aplica las **acciones auténticas** `Idle_Gun`, `Gun_Shoot`, `Run_Shoot`, `Walk` y `Death` al rig original con equipamiento V53.
- Dos frames PNG diferentes de cada acción, desde una cámara de inspección idéntica.
- `motion-report.json` con fotograma, posición espacial de ambas muñecas, distancia entre manos y movimiento medido.
- `animation-contact.png` con diez vistas, nombre de clip y distancia.
- Workflow CPU existente verifica artefactos, clips realmente activos y el bloqueo de promoción.

No se añade un rifle decorativo ni se fabrica una animación ficticia. **V54 es una prueba de movimiento; aún no está autorizada como Sven canónico.**

## Siguiente implementación artística

Cuando la hoja de poses confirme posiciones y colisiones, crear o incorporar un fusil con procedencia/licencia verificable. Retargetear `Idle_Gun` y `Gun_Shoot` para apoyo real de mano izquierda en el guardamanos y mano derecha en empuñadura, hornear clips, dejar `MuzzleSocket` alineado con el cañón, controlar transiciones `Walk`/`Death` y validar capturas de Blender y Babylon del **mismo GLB/SHA**.

La fuente CC0 no justifica afirmar que ya existe ese trabajo. Sin poses de dos manos y prueba visual, V4 sigue siendo el renderer por defecto.
