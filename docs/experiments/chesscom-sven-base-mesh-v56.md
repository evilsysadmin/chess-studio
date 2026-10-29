# CHESSCOM · Sven V56 — continuidad visual sin romper el skinning

## Diagnóstico del modelo real

El SWAT CC0 contiene cuatro mallas skinned, y el grueso de sus triángulos son **islas desconectadas con vértices duplicados**. En el GLB V55, `Swat_Body` tiene 6.302 vértices de render y `Swat_Legs` tiene 3.620. Una comprobación de los accessors mostró posiciones duplicadas del mismo material para casi todos: **6.294/6.302** y **3.597/3.620**. Esto explica por qué la malla parece robótica incluso con accesorios V55 mejorados.

### Experimentos rechazados antes de fusionar

1. Catmull-Clark nivel 1, aprobado por CI técnica pero **rechazado visualmente**: contrajo islas de geometría y creó huecos negros por todo el uniforme.
2. Microbisel de 1–1,6 mm, rechazado por el gate: sin aristas compartidas/manifold no puede modificar correctamente las mallas de origen.

Los dos experimentos se han retirado de la rama. No se deben recuperar sin soldar primero correctamente la topología y revisar UV/skin.

## Operación V56 actualmente propuesta

Reconstruir **solo las normales de sombreado de la tela** por agrupación de vértices en la misma posición y material, con un límite angular de 50°. Esto permite continuidad visual entre triángulos sin mover vértices ni cambiar sus UV, pesos o huesos. Material textil algo más mate, polímero y botas sin tratamiento geométrico.

Los gates comprueban que cada malla de tela tenga ≥100 esquinas comunes y ≥100 normales modificadas, que no haya giros artificiales mayores de 40°, que posiciones, número de triángulos y pesos se preserven, y que el GLB todavía tenga 24 animaciones auténticas. El mismo candidato se examina en ocho cámaras, un closeup y las diez poses del QA V54, con imagen adicional a 72 px.

**Límite explícito:** la operación de normales no mejora la silueta ni equivale a retopología humana. Si el efecto es escaso o aparecen manchas, se rechazará también y habrá que buscar una fuente corporal de mayor calidad / retopología authored. No hay rifle de dos manos, MuzzleSocket verificado, nuevo personaje desplegado, ni publicación a R2.

## Política

Esta PR es un experimento visual Draft y no debe ponerse Ready hasta inspeccionar los PNG/GLB del SHA exacto. La CI es condición necesaria, no aprobación estética. V55 permanece baseline seguro.
