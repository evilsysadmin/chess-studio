# Client storage / profile identity — contrato operativo

Chess Studio usa Web Storage como caché/sesión local, pero no puede asumir que `localStorage` o `sessionStorage` existen, son legibles o aceptan escrituras.

## Una sola puerta de entrada

Usar `safeStorage.js` para lecturas/escrituras/borrados. No introducir accesos directos a Web Storage en nuevos flujos persistentes.

Cuando el storage nativo falla por SecurityError, cuota, sandbox, modo privado u otra causa:

- la pestaña debe seguir siendo usable mediante cache/override en memoria;
- `setStorageItem` devuelve `false` si el valor sólo quedó en memoria;
- un override de memoria gana frente a una lectura nativa antigua;
- un borrado fallido deja una lápida en memoria para que el valor stale no reaparezca durante esa pestaña;
- diagnóstico de storage es grueso: disponibilidad/readability/fallback, nunca nombres ni valores de claves.

No confundir “la UI sigue funcionando” con “el dato quedó persistido durablemente”.

## Autoridad y categorías

- Mongo/backend sigue siendo fuente persistente de verdad para el perfil sincronizado.
- `localStorage` de perfil es caché de trabajo síncrona y journal dirty por identidad.
- `sessionStorage` sirve para estado efímero de la sesión/documento cuando corresponda.
- snapshots de recovery tienen el owner definido en `scripts/state_ownership_contract.json`; storage local no adquiere autoridad por comodidad.

Toda nueva clave debe clasificarse explícitamente como progreso, preferencia, cache derivada o estado de sesión. Evitar claves “temporales” sin owner que luego se vuelven permanentes por accidente.

## Aislamiento de identidad

`profileKeys.js` liga cada documento a la identidad con la que montó la aplicación.

- Una pestaña vieja de Alice no puede escribir progreso en Bob después de que otra pestaña cambie la cuenta compartida en `localStorage`.
- Si la identidad bound ya no coincide con el usuario actual, las mutaciones de perfil fallan cerrado.
- El dirty journal pertenece a un username concreto; un journal de otra identidad se descarta antes de continuar.
- Login explícito limpia cache/estado del usuario anterior antes de adoptar la nueva identidad.
- Logout limpia cache de perfil, estado de sesión y marcas dirty según el lifecycle de auth.
- Datos efímeros/narrativos/audio de sesión no cruzan cuentas.

## Progreso vs preferencias

Mantener separadas las listas canónicas:

- progreso: historial, rating, Combat, puzzles, rivalidad, Daily, carrera, Chronicles, etc.;
- preferencias: audio, idioma, renderer, reduced-motion, tutoriales vistos y otras elecciones del usuario.

`Empezar de cero` elimina progreso y caches derivados según el contrato, pero no debe borrar preferencias puras ni autenticación por accidente.

No añadir una nueva clave de progreso/preferencia fuera de los registries de perfil para evitar resets/sync parciales.

## Migraciones de storage

`migratePersistentStorage()` corre con schema versionado.

- Migraciones son incrementales y one-shot.
- No pisar una elección moderna del usuario al migrar un legacy salvo contrato deliberado.
- Una migración que requiere durabilidad y no puede escribir devuelve/degrada honestamente; no marca versión futura como aplicada si el paso no quedó seguro.
- Un cliente que encuentra un schema **más nuevo** no degrada, limpia ni “arregla” datos que no comprende.
- Claves obsoletas pueden retirarse sólo mediante migración explícita/versionada, no con limpiezas oportunistas dispersas.
- Cambiar la semántica de una clave existente requiere migración o nueva key/version; no reinterpretar silenciosamente bytes antiguos.

## Acceptance

Al tocar storage/perfil:

- tests con storage bloqueado y quota errors;
- failed write sigue visible en la pestaña mediante override;
- failed delete no permite resucitar valor nativo stale;
- JSON corrupto degrada a fallback seguro;
- schema corrupto/futuro no destruye datos;
- login/logout/cambio multi-tab no cruza identidades;
- reset distingue progreso de preferencias;
- cualquier mensaje “Guardado” que dependa de durabilidad comprueba el resultado real de persistencia.
