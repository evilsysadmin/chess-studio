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
