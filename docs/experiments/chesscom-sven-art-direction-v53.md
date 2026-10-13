# CHESSCOM · V53 — Sven art-direction sobre rig OSS real

## Alcance

Partimos exclusivamente del SWAT 3D CC0 fijado y auditado en V52. Esta iteración **no crea otro humano procedural en Babylon**: conserva las cuatro mallas con skinning y las 24 animaciones originales, y añade geometría de equipamiento en Blender exportada al mismo GLB.

El script `scripts/blender/chesscom_sven_art_direction_v53.py` materializa y ancla a huesos reales:

- Casco con soporte frontal, puente de visión nocturna binocular, dos ópticas y carriles laterales.
- Portaplacas modular, paneles balísticos, correas y portacargadores diferenciados.
- Mochila con solapa, cintas y bolsillo bajo.
- Parches de identificación azul/blanco en ambos hombros.
- Paleta azul petróleo / negro balístico / nylon, con contraste coyote muy contenido.

El modelo base, su rig y sus 24 clips siguen siendo del paquete Quaternius. Cada accesorio tiene su propio objeto Blender y su hueso padre (Head, Chest, Torso, Hips, Shoulder.L/R). La CI verifica **el GLB resultante**, no solo los logs.

### Límites claros

Este modelo todavía NO es Sven definitivo. Se utiliza para evaluar si un esqueleto OSS riggeado puede recibir equipamiento authored con buena silueta y sin romper animaciones. No modelamos aquí una carabina empuñada por ambas manos, ni añadimos MuzzleSocket fingido, porque esas operaciones necesitan pruebas de agarre y disparo reales. Queda excluido de producción/R2 y del A/B canónico; las ocho vistas son evidencia de laboratorio.

No se acepta añadir más paneles por mera decoración. Las mejoras futuras deben basarse en revisar primero los PNG a zoom táctico y comprobar integridad del rig en varios estados (Idle_Gun, Walk, Gun_Shoot).

### Cómo se valida

La pista existente `CHESSCOM · OSS Character Forge V52` corre sobre cambios V53. Descarga el GLB CC0 exacto, modela las piezas en Blender 4.0 CPU, exporta y revisa:

- Las 24 animaciones y skinning sobreviven al nuevo GLB.
- Por lo menos 30 objetos de equipamiento V53 están presentes en el glTF binario y siguen asociados al rig.
- Ocho renders PNG únicos y sin recorte.
- Contact sheet y prueba a 72px.
- Artifact `chesscom-oss-cc0-v52-review-RUN_ID` con PNG/GLB y recibos.

**Revisión visual obligatoria**, PR Draft hasta abrir/inspeccionar outputs; una CI verde no equivale a aprobación estética. Si el casco, las ópticas o la mochila flotan al reproducir animaciones, ajustar huesos/offsets antes de promocionar a ninguna escena.
