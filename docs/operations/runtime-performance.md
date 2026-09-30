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

Antes de abrir más tráfico o aumentar workers del motor, medir la cola real. `scripts/production_capacity_probe.py` ejerce `POST /api/analyze`, que atraviesa el mismo executor acotado del motor sin crear ni modificar partidas. La sonda exige autenticación (JWT o M2M), prueba por defecto concurrencias 1/2/4/8 y emite p50/p95, throughput, tasa de error, códigos HTTP y request IDs para correlacionar la misma ventana con CPU/RAM/logs del host.

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
