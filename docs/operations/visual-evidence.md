# Evidencia visual y regresión — contrato transversal

Este contrato aplica a Home, War Room, Pawn Slug, Chronicles/Tactics y cualquier cambio cuya aceptación dependa de cómo se ve el producto real.

## Dos pruebas distintas

Separar siempre:
- evidencia de authoring: Blender render, contact sheet, atlas review, frame debug;
- evidencia runtime: captura de la aplicación/juego consumiendo el asset exacto.

Una no sustituye a la otra. Un Blender PNG correcto no demuestra que Three.js cargue el GLB; un spritesheet correcto no demuestra que Godot lo renderice con escala/pivot/filter correctos.

## Identidad de revisión

Todo artifact visual debe poder asociarse a una revisión exacta:
- PR head SHA o revisión authored equivalente;
- hash/content ID del asset cuando aplique;
- logical ID/manifest revision si existe promoción R2;
- viewport y ruta/estado capturados.

No aprobar un PNG si no se sabe qué bytes/runtime representa.

## Baseline

Comparar contra el último baseline aceptado de la misma superficie y condiciones comparables.

Revisar explícitamente:
- composición/framing;
- escala relativa y pivots;
- clipping/overflow;
- materiales/exposición/contraste;
- artefactos alpha/bleed/texto accidental;
- continuidad temporal cuando hay animación;
- overlays globales y z-order;
- legibilidad a escala real;
- mobile/touch cuando la composición pueda cambiar.

El baseline es referencia, no un golden pixel rígido: cambios deliberados pueden modificarlo, pero la diferencia debe ser explicable.

## Viewports

Capturar sólo los viewports que realmente pueden verse afectados, pero no validar una composición responsive únicamente en desktop.

Cuando aplique:
- desktop representativo;
- móvil estrecho;
- móvil alto/portrait;
- reduced-motion o touch si alteran la ruta visual.

## Runtime exacto

La captura runtime debe demostrar que el consumidor cargó la revisión esperada. Si existe manifest/R2, verificar logical ID/hash/revision antes de concluir que la imagen corresponde al cambio.

No usar una captura de staging vieja como prueba de una PR nueva.

## Animación

Para sprites/transiciones/movimiento, un frame aislado no acredita continuidad.

Usar contact strip, secuencia, vídeo corto o múltiples capturas cuando haya que validar:
- jitter;
- footline/pivot;
- weapon/body continuity;
- entrada/salida de escena;
- transiciones de estado;
- timing narrativo.

## CI

CI puede generar artifacts de review, pero no convierte automáticamente una visual en aceptada.

- artifact generation debe ser determinista cuando sea razonable;
- fallar cerrado en invariantes mecánicas/geométricas medibles;
- la inspección visual valida lo que no puede reducirse a un número;
- no conservar artifacts sin contexto/hash suficiente para saber qué representan.

## Regresión

Si la evidencia muestra una regresión:
1. identificar si nace en authoring, export, publicación, promoción o runtime;
2. corregir la fase propietaria;
3. regenerar evidencia de esa misma revisión;
4. no maquillar el síntoma en CSS/runtime si el asset authored está mal, ni regenerar el asset si el bug real es de consumo.

## Acceptance

Un cambio visual está listo cuando existe evidencia suficiente para la fase tocada, está ligada a la revisión exacta, fue comparada con baseline y no deja una regresión conocida sin explicar.
