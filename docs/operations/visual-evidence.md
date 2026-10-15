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

## Entrega visual en el chat de iteración (obligatoria)

**Toda PR visual debe enseñar su evidencia al usuario en el mismo chat donde se trabaja esa PR.** No es suficiente que los PNG existan en GitHub Actions, estén disponibles en la PR o hayan sido inspeccionados internamente.

1. **Capturar la realidad:** obtener screenshots PNG/renders reales del pipeline de authoring **y del runtime consumidor** cuando ambas fases estén afectadas. Asociar cada prueba al PR head SHA exacto y a la pantalla, estado y viewport. No sustituir una captura por un mockup, una imagen generada o una versión vieja de staging.
2. **Mostrarla aquí:** insertar las imágenes **visibles en el cuerpo del chat de iteración**, no solamente URLs, paths, nombres de artifacts, tablas de resultados o «capturas revisadas». Mostrar una selección representativa de cada superficie cambiada; incluir desktop y móvil si varía la composición. Si hay muchas capturas, presentar una tira/contact sheet legible y enlazar además el artifact completo; no inundar el chat con decenas de PNG casi idénticos.
3. **Hacer legible la comparación:** cuando exista baseline comparable, enseñar **antes y después** claramente identificados; etiquetar PR, SHA, escenario y viewport. Para animación, enseñar una secuencia/contact sheet o vídeo real cuando un frame aislado no baste.
4. **Compartir mientras se itera:** publicar el primer conjunto de evidencias en cuanto esté disponible y volver a mostrar las imágenes modificadas tras cambios visuales relevantes. Dar oportunidad al usuario de inspeccionar/comentar en esa misma conversación. No es obligatorio esperar una respuesta expresa si el usuario ha pedido iterar sin input, pero sí **mostrarle** la evidencia antes de darla por aceptada.
5. **Fallar con transparencia:** si GitHub no ofrece los PNG, no se pueden descargar/materializar, o el canal no permite incrustarlos, explicar exactamente qué evidencia falta o no puede mostrarse. No afirmar que se ha enseñado, no sustituirla silenciosamente por un enlace y **no** pasar a Ready ni habilitar automerge de esa PR visual hasta resolver la evidencia.

El enlace al run/PR sigue siendo útil como **complemento** para los artifacts completos, nunca como sustituto de las imágenes visibles en chat. Esta regla aplica a Home, War Room, Chronicles, Tactics, Football, Pawn Slug, ilustraciones, sprites y cualquier otra PR de aceptación visual.

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
pero distribuye la suite canónica en **tres runners independientes**, con grupos de pruebas
ponderados según el coste observado en CI. No se eliminan viewports, casos, assertions ni PNG.
Cada runner usa **un solo worker** para no saturar SwiftShader; los artifacts se publican con
sufijos `-part-1`, `-part-2` y `-part-3` y deben inspeccionarse conjuntamente en el mismo SHA.

Al cambiar el propio workflow, la acción compartida o el capturador, el gate fuerza la ejecución
real del productor de Chronicles (evita el falso verde de un shard sin pruebas).

Para evitar el desequilibrio observado en la primera ejecución (shard 1 = 14,2 min,
shard 2 = 6,5 min), el menú móvil de pausa/audio se ejecuta como **canary temprano** en
un proceso Playwright nuevo del **runner 3**, y la captura WebGL desktop de 4 min se
ejecuta en otro proceso nuevo del mismo runner. El resto de pruebas se reparte mediante `--shard` con un filtro
complementario `--grep-invert`. Se usan **ocho subshards** ponderados de acuerdo
con las mediciones del gate de tres runners en la #5606: runner 1 recibe `1,4,7,8`;
runner 2 recibía `2,3,5`; runner 3 recibía `6` más los dos canaries (distribución histórica). Cada proceso contiene
un máximo aproximado de cinco casos:
reiniciar Chromium periódicamente limita la acumulación de contextos SwiftShader
y aísla el fallo que aparecía al final de una serie larga de capturas.
Los selectores son complementarios y ningún caso queda sin dueño; siguen
sin existir retries ni aserciones relajadas.
Los filtros sólo aplican al productor completo de Chronicles: los fast paths
de libro de expediciones/setup usan `--shard=1/3`, `2/3` y `3/3`.
El productor **avatar-only** tiene únicamente dos tests (desktop y Android):
los runners 1/2 ejecutan uno cada uno y el tercero declara explícitamente
`has_specs=false`, sin fabricar un tercer test ni publicar un artifact vacío.

El canary de menú sigue comprobando navegación, DOM y PNG reales; **no es una
captura falsa ni un retry**. Fallar cerrado al principio evita consumir
toda la suite cuando Home no permite entrar a Chronicles.

El job agregado `Chronicles · capture` sólo pasa si **los tres** runners terminan verdes; fallos,
cancelaciones y skips cierran el gate. Esto separa la carga y el ciclo de vida del renderer,
reduce el wall-clock crítico y evita que un solo navegador secuencial concentre todas las capturas.
No acredita visualmente el resultado: ambos conjuntos de PNG necesitan la inspección habitual.

Motivo medido (PR #5586, 2026-10-14): 42 tests con un worker, 21 verdes y fallo del caso 22
después de 15,4 minutos; una captura desktop tardó 4 minutos. Comparar los tiempos posteriores
por shard en CI antes de atribuir una reducción concreta; crear dos runners tiene coste total
de compute/build superior aunque reduzca latencia de entrega. La partición no corrige por sí
misma los fallos de entrada en Home, que siguen siendo errores bloqueantes reales del producer.


Iteración de rendimiento posterior a #5595: la suite de 40/40 casos pasó en dos runners,
pero el más lento consumió ~14 minutos. La agrupación ponderada pretende acercar el
camino crítico a ~10 minutos, pagando un tercer runner por ejecución completa.
El objetivo **no está acreditado** hasta medir los nuevos logs; no confundir un gate
verde con la demostración de reducción de latencia. La distribución se reevalúa
cuando se añadan tests o se modifiquen los costes del productor.


Reequilibrio posterior a #5606: en el primer gate verde de tres runners se midieron
**8m18s / 11m37s / 10m14s** de wall-clock total (incluida la preparación),
frente a unos 14m30s del camino crítico con dos runners. La asignación reequilibrada
mueve el grupo 4 (~6m30s) al runner 1 y los grupos 2/3 al 2, dejando el runner 3
para el canary WebGL desktop (~4m), el canary menú y el grupo 6 (~4m36s).
Es una hipótesis de ~10m basada en esos tiempos, no un resultado acreditado:
volver a medir los tres runners y revisar los 141 PNG del SHA exacto.

Reequilibrio tras #5642 (15-10-2026): con la ficha y las consultas CDP optimizadas,
las mediciones wall-clock por runner fueron **6m54s / 9m55s / 4m17s**.
La primera hipótesis movió el grupo 2 (~3m54s) al runner 3, pero el SHA
`ebc6a329` **falló realmente**: tras los canaries, Home se quedó en `LOADING`
y el caso `Rookwood side quest walk · desktop-1440x900` agotó sus 60s.
No se ocultó el fallo con retries, ni se aceptó esa versión.

Reparto corregido y sujeto a nuevo gate visual:
**runner 1: `1,3,4,7,8`; runner 2: `2,5`; runner 3: canaries aislados + `6`**.
Se mueve el grupo 3 (~1m24s) al runner 1, antes del grupo pesado 4;
el runner 2 conserva el grupo 2 en entorno fresco y runner 3 mantiene el
orden previamente probado. Los ocho grupos siguen siendo exclusivos.
El cuello de botella esperado es ~8m30s, **sólo una predicción**, que deberá
confirmarse con tres jobs + agregador GREEN, 40/40 tests y las **169 rutas PNG**
del baseline vigente intactas.
