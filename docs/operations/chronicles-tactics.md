# Chronicles / Tactics — contrato operativo compartido

Chronicles = **Chronicles of Matthias**. Tactics = **Chronicles of Matthias Tactics**.

Ambos comparten creación/personajes y parte del estado de expedición, pero Tactics añade su propio mapa/progresión. Este documento evita que cada iteración reinvente esa frontera.

## Character setup compartido

- La antesala/creator es común a Chronicles y Tactics.
- El grupo canónico debe seguir disponible como camino de un clic.
- Las compañías custom se construyen desde datos reproducibles; si hay randomización, usar seed persistible/repetible.
- Tactics crea su estado desde la build guardada **antes** de aplicar su progresión específica.
- No resucitar renderers de retrato retirados sólo para resolver una pantalla nueva.

## Draft de creación

Un draft no es progreso de juego.

- Persistencia de draft: versionada, aislada por usuario y apta para F5.
- Sólo builds custom no confirmadas usan el draft.
- Confirmar, volver/salir o completar el flujo limpia el draft según el contrato.
- Restaurar F5 debe reabrir en el personaje/step correcto sin convertir el borrador en una compañía confirmada.
- El resumen de build deriva de modificadores mecánicos reales. No inventar penalizadores/debilidades que el sistema no mida.

## Bootstrap autoritativo de Tactics

La creación de run usa una identidad/idempotency key estable para evitar expediciones duplicadas.

Distinguir causas:

- red/503 → conservar la misma key y reintentar;
- 409 por revisión/mundo autoritativo obsoleto → rotar una sola vez la identidad local y pedir una nueva run compatible;
- no sobrescribir una identidad más nueva si otro flujo ya la reemplazó.

Los errores deben conservar status/request-id suficiente para diagnóstico y no etiquetar un 409 autoritativo como “backend no disponible”.

## Autoridad del mundo runtime y colisiones

Una vez creada la run, la posición runtime actual de cada entidad es la única autoridad para colisión, targeting, IA, footprint de grupo y proyección de escena.

- La posición authored/spawn sirve para inicializar; deja de ser la posición actual en cuanto la entidad se mueve.
- No mantener resolvers paralelos por renderer, reducer o motor de turnos. Todos deben consumir la misma fuente de posiciones runtime.
- Cuando un enemigo abandona una casilla, esa casilla vuelve a ser transitable salvo que terreno, obstáculo estático u otra ocupación actual indiquen lo contrario.
- La casilla ocupada actualmente por una entidad debe seguir bloqueando/siendo targeteable según las reglas reales.
- En mapas random/procedurales, toda casilla no transitable debe explicarse por topología visible, obstáculo explícito u ocupación runtime. Un blocker invisible o una celda fantasma es una regresión aunque el mapa global siga conectado.
- Los gates de generación deben conservar conectividad entre entradas/salidas y regiones obligatorias, además de validar que scenery y props no alteran la walkability lógica.

## Autoridad de progresión RPG

XP, niveles, atributos, skills y la build compartida de Chronicles/Tactics pertenecen al **perfil persistente del usuario**, no al documento de una run.

- `chess-study-chronicles-progression-v1` es una clave registrada de progreso de perfil.
- Mongo, a través de `/api/profile`, es la fuente persistente de verdad; `localStorage` es sólo la caché síncrona de trabajo.
- `saveChroniclesProgression()` debe escribir mediante `setProfileStorageItem()`, quedando dirty para el PATCH versionado/revisionado del perfil.
- La sincronización de perfil debe conservar protección de identidad, revisión optimista y recuperación de conflictos 409. No crear un endpoint paralelo de “Chronicles progression” ni guardar progresión permanente dentro de `chronicles_runs`.
- El checkpoint de run conserva estado **de la expedición actual** (mundo, posición, HP, cargas, enemigos, ledgers). La progresión entre expediciones sigue perteneciendo al perfil.
- Un cambio de dispositivo o una caché local vacía debe poder rehidratar XP/atributos/skills desde el perfil remoto antes de usar esa progresión como base de juego.

## Dificultad autoritativa de encuentro

La amenaza de una expedición se fija al crear la run y forma parte del mundo autoritativo.

- el cliente envía el nivel medio desplegado sólo como hint de arranque; el backend guarda ese `partyLevel` una vez y lo reutiliza durante toda la run;
- la profundidad viene del orden de mapas de la ruta autoritativa, no del renderer ni de la navegación local;
- cada área recibe una banda de amenaza determinista y una escala bounded sobre su dificultad authored; F5, otro dispositivo y Chronicles/Tactics deben reconstruir exactamente los mismos stats;
- el escalado no persigue al jugador 1:1: progresión y profundidad suben presión de forma sublineal y el delta efectivo queda acotado para evitar runaway;
- la dificultad authored y EnemyBuild siguen definiendo identidad, skills y forma del enemigo. El escalado puede ajustar HP/daño/nivel de forma contenida, pero no reinterpreta el arquetipo;
- el frontend puede mostrar la banda autoritativa o calcular un fallback para runs legacy, pero **nunca** vuelve a escalar los stats recibidos del backend.

## Ciclo de vida autoritativo de la run

La misma escritura CAS del checkpoint final terminaliza la run en backend.

- `phase=defeated` proyecta inmediatamente `terminalStatus=defeated`;
- `terminalStatus=completed` se emite sólo después de terminar la finalización propia del adapter: primera persona puede cerrarla al escapar; Tactics espera a que el reward draft quede resuelto;
- el backend comprueba que `terminalStatus` concuerda con la fase runtime persistida (`escaped` o `defeated`);
- una run terminal no admite checkpoints posteriores ni puede volver a `active`;
- el retry exacto del checkpoint terminal es idempotente y no incrementa otra vez `worldVersion`;
- bootstrap/reentrada puede leer una run terminal para reconstruir epílogo/derrota tras F5; el estado terminal del backend prevalece sobre un runtime flag antiguo o incoherente.

## Checkpoints durables de run

El estado persistente de una run se hidrata antes del primer frame jugable y se escribe sólo en checkpoints semánticos.

- `worldFlags`, IDs consumidos, recompensas reclamadas y su `worldVersion` forman parte del bootstrap autoritativo cuando existan.
- El writer debe ser serializado/coalescente y CAS/versionado. Movimiento, hover, selección o UI ordinaria no generan escrituras remotas.
- Cada checkpoint aceptado avanza la versión de forma secuencial; no se permiten escrituras concurrentes que puedan reordenar progreso.
- Un `409` por versión/mundo obsoleto detiene el writer y fuerza rebootstrap de **la misma run**. No se resuelve sobrescribiendo a ciegas estado remoto.
- No persistir el árbol React completo. Inventario y quests son campos explícitos del checkpoint de run; otros dominios se añaden mediante contratos explícitos/versionados cuando les toque, no colándolos como blobs opacos en `worldFlags`.

## Generación procedural y replay

La topología y el contenido variable de una expedición se derivan de la seed y de contratos de generación versionados.

- Los IDs authored representan arquetipos/biomas y contratos semánticos; no obligan a que cada run repita la misma geometría o colocación no estructural.
- `contentPlacementVersion` queda ligado a la run al crearla. Rehidratar, F5 o cambiar de dispositivo debe reconstruir con esa misma versión, aunque el servidor ya conozca una política posterior.
- Una versión nueva de placement sólo se aplica a runs nuevas. Nunca se "mejora" silenciosamente una expedición existente recolocando enemigos, salida, loot o mecanismos.
- Anchors estructurales (quests, puertas, palancas, patrullas, estados referenciados) siguen authored salvo que una versión futura tenga un contrato explícito que preserve sus dependencias.
- El contenido relocatable sólo puede ocupar celdas transitables libres y debe pasar el mismo quality gate de conectividad/alcanzabilidad que la topología.
- La salida procedural debe seguir siendo única, alcanzable y suficientemente distante del punto de entrada; no puede pisar contenido estructural.
- La metadata/revisión de generación forma parte del diagnóstico y debe permanecer determinista para la misma seed + versión.

## Escenarios y arte

El decorado debe conocer el tamaño/plan real del mapa.

- No montar un marco/skyline calibrado para 7×7 encima de un campo 11×11.
- Arquitectura global, foreground y backdrop reciben el scene plan o dimensiones necesarias.
- Mantener las coordenadas canónicas de escenarios pequeños si siguen siendo correctas; desactivar/adaptar sólo la decoración incompatible.
- Props y dressing nunca pueden invadir casillas jugables ni ocultar lectura táctica.

Para cambios de framing/arte, generar artifact PNG. Una primera iteración que “mejora algo” pero sigue dominando el campo debe rechazarse y repetirse.

## Matthias

Matthias usa su identidad canónica de peón. Los retratos pueden adaptar fondo/iluminación al mundo de Chronicles, pero no cambiar su identidad visual básica.

El mismo asset/contrato debe mantenerse coherente entre tarjeta grande, thumbnails, Tactics HUD y character sheet cuando comparten fuente.

## Acceptance

- setup compartido funciona en ambos modos;
- draft sobrevive F5 sin convertirse en progreso;
- bootstrap conserva idempotencia y recupera 409 stale de forma controlada;
- colisión, targeting, IA y escena comparten las posiciones runtime actuales, sin blockers fantasma de spawns antiguos;
- mapas procedurales no contienen celdas invisiblemente bloqueadas y mantienen conectividad exigida;
- checkpoints durables hidratan antes del primer frame y escriben con CAS/versionado sólo en hitos semánticos;
- progresión RPG permanente se rehidrata desde el perfil Mongo y no se duplica dentro del documento de run;
- builds muestran sólo efectos reales;
- mapas grandes mantienen scenery fuera del battlefield;
- cambios visuales tienen PNG desktop/móvil cuando procede;
- Matthias conserva avatar/identidad canónica.

## Initiative combat contract

Chronicles exploration remains free until an encounter begins. Entering an enemy engagement radius, or explicitly attacking a reachable enemy, switches the run into turn-based combat and freezes free exploration behind the initiative scheduler.

- Initiative is rolled once when the encounter starts: `Agility + 1d8`.
- The `1d8` variance is deliberate. Low-level combat should remain volatile enough that a slower actor can occasionally beat a slightly faster one; Agility becomes more dominant as stats scale.
- Party classes have a base Agility. Persistent profile progression may add Agility without mutating the v1 character-creator schema.
- Legacy enemies receive deterministic derived Agility from their movement archetype; authored EnemyBuilds may carry Agility directly.
- The rolled order remains fixed across rounds. Dead actors are removed from the queue; finishing the last participating enemy returns the run to exploration.
- Enemy turns resolve one actor at a time through the existing authoritative movement/attack predicates. Initiative combat must never fall back to the old immediate-retaliation path.
- The initiative queue, cursor and round are durable runtime checkpoint state. F5/re-entry must resume the same order rather than rerolling the encounter.
- Ranged attacks are combat entry too: attacking a reachable enemy outside its passive engagement radius still creates the encounter before damage is resolved.

Any future haste/slow/surprise mechanic should modify the initiative contract explicitly rather than adding a parallel speed stat. `Agility` is the canonical initiative stat.

