# Rendimiento runtime — contrato de medición y degradación

Este contrato aplica a superficies interactivas pesadas: War Room, Home 3D, Chronicles/Tactics 3D, Pawn Slug web y cualquier vista donde renderer/animación pueda comprometer jugabilidad.

## Qué medir

No aprobar rendimiento por una captura estática o un frame en reposo.

Medir el camino que realmente estresa la superficie, por ejemplo:
- movimientos/animaciones repetidas;
- cámara/parallax/hover cuando existan;
- partículas/luces dinámicas;
- carga de assets y transición a estado interactivo;
- mobile/touch cuando use una ruta distinta.

Registrar al menos:
- frame pacing/fps útil durante la secuencia sostenida;
- jank/frames lentos;
- tiempo hasta interacción cuando el cambio afecta bootstrap;
- memoria/recursos cuando haya riesgo de crecimiento sostenido.

No fijar un número universal para todas las superficies: cada baseline debe compararse con hardware/viewport/ruta representativos y con su última versión aceptada.

## GPU real vs software

Antes de atribuir una regresión al producto, comprobar qué renderer está usando el browser.

- SwiftShader/software rasterizer invalida conclusiones sobre rendimiento GPU real si el objetivo es hardware acelerado.
- La ruta software sigue siendo útil para compatibilidad, pero se reporta separadamente.
- En local con GPU disponible, usar Chromium/renderer realmente acelerado de extremo a extremo.

## Escena quieta vs interacción

Una escena puede sostener buen fps quieta y arrastrarse durante movimientos por:
- raycasts/hit tests;
- recomputación de geometría/materiales;
- sombras dinámicas;
- filtros CSS/composición;
- GC/allocations por frame;
- uploads de texturas/meshes;
- lógica duplicada en renderer.

Las pruebas deben ejercitar el estado animado sostenido que el usuario percibe.

## Degradación adaptativa

Se pueden degradar efectos no esenciales cuando existe evidencia de frame pacing pobre.

Permitido, según superficie:
- sombras;
- postprocesado/filtros;
- partículas;
- densidad decorativa;
- reflejos/luces secundarias;
- frecuencia de actualizaciones puramente visuales.

No degradar:
- legalidad;
- input hitboxes semánticos;
- estado de tablero;
- clocks;
- resultado;
- información funcional necesaria;
- último frame/estado final de una animación de movimiento.

La adaptación debe ser estable/histerética; evitar oscilar de calidad cada pocos frames.

## War Room

- El tablero sigue siendo prioritario sobre decoración.
- La posición final de cada movimiento siempre se renderiza aunque se reduzca la animación intermedia.
- Una optimización del renderer no crea un segundo modelo de ajedrez.
- v1 y v2 se miden por separado; una degradación diseñada para v1 no se hereda automáticamente a v2.

## Mobile

Touch/mobile puede usar una ruta de menor coste deliberada. Eso no autoriza a ocultar overflow, controles inoperables o una escena que deja de comunicar destinos/estado.

## Acceptance

Una optimización está lista cuando:
- la prueba reproduce el workload real;
- identifica renderer/hardware;
- compara con baseline representativo;
- mejora el cuello de botella sin cambiar semántica;
- no introduce oscilación visual o estado final perdido;
- desktop/mobile afectados siguen utilizables;
- existe regresión automatizada cuando la métrica puede medirse de forma estable.

## Capacidad backend / motor

Antes de abrir más tráfico o aumentar workers del motor, medir la cola real. `scripts/production_capacity_probe.py` separa perfiles de engine, Mongo read/write, carga mixta y `game-turn`. Este último crea una partida efímera propia por muestra, cronometra sólo `POST /api/games/{id}/move` —jugada humana → cálculo de Matthias → persistencia— y limpia la partida después; el throughput conserva también el coste de setup/cleanup, así que es deliberadamente conservador. La sonda exige autenticación, emite p50/p95, throughput, tasa de error, códigos HTTP y request IDs y correlaciona la misma ventana con CPU/RAM/load de la A1 y métricas backend en Grafana.

Ejemplo contra staging con una API key de automatización:

```bash
CHESS_CAPACITY_BASE_URL=https://api-staging.chess-studio.shadowops.dpdns.org/api \\
CHESS_CAPACITY_API_KEY=... \\
python3 scripts/production_capacity_probe.py --samples-per-level 8
```

Guardarraíles:
- el hostname productivo se rechaza salvo `--allow-production` explícito;
- el probe no decide por sí solo subir `max_workers`: hay que correlacionar p95/amplificación con CPU/RAM y errores;
- usar staging para construir la curva normal; producción sólo en una ventana controlada y con muestra pequeña;
- si aparece 429, 5xx o timeout, conservarlo como capacidad observada, no esconderlo con retries del benchmark;
- el límite operativo se fija por debajo del punto donde p95 o error rate se degradan de forma sostenida.
- no convertir ops/s de `/analyze` directamente en “usuarios simultáneos”; usar `game-turn` para medir el camino de jugada real y después traducirlo con una cadencia humana explícita y margen de ráfaga.
- el escenario `game-turn` usa dificultad 50 como baseline representativo; dificultades extremas se miden aparte antes de prometer capacidad para ellas.
- con un único worker, el análisis opcional no debe construir cola delante de gameplay: `/api/analyze` y `/api/analyze-move` usan admisión acotada y pueden responder `503 Retry-After: 1` cuando el slot opcional está ocupado; `move`, apertura CPU e `hint` permanecen en el camino crítico y no se rechazan por ese gate.
- el límite opcional por defecto coincide con `CHESS_ENGINE_WORKERS`; cualquier override `CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT` debe volver a medirse antes de producción.

## Tiempo percibido entre salas (contrato transversal)

Además del FPS una vez dentro de la sala, medir el recorrido **intención del usuario → primer frame significativo → primera interacción funcional**. La primera interacción exige respuesta del control real, no sólo que el canvas exista. No confundir `DOMContentLoaded`, mount del componente o desaparición de un spinner con jugabilidad.

Para cada transición Home → Preparación/Jugar → War Room, Postpartida → Entrenar y vuelta a jugar, registrar:

| Punto | Inicio | Fin | Evidencia |
| --- | --- | --- | --- |
| Intent-to-first-frame | click/tap válido | primera escena útil visible | marca monotónica + captura runtime |
| Intent-to-interactive | mismo click/tap | primer input de juego aceptado | traza del input y respuesta de la vista |
| Segunda visita | nueva entrada a la sala | primera interacción | comparación warm vs cold |
| Salir y regresar | salida real | reentrada jugable | contador de contextos, listeners y recursos |

Comparar **cold**, **warm**, dispositivo móvil representativo y escritorio. Separar tiempo de red/descarga, decodificación, compilación de shaders, montaje y transición; reportar cifras observadas, no umbrales inventados. Si falla una carga de GLB/textura, debe existir estado de error y salida operable, no spinner perpetuo.

La precarga se permite sólo cuando hay intención razonable del usuario y no penaliza la escena activa: no precargar indiscriminadamente todos los experimentos al entrar en Home. Toda nueva precarga debe demostrar consumo acotado y cancelar o reutilizar trabajo al navegar rápidamente. Una escena descargada pero no utilizada no debe mantener innecesariamente render loops, listeners ni contexto WebGL.

**Acceptance adicional para cambios de transición:** ejecutar el ciclo A → B → A al menos repetidamente con y sin cache; observar que la latencia no crece sesión tras sesión, que el primer toque funciona y que se liberan recursos al desmontar. Registrar el SHA, entorno, viewport, renderer y los números de antes/después. Cualquier optimización que mejore FPS pero empeore perceptiblemente intent-to-interactive requiere justificación explícita.


## War Room V3/V4 · benchmark local de cadencia sostenida (#5765)

La prueba optativa `e2e/war-room-gpu-benchmark.spec.js` usa la **app y WebGL reales** con backend de juego simulado, sin alterar el renderer de producción. Queda **excluida de CI ordinaria**, porque GitHub hosted usa SwiftShader: el hardware debe comprobarse en el equipo que ejecuta el benchmark.

Desde un checkout limpio de **cada SHA** a comparar (mismos assets R2, misma máquina, navegador, resolución y configuración):

```bash
cd frontend && npm ci && VITE_WAR_ROOM_VARIANTS_ENABLE=1 npm run build && cd ..
cd e2e && npm ci
WAR_ROOM_GPU_BENCH=1 \
WAR_ROOM_GPU_BENCH_RENDERER=hardware \
WAR_ROOM_GPU_BENCH_VARIANT=v3 \
WAR_ROOM_GPU_BENCH_SHA="$(git rev-parse HEAD)" \
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia \
./node_modules/.bin/playwright test war-room-gpu-benchmark.spec.js \
  --config=playwright.config.js --project=chromium --workers=1
```

AMD/Intel Mesa: usar `DRI_PRIME=1` cuando corresponda en vez del offload NVIDIA. Para diagnóstico control de compatibilidad puede usarse `WAR_ROOM_GPU_BENCH_RENDERER=software`; **nunca** se mezclan sus métricas con las de hardware. Un renderer desconocido, SwiftShader inesperado o falta de WebGL real hace fallar la prueba.

Cada SHA produce tres JSON en `.artifacts/war-room-gpu-benchmark/`: escritorio 1440×900, touch **emulado** vertical 390×844 y horizontal 844×390. En cada perfil abre primero la sala en una pestaña nueva (first visit) y después vuelve a entrar dentro del mismo contexto del navegador (return visit), con caché de navegador compartida; este etiquetado no demuestra por sí solo un HIT de red. Los dos recorridos inician una sesión E2E autenticada y restaurada (sin depender del formulario «Usuario»), **verifican que se abre la antesala real «Configurar partida rápida» y que «Empezar partida» produce un tablero 3D real**, montan la **War Room V3 o V4 seleccionada con su GLB real**, registran identidad de renderer GPU, primera carga/contadores WebGL, memoria expuesta al ready, una muestra de 2,5 s de cadencia rAF inactiva y otra durante una jugada e2→e4 real con confirmación de la API simulada. Se cuentan pausas >33 ms y >50 ms y tareas largas cuando el navegador permite PerformanceObserver.


Para capturar **V3 y V4 en una sola sesión física**, el runner de baseline
acepta `--variant both`: instala dependencias y compila el mismo SHA **una vez**
y ejecuta luego cada sala con sus propios JSON y Markdown, sin comparar
directamente sus métricas. El modo individual `--variant v3|v4` mantiene
la disposición de resultados anterior (`A/` y `baseline.md`).

```bash
python3 scripts/run_war_room_gpu_baseline.py \\
  --revision-sha "$(git rev-parse HEAD)" \\
  --variant both --renderer hardware --offload nvidia --repetitions 2
```

El manifiesto raíz `session.json` permanece `incomplete` hasta terminar
ambas variantes e indica `completedVariants` para distinguir capturas
parciales en caso de fallo. Los resultados se aíslan en
`v3/A/*.json`, `v3/baseline.md`, `v4/A/*.json` y
`v4/baseline.md`. Ejecutar una variante primero puede alterar la temperatura
de la GPU: **este modo no constituye una comparación causal V3 vs V4**.
Para optimizaciones, seguir comparando V3→V3 o V4→V4 en el A/B/B/A.

Para V4, establecer `WAR_ROOM_GPU_BENCH_VARIANT=v4`. El runner aislado de A/B/B/A acepta `--variant v3|v4` (por defecto V3), conserva los mismos SHAs/harness y guarda la variante en el manifiesto de sesión y en los JSON individuales. Por ejemplo, tras elegir dos SHAs completos que contengan la variante V4:

```bash
python3 scripts/run_war_room_gpu_ab.py \\
  --baseline-sha "<SHA_BASE_DE_40_CARACTERES>" \\
  --candidate-sha "<SHA_NUEVO_DE_40_CARACTERES>" \\
  --variant v4 --renderer hardware --offload nvidia --repetitions 2
```

El comparador **rechaza cohortes mezcladas V3/V4**, incluida una mezcla entre A y B. Los antiguos JSON schema 2 sin `variant` siguen interpretándose como V3. Una comparación V3 frente a V4 requiere un experimento diferente; el A/B de regresión solo compara una sala consigo misma. Los JSON sin `bootstrapMode` corresponden al flujo antiguo con formulario; los nuevos declaran `persisted-e2e-session-v1`. El comparador **rechaza mezclar ambas estrategias de inicio**, porque sus tiempos de apertura no son comparables. El runner fija también `helpers.js`, el helper compartido de entrada a la partida rápida, los controles de teclado y el servidor de dist con el mismo SHA de harness para A y B. El smoke de CI ya no solo comprueba Home: abre la antesala y una partida auténtica, **activa el journal opcional y comprueba que registra draws reales (llamadas, triángulos y duración CPU)** con Chromium de CI; las queries físicas WebGL2 y los resultados NVIDIA siguen siendo exclusivamente locales. Un clic del acceso de Home que no abre la antesala se reintenta como máximo una vez, y si falla se informa del estado de la página; nunca se fabrican datos GPU ni se aceptan partidas reanudadas como nuevas. Igual que antes, rAF no es tiempo GPU; los datos GPU se publican únicamente con queries reales y procedencia verificada.

**Estabilidad del escenario Hans (V3/V4):** el shell puede declarar
`ready` antes de que se complete la instalación asíncrona de Hans.
El benchmark mantiene `openToReadyWallMs` hasta el primer shell/paint,
pero espera `data-war-room-hans-stage` con identidad de la variante y
estado `quick` o `idle` antes de muestrear `idle` y `move`.
Registra `hansStage` y `hansReadyAfterShellMs` por visita. Un actor
`missing`, `error` o que nunca termine hace fallar la captura en vez de
parecer una GPU más rápida. **Antes de iniciar las muestras** también espera
la finalización del ranking diferido de sombras: en escritorio GPU físico
`ready-budgeted` con triángulos seleccionados positivos; en touch emulado
o SwiftShader `disabled-lite`. Una sala a medio inicializar o con sombras
inesperadamente desactivadas falla el benchmark, en lugar de producir un
falso ahorro de draw calls. El comparador sigue admitiendo JSON antiguos
para rAF, pero muestra `n/a` para sus deltas GPU sin procedencia
completa de Hans o cuando el estado montado cambia entre revisiones.
Esto **no** modifica la carga normal de la sala ni añade espera a las partidas.

En `comparison.md` también se comparan tres medidas **de reloj de pared**
en primera y segunda visita: `open→shell-ready`, `shell-ready→Hans-ready`
y `open→Hans-ready`. La tercera se calcula **por visita** sumando los dos
tramos observados antes de tomar la mediana; no suma medianas de cohortes
distintas. Incluyen navegación y preparación de Home automatizadas, pero
**no** el formulario de login, por lo que no representan únicamente
descarga GLB ni render GPU. Los JSON antiguos sin
`hansReadyAfterShellMs` conservan su tiempo de shell, pero el retraso
de Hans y el tiempo total de escena aparecen como `n/a` en lugar de
presuponerse cero.

**Nuevo diagnóstico de carga sostenida por fotograma:** con el perfil GPU habilitado, el renderer añade un journal acotado de cada llamada **real** a `renderer.render()`. Captura los contadores `renderer.info.render.calls` y `triangles` inmediatamente después de cada render (Three.js los reinicia en renders posteriores), junto con la duración CPU de la llamada a `renderer.render()`. No se crean queries GPU extra, no se fuerza un render adicional y la sesión normal no instala este journal. El benchmark separa las muestras cuyo **inicio y fin** pertenecen a idle o move: reporta por fase medianas/p95 de draw calls por render, mediana de triángulos por render y mediana/p95 de **CPU submit** en milisegundos. Si hay menos de tres renders, desaparece el journal o se desborda el búfer, devuelve `n/a` y no infiere frames desde rAF. Los JSON anteriores sin `renderCost` siguen siendo válidos para sus métricas originales y muestran `n/a` para las nuevas filas. Los SHAs anteriores a esta instrumentación **no** pueden aportar un coste sostenido histórico simplemente copiándoles el harness nuevo: el código runtime antiguo no registraba esos frames. Para comprobar una futura optimización de draw calls hay que elegir dos revisiones instrumentadas y usar exactamente la misma sala y GPU.

**Diagnóstico de distribución de draw calls entre pasadas:** durante el opt-in del profiler GPU, una sonda reversible rodea el `renderer.shadowMap.render` **existente** de Three.js y toma la diferencia de `renderer.info.render.calls` antes/después de la pasada de profundidad. Cada render real conserva la cifra de draw calls de sombras y de resto de la escena (`mainCalls + shadowCalls = calls`), además del número de invocaciones a shadowMap. La sonda se desinstala al cerrar el perfil, sin cambiar luces, materiales, geometría ni emitir renders adicionales; si los contadores no son válidos o el API no se puede instrumentar, la separación es `n/a`. Los JSON antiguos siguen siendo legibles y no reciben una división retrospectiva inventada. La tabla `## Measured shadow-depth versus main-scene submissions` en el baseline físico diferencia ambas cifras y evita atribuir el coste a las 75 mallas originales sin evidencia. *32 shadow casters* significa **32 mallas autorizadas a proyectar sombras**, no 32 emisores de luz.

**Censo exacto de familias de sombras (opt-in):** el profiler observa también `WebGLRenderer.renderBufferDirect` *dentro de la pasada existente de sombras* y clasifica cada envío realizado en tres grupos por ascendencia: piezas de ajedrez (grupo con `type/color/square`), escena original Blender GLB (raíz identificada) y otros casters. No usa un censo de mallas para fingir draw calls: suma el incremento real de `renderer.info.render.calls` tras cada envío. Sólo publica la clasificación si las tres familias suman **exactamente** `shadowCalls`; si falta el API, cambia la ruta Three o las cifras no cuadran, publica `n/a`. El método original se restaura al desmontar el profiler, no se instrumenta ninguna sesión normal y no cambia geometría, sombras, luces ni apariencia. La tabla `## Measured shadow draw calls by object family` del baseline físico permite decidir si el siguiente experimento debe centrarse en piezas, Blender o decoración. El wrapper de profiling puede introducir sobrecoste CPU, por lo que no utilizar un antes/después entre capturas con distinta instrumentación como prueba de ahorro temporal: el experimento definitivo exige A/B equivalente y capturas visuales.

**Semántica de métricas**: intervalos entre callbacks `requestAnimationFrame` = cadencia de oportunidades del navegador, **no** tiempos de GPU ni FPS exactos de los draws. `inputToConfirmationMs` incluye automatización de teclado, mutación y aserción de estado, no latencia exclusiva del dispositivo. `openToReadyWallMs` abarca navegación/preparación desde una sesión E2E restaurada, no equivale a tiempo de descarga GLB. `snapshotMemory` son los contadores que la sala publica al ready, no consumo VRAM. `gpuFrameTimeMs: null` y `gpuTimerQueryMeasured: false` evitan atribuir números GPU no medidos.

Repetir cada revisión en el mismo host en órdenes alternos A/B/B/A (varias repeticiones); comparar distribuciones y no un único p95 ruidoso. No lanzar varios navegadores o renders en paralelo. Comprobar con GPU profiler/EXT timer query independientes cualquier hipótesis de saturación real. **El modo touch emulado en GPU de escritorio no acredita Android físico**: probar también un móvil real con navegador, rotación y fluidez durante varias jugadas antes de considerar cerrado el coste móvil.

No fusionar una nueva optimización de luces, materiales o GLB basándose exclusivamente en un JSON de este benchmark; conservar captura visual, comparación de triángulos/draw calls y paridad de jugabilidad. La issue #5765 permanece abierta hasta tener medidas repetidas sobre hardware.


### Baseline de una sola revisión · War Room V3/V4

Una vez integrada la instrumentación de coste sostenido, **no hace falta
comparar dos commits** para localizar cuánto dibujo persiste en la sala
actual. En Nobara/NVIDIA, con checkout actualizado y el puerto 4173 libre:

```bash
git pull --ff-only
python3 -S scripts/run_war_room_gpu_baseline.py \\
  --variant v3 --renderer hardware --offload nvidia --repetitions 2
```

El script prepara **un único worktree A**, compila la revisión local `HEAD`,
ejecuta dos rondas de los tres perfiles (escritorio y touch emulado), y
produce una sesión inmutable en `.artifacts/war-room-gpu-baseline/<sesión>/`,
con `baseline.md`, `session.json` y seis capturas JSON. Un fallo retiene
logs/JSON parciales, pero deja el manifiesto como `incomplete`, sin informe
de baseline válido. `--revision-sha <40 caracteres>` permite medir otra
revisión **que ya contenga la instrumentación**; las anteriores son
rechazadas, aunque se les copie el harness nuevo.

El baseline incorpora también un **censo estático y solo de diagnóstico** reutilizando datos que la sala ya expone: número de mallas originales del GLB (candidatas al análisis de sombras antes de los efectos runtime), lotes de antorchas V3 agrupados, presupuesto y número observado de emisores de sombras, estado de la preparación diferida, y **triángulos potenciales de mallas candidatas y casters seleccionados**. La columna de seleccionados solo presenta cifras con warmup `ready-budgeted`; otros estados se marcan `disabled`, `pending` o `n/a`, nunca como un cero de GPU medido. Estos números **no son draw calls** y no deben restarse de las draw calls sostenidas; una malla puede producir distintos números de draw submissions según material, visibilidad y pasadas de sombra. El censo ausente figura como `n/a`, nunca como cero, y las capturas inconsistentes muestran rangos.

El informe usa sólo renders reales completados en idle y move: mediana/p95
de draw calls, mediana de triángulos, tiempo CPU de `renderer.render()`,
y tiempo GPU `TIME_ELAPSED_EXT` cuando las queries verificadas existen.
Un journal ausente, incompleto o desbordado invalida la baseline, en lugar
de convertir rAF en frames dibujados. No demuestra mejora de FPS ni sustituye
la comparación A/B posterior. `--variant v4` usa la misma disciplina con
V4. **No se ejecuta la captura física GPU en CI**; sólo el autotest sintético.

### Diagnóstico GPU real de War Room, opt-in (WebGL2)

Home ya usa `EXT_disjoint_timer_query_webgl2` para observar tiempo de GPU
sin bloquearla. War Room reutiliza exactamente ese temporizador cuando se
solicita explícitamente en el navegador, en la propia escena Three.js
(juego real, **no** una canvas de prueba).

Para una sesión manual en Nobara, abrir la app con
`?warRoomGpuProfile=1` en la URL **antes de entrar en la partida**;
alternativamente, desde DevTools establecer
`localStorage.setItem('war-room-gpu-profile', '1')` y **volver a montar
la sala 3D**. En DevTools puede inspeccionarse:

```js
const d = document.querySelector('canvas.board3d-main-canvas')?.dataset;
({
  status: d?.warRoomGpuProfileStatus,
  completedGpuQueries: d?.warRoomGpuProfileSamples,
  lastGpuRenderMs: d?.warRoomGpuProfileLastMs,
});
```

El perfilador consulta un resultado asíncrono como máximo cada ocho
**renders reales de Three.js**, nunca en cada `requestAnimationFrame`,
y elimina las queries pendientes al desmontar la sala. Solo publica un
valor cuando finaliza una consulta `TIME_ELAPSED_EXT` válida: estados
`unsupported`, `software`, `disjoint`, `error` o
`sampling` no acreditan un tiempo GPU. En un renderizador software
no se crean consultas de medición. Una respuesta WebGL1 o una extensión
deshabilitada no se sustituye por CPU/rAF ni por ceros inventados.

El resultado es **tiempo de GPU de un render elegido**, no FPS ni tiempo
de CPU, y no mide por sí solo la pantalla completa ni el compositor.
El juego normal no emite consultas, no tiene timer activo y no escribe
atributos de GPU por fotograma. Tras desactivar la bandera basta
recargar/remontar el tablero. La captura y el comparador A/B/B/A ya incorporan muestras reales
de este temporizador por fase (idle/move), con comprobación de atribución
temporal y metadatos del navegador/canvas/Hans. Si faltan muestras
válidas, el comparador muestra `n/a`, nunca un tiempo deducido de rAF.
No interpretar `gpuFrameTimeMs: null` del JSON como tiempo GPU cero.
La medición física reproducible sigue abierta en #5765.

### Repeticiones A/B/B/A sin sobrescribir JSON (#5765)


#### Vía recomendada: un comando local y seguro

Desde un checkout de Chess Studio con la versión actual de la instrumentación,
en el portátil Nobara con GPU NVIDIA:

```bash
python3 -S scripts/run_war_room_gpu_ab.py \
  --baseline-sha 1278a5d1a8b9e82e193cb002374b261f1908d298 \
  --candidate-sha 39980d211ff1b5864baec52ced0035648e8bdd0d \
  --renderer hardware --offload nvidia --repetitions 2
```

Primero se puede ejecutar con `--dry-run` para verificar SHAs y el
orden A/B/B/A sin crear worktrees. Usar `--offload mesa` en un sistema
con AMD/Intel, o `--offload none` cuando la GPU ya sea la predeterminada.
`--renderer software` es solo un control de compatibilidad, no una medición
GPU; incluso con `--renderer hardware` el benchmark comprueba el renderer
WebGL efectivo y falla si es SwiftShader.

El runner `scripts/run_war_room_gpu_ab.py` crea worktrees temporales
separados y usa **el mismo harness** de Playwright, test y lockfile E2E
para ambas versiones, sin copiar sus fuentes de producción. Instala y
compila cada frontend real, ejecuta A/B/B/A en serie y conserva
un directorio inmutable de resultados en
`.artifacts/war-room-gpu-ab/<sesión>/` con JSON por versión/perfil,
`session.json` y `comparison.md`. Rechaza un servidor previo en
`127.0.0.1:4173`; elimina los worktrees temporales al terminar,
también ante errores, pero **conserva las capturas obtenidas** para
diagnóstico. En caso de que Playwright falle a mitad de pasada, los JSON
parciales se copian antes de eliminar el worktree y cada ejecución conserva
el log `playwright-XX-A.log` / `playwright-XX-B.log`. El archivo
`session.json` nace con `status: incomplete` y solo pasa a
`status: complete` cuando la comparación termina correctamente: un fallo
nunca se contabiliza como muestra A/B válida. No se ejecuta
automáticamente en GitHub Actions.

Las dos revisiones ejemplo son el estado anterior y posterior al batching
por pared de #5763. Si se comparan otras versiones, aportar sus SHAs
completos. El `--harness-sha` opcional permite fijar explícitamente
la versión de los tests cuando se comparen revisiones más antiguas.
El procedimiento manual que sigue es equivalente y queda disponible
para investigaciones específicas.

Desde la versión 2 del informe, cada invocación lleva un `runId` UUID único y escribe
`SHA-variante-renderer-perfil-runId.json` (los archivos anteriores no incluían variante). No se pierden las muestras al repetir;
`capturedAtUtc` señala cuándo se capturó cada perfil. El comparador
`scripts/compare_war_room_gpu.py` se comprueba con
`python3 -S scripts/compare_war_room_gpu.py --self-test` (también en CI).

**Importante:** las revisiones anteriores a la introducción del benchmark
NO contienen el script. Para compararlas con honestidad, utilizar **exactamente
el mismo script y la misma configuración de Playwright** provenientes de un
único SHA moderno; copiar *solo el harness de test* a dos worktrees separados,
sin alterar sus bundles de producción ni sus assets:

```bash
ROOT="$(git rev-parse --show-toplevel)"
HARNESS_SHA="$(git -C "$ROOT" rev-parse HEAD)"
BASE_SHA="1278a5d1a8b9e82e193cb002374b261f1908d298"  # Antes de #5763
NEXT_SHA="39980d211ff1b5864baec52ced0035648e8bdd0d"  # Después de #5763
A="$ROOT/../warroom-gpu-A"
B="$ROOT/../warroom-gpu-B"
git -C "$ROOT" worktree add --detach "$A" "$BASE_SHA"
git -C "$ROOT" worktree add --detach "$B" "$NEXT_SHA"
for tree in "$A" "$B"; do
  git -C "$ROOT" show "$HARNESS_SHA:e2e/war-room-gpu-benchmark.spec.js" > "$tree/e2e/war-room-gpu-benchmark.spec.js"
  git -C "$ROOT" show "$HARNESS_SHA:e2e/playwright.config.js" > "$tree/e2e/playwright.config.js"
  npm --prefix "$tree/frontend" ci
  npm --prefix "$tree/frontend" run build
  npm --prefix "$tree/e2e" ci
done

bench() {
  ( cd "$1/e2e" &&
    WAR_ROOM_GPU_BENCH=1 \
    WAR_ROOM_GPU_BENCH_RENDERER=hardware \
    WAR_ROOM_GPU_BENCH_SHA="$(git -C "$1" rev-parse HEAD)" \
    __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia \
    ./node_modules/.bin/playwright test war-room-gpu-benchmark.spec.js \
      --config=playwright.config.js --project=chromium --workers=1 )
}
bench "$A"; bench "$B"; bench "$B"; bench "$A"

python3 -S "$ROOT/scripts/compare_war_room_gpu.py" \
  --baseline-dir "$A/.artifacts/war-room-gpu-benchmark" \
  --candidate-dir "$B/.artifacts/war-room-gpu-benchmark" \
  --baseline-sha "$BASE_SHA" --candidate-sha "$NEXT_SHA" \
  --output "$ROOT/war-room-gpu-ab.md"
```

Para AMD/Intel usar las variables de offload apropiadas (p. ej.
`DRI_PRIME=1`) en lugar de las de NVIDIA. No ejecutar dos instancias
simultáneas ni dejar un servidor ajeno en `127.0.0.1:4173` (ahora el
harness rechaza reutilizarlo). Conservar siempre el mismo browser, flags,
GPU/driver, viewport, carga de fondo y GLB real. Comprobar que cada worktree
es realmente el SHA indicado; el `HARNESS_SHA` debe contener el schema 2.

### GPU elapsed medido en el benchmark local (a partir de #5780)

El mismo A/B/B/A ahora intenta activar el temporizador WebGL2 **solo** en
las dos revisiones locales mediante `localStorage['war-room-gpu-profile']='1'`.
El harness observa los contadores de consultas completadas del propio
`canvas.board3d-main-canvas` durante las fases `idle` y `move`; solo
recoge valores realmente publicados por `EXT_disjoint_timer_query_webgl2`.
Cada muestra aparece en `idle.gpuTimer.samplesMs` o
`move.gpuTimer.samplesMs` junto con estado, disjoint y consultas
perdidas. No se sustituye una muestra faltante por un valor rAF/CPU.

**Atribución temporal de consultas GPU:** el temporizador identifica el
instante `performance.now()` en que se **inicia** cada consulta, no
cuando se publica su resultado. Una consulta iniciada durante el arranque
y completada en `idle`, o iniciada en `idle` y completada en `move`,
se excluye de la fase receptora y se cuenta en
`gpuTimer.excludedCrossPhaseQueries`. El campo
`gpuTimer.phaseAttributionVerified` solo permite cifras GPU comparables
si cada muestra admitida tiene procedencia de fase comprobable.
Los reportes sin esta procedencia conservan sus métricas rAF, pero
las filas GPU se muestran como `n/a`. El perfilador no espera a la GPU,
ni usa `gl.finish` ni crea consultas durante una partida normal.

El comparador conserva la compatibilidad con los informes **schema 2**
anteriores, pero solo presenta una fila GPU numérica si, **en ambas
revisiones y para todas las repeticiones** de ese perfil/visita/fase,
existen al menos dos consultas completadas, el estado es `ready` y no
hay disjoint ni consultas omitidas. Además, los informes nuevos registran
la versión real de Chromium, el `devicePixelRatio` del navegador y
las dimensiones físicas (en píxeles) del canvas Three.js de cada visita:
el comparador **rechaza versiones, DPR o tamaños incompatibles** y exige
proveniencia completa para publicar cifras de GPU. Informes antiguos sin
estos campos siguen permitiendo estudiar cadencia rAF, pero las filas
de GPU se muestran como `n/a`, **aunque contengan muestras GPU**.
Este control impide atribuir a una optimización diferencias debidas al
navegador o a cambiar resolución efectiva. El perfil touch emulado
tampoco acredita Android físico.

**Atención con las revisiones de ejemplo anteriores a #5780:** no
incluyen la instrumentación interna y, aunque compartan el harness,
sus columnas GPU serán `n/a`. Para analizar mejoras GPU a partir de
#5780, seleccionar **dos revisiones que incorporen la instrumentación**;
no inyectar código de producción moderno en una baseline antigua,
porque adulteraría el A/B. El temporizador WebGL2 no supone
sincronización `gl.finish`, pero puede introducir algo de carga de
instrumentación: comparar rAF y GPU con el mismo harness, GPU, driver,
browser y sesión de energía.

El comparador **falla cerrado** si faltan perfiles, quedan menos de dos
runs independientes por SHA/perfil, algún JSON está corrupto, una muestra
no tiene dos visitas/frames suficientes, cambia el renderer, no coinciden
los viewports o se mezclan datos de GPU/software. Por defecto solo compara
hardware. `--renderer software` produce un diagnóstico de **software**,
nunca evidencia de FPS GPU. El Markdown enseña medianas de los p95 rAF
de cada visita, confirmación end-to-end y draw calls/triángulos sin afirmar
significancia estadística. **El hardware móvil real sigue siendo una
validación separada**.
