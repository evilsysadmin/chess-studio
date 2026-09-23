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

## Checkpoints durables de run

El estado persistente de una run se hidrata antes del primer frame jugable y se escribe sólo en checkpoints semánticos.

- `worldFlags`, IDs consumidos, recompensas reclamadas y su `worldVersion` forman parte del bootstrap autoritativo cuando existan.
- El writer debe ser serializado/coalescente y CAS/versionado. Movimiento, hover, selección o UI ordinaria no generan escrituras remotas.
- Cada checkpoint aceptado avanza la versión de forma secuencial; no se permiten escrituras concurrentes que puedan reordenar progreso.
- Un `409` por versión/mundo obsoleto detiene el writer y fuerza rebootstrap de **la misma run**. No se resuelve sobrescribiendo a ciegas estado remoto.
- No persistir el árbol React completo. Inventario y quests son campos explícitos del checkpoint de run; otros dominios se añaden mediante contratos explícitos/versionados cuando les toque, no colándolos como blobs opacos en `worldFlags`.

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
