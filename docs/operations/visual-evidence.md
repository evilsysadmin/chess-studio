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

## Auditoría entre salas: coherencia, no uniformidad

Además de comparar una sala consigo misma, comprobar el recorrido completo **Home → Jugar → War Room → postpartida → Entrenar → volver a jugar**. La identidad de cada entorno puede diferir, pero sus convenciones funcionales no deben sorprender al jugador.

La evidencia de aceptación reúne una tira de capturas runtime del **mismo SHA** y perfil de usuario (nuevo/recurrente), en escritorio y vertical 360, 390 y 430 px cuando el cambio afecte al core móvil. Anotar si hay overlays reales: Guardado, nueva versión y bocadillo/tutorial de Matthias.

Revisar específicamente:
- **Entrada y salida:** puerta/volver/cerrar inequívocos, accesibles por teclado y touch, sin trampas de pantalla completa ni menús sin escape.
- **Escala y cámara:** protagonista/juego legibles frente al decorado; ninguna ornamentación reduce de modo injustificado la superficie interactiva.
- **HUD y overlays:** prioridades de z-index consistentes; el aviso de guardado no tapa Ayuda, «…» ni botones primarios; CTA útil visible en 360 px.
- **Iluminación:** coherente con fuentes diegéticas pero suficiente en móvil; no compensar con paneles sólidos tipo dashboard.
- **Interacción:** targets táctiles ≥44×44 px donde corresponda, foco perceptible, ausencia de scroll horizontal; overlays no interceptan el primer toque del juego.
- **Audio/movimiento:** continuidad entre transiciones, reduced-motion respetado y ausencia de reproducción antes de autenticarse.
- **Reentrada:** una escena puede cerrarse y volver a abrirse sin duplicar canvases, audio ni pérdida de partida.

Para una PR que altera una sola sala, la tira transversal no obliga a rediseñar todas las demás: basta inspeccionar los puntos de contacto afectados. Si la comprobación depende de dispositivos físicos, reportar explícitamente que está pendiente; no sustituir su firma por Playwright. Un documento de intención o mockup no acredita ninguna de estas condiciones.

## Chronicles: partición del gate visual y coste del renderer

El gate `Chronicles · visual artifact` mantiene `Chronicles · capture` como contexto requerido estable,
pero ejecuta la suite canónica mediante `--shard=1/2` y `--shard=2/2` en **dos runners independientes**.
Es una partición de las mismas pruebas, sin recortar viewports, casos, assertions ni PNG. Cada shard
usa **un solo worker** para no saturar SwiftShader dentro del runner; los artifacts se publican con
sufijos `-part-1` y `-part-2` para inspección conjunta del mismo SHA.

Al cambiar el propio workflow, la acción compartida o el capturador, el gate fuerza la ejecución\nreal del productor de Chronicles (evita el falso verde de un shard sin pruebas).\n\nPara evitar el desequilibrio observado en la primera ejecución (shard 1 = 14,2 min,
shard 2 = 6,5 min), el menú móvil de pausa/audio se ejecuta como **canary temprano** en
un proceso Playwright nuevo del shard 2, y la captura WebGL desktop de 4 min se
ejecuta en otro proceso nuevo de ese shard. El resto de pruebas se reparte
mediante `--shard` con un filtro complementario `--grep-invert`; los dos
selectores son complementarios, así que ninguna prueba queda sin dueño.
Los filtros sólo aplican al productor completo de Chronicles: los fast paths
de libro de expediciones/setup y el productor de avatar conservan su selección.

El canary de menú sigue comprobando navegación, DOM y PNG reales; **no es una
captura falsa ni un retry**. Fallar cerrado al principio evita consumir
toda la suite cuando Home no permite entrar a Chronicles.

El job agregado `Chronicles · capture` sólo pasa si **ambos** shards terminan verdes; fallos,
cancelaciones y skips cierran el gate. Esto separa la carga y el ciclo de vida del renderer,
reduce el wall-clock crítico y evita que un solo navegador secuencial concentre todas las capturas.
No acredita visualmente el resultado: ambos conjuntos de PNG necesitan la inspección habitual.

Motivo medido (PR #5586, 2026-10-14): 42 tests con un worker, 21 verdes y fallo del caso 22
después de 15,4 minutos; una captura desktop tardó 4 minutos. Comparar los tiempos posteriores
por shard en CI antes de atribuir una reducción concreta; crear dos runners tiene coste total
de compute/build superior aunque reduzca latencia de entrega. La partición no corrige por sí
misma los fallos de entrada en Home, que siguen siendo errores bloqueantes reales del producer.
