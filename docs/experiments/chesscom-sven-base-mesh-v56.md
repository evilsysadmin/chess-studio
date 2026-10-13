# CHESSCOM · Sven V56 — la base corporal ya no debe parecer de cartón

## Problema observado

Las ocho vistas de V55 muestran progresos en mochila, casco y radio, pero el aspecto robótico procede principalmente de la geometría del **actor CC0 de origen**, no del número de accesorios. El GLB exportado contiene cuatro meshes skinned: `Swat_Body`, `Swat_Head`, `Swat_Legs` y `Swat_Feet`.

V56 aplica una prueba controlada **en el propio modelo deformable**:

- Una subdivisión Catmull-Clark de nivel 1, horneada ANTES del modificador Armature, únicamente en `Swat_Body` y `Swat_Legs`.
- Shading suave sobre esos dos meshes, para reducir facetas planas en uniforme, guantes, muslos y articulaciones.
- El casco/cara y las botas permanecen tal cual para preservar aristas funcionales, suela y lectura del material duro.
- Las siete superficies orgánicas y nueve detalles de V55 se mantienen. No se añaden accesorios ni cuerpos procedural nuevos.
- Guardarraíles en Blender: cuatro meshes de fuente skinned presentes, vertex weights ≥99 %, modificador Armature intacto, aumento real de topología en ambas mallas, máximo 75k triángulos por malla refinada.
- El workflow comprueba el **GLB reexportado**, conserva las 24 animaciones reales e inspecciona las mismas 10 poses del rig V54, además de ocho vistas, 72 px y un closeup auténtico de la ropa.

El efecto de subdividir NO se confunde con animación authored: los 24 clips siguen siendo los de Quaternius. El agarre bimanual y la carabina siguen sin estar implementados ni certificados.

## Criterio visual

La mejora solo se acepta si se ve menos robótica **sin volver blandos los accesorios rígidos**, aumentar demasiado polígonos, alterar la silueta a 72 px ni producir penetraciones visibles entre manos, torso y accesorios en las diez poses. Si la subdivisión suaviza demasiado las placas del uniforme original, limitarla a material textil o descartarla; una CI verde no basta.

Los resultados se publican únicamente como artifact de revisión, nunca como cambio en runtime, manifiesto o R2. Conservamos V55 en `main` hasta aprobar renders de V56. El siguiente salto mayor es un ciclo artístico real de retargeting/IK con fusil de procedencia verificada.
