# CHESSCOM · Sven V55 — volumen orgánico y asimetría sobre rig OSS

V55 es un **experimento artístico reproducible en Blender CPU**, no una sustitución del Sven de producción. Usa exactamente el SWAT CC0 verificado en V52 y preserva los 24 clips y el esqueleto. Parte de los accesorios V53, sin modificar la geometría procedimental del runtime Babylon.

## Qué cambia realmente

- **Siete objetos existentes** (mochila principal y solapa, portaplacas superior/inferior, dos pouches de cintura y bolsillo trasero) cambian su topología de cajas a **mallas de anillos variables, perfilados y contorno suavizado**, conservando transform y bone-parent de V53. No se acumulan modelos sobre las cajas viejas.
- **Asimetría localizada:** auricular acolchado izquierdo y banda sobre casco, pequeño cable flexible unido solo al hueso Head, radio lateral con antena en Chest, bolsillo administrativo desplazado, dos costuras en la mochila, rodilleras en cada `LowerLeg`.
- Materiales diferenciados por función: tejido mate, goma, cincha y control anodizado, sin colores chillones.
- Los detalles nuevos se parentan a huesos reales. **Nunca conectar con una curva rígida objetos de huesos distintos** (cables colgantes atravesarían el personaje).
- Presupuesto deliberadamente controlado: siete topologías reemplazadas, trece detalles adicionales; no desplazar la lectura de silueta a 72 px ni producir accesorios masivos.

El script de fuente es `scripts/blender/chesscom_sven_organic_v55.py`. Blender exporta `quaternius-cc0-preview.glb`, genera ocho vistas y la hoja a 72 px. El diagnóstico de V54 ahora usa la **misma pieza V55** en cinco acciones reales con dos poses cada una. Los contratos CI abren el GLB exportado y exigen nombres de nodos nuevos, 24 clips, skinning original, parentado y prohibición de promocionar.

## Condiciones de aceptación

1. Revisar PNG de ocho vistas y a 72 px, comparados con V53, comprobando que la mochila, pecho y radio se lean menos rígidos y no ensanchen exageradamente el personaje.
2. Revisar `animation-contact.png` de V55 contra V54: sin auriculares, rodilleras o cables flotando/intersectando visiblemente.
3. Confirmar en glTF exportado la presencia de piezas reales, materiales y 24 acciones. Una CI verde no prueba por sí sola calidad estética.
4. No afirmar todavía agarre bimanual: `Gun_Shoot` y `Run_Shoot` originales siguen siendo incompatibles con una carabina a dos manos. No publicar a R2, no activar A/B ni sustituir al Sven canónico.

El siguiente hito —después de aceptar este arte— es incorporar un fusil con licencia verificada y **animaciones authored/IK reales** que muestren contacto de ambas manos, cañón y transiciones de muerte.
