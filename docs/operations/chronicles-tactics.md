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

## Bootstrap autoritativo compartido

Chronicles primera persona y Tactics consumen el mismo Game Director y el mismo
contrato versionado de mundo. Cada experiencia conserva su propia identidad de
run para no mezclar expediciones, pero ninguna puede crear estado jugable desde
el catálogo local antes de instalar el bundle autoritativo.

La creación de run usa una identity/idempotency key estable para evitar
expediciones duplicadas. Distinguir causas:

- red/503 → conservar la misma key y reintentar;
- 409 por revisión/mundo autoritativo obsoleto → rotar una sola vez la identidad local y pedir una nueva run compatible;
- no sobrescribir una identidad más nueva si otro flujo ya la reemplazó;
- error de bootstrap → fallar cerrado; no sustituir silenciosamente por un mapa authored local.

El bootstrap runtime es **determinista-only**: seed, ruta, manifests y validadores
locales/backend deciden el mundo. Workers AI no forma parte del critical path de
entrada ni puede añadir latencia de red antes de gameplay. El soporte de
`plannerSnapshot` se conserva sólo para reproducir contenido histórico y para
authoring/experimentos fuera del arranque jugable.

Los errores deben conservar status/request-id suficiente para diagnóstico y no
etiquetar un 409 autoritativo como “backend no disponible”.

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
- ambos runtimes arrancan sólo después del bootstrap autoritativo compartido;
- bootstrap conserva idempotencia y recupera 409 stale de forma controlada;
- runtime bootstrap no espera ni llama a Workers AI;
- builds muestran sólo efectos reales;
- mapas grandes mantienen scenery fuera del battlefield;
- cambios visuales tienen PNG desktop/móvil cuando procede;
- Matthias conserva avatar/identidad canónica.
