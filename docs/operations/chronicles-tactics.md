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

## Ficha canónica de personaje y progresión visible

Chronicles first-person y Tactics comparten una única ficha RPG. No deben divergir en retrato, XP, atributos, skills ni reglas de gasto.

- Clic/tap sobre un miembro del grupo selecciona ese PJ y abre su ficha; los atajos 1–4 siguen permitiendo seleccionar sin abrirla.
- La ficha usa los retratos authored canónicos de Matthias, Hildegard, Aziz y Faust. No sustituirlos por glyphs, emojis, avatares CSS ni placeholders generados.
- La ficha muestra únicamente estado real: nivel/XP de perfil, HP/cargas de la run, daño/alcance efectivos, atributos, skills, reliquia vinculada cuando exista e inventario compartido de expedición.
- El inventario de run es de la compañía mientras el modelo de datos no declare ownership por PJ. La UI no debe fingir que una llave, consumible o botín pertenece a un héroe concreto.
- Los puntos de atributo y skill pueden gastarse desde la ficha mediante las mismas funciones de progresión que Tactics; no crear reglas paralelas.
- Abrir la ficha pausa input, locomoción y resolución automática de turnos enemigos por debajo del overlay.
- First-person aplica los modificadores persistentes relevantes para su modelo de combate: HP, daño, alcance y Agilidad/iniciativa. Las skills exclusivas de habilidades tácticas siguen visibles como progreso del personaje, pero la ficha las rotula como tácticas y no finge cargas utilizables en first-person.
- El XP ganado en first-person usa el mismo ledger/idempotencia de applyChroniclesTacticsProgression(): daño útil, bajas, objetivos y supervivencia se conceden una sola vez aunque haya F5/replay.
- Guardar progresión de perfil durante una expedición no reinicia ni re-bootstrappea la run activa.

Acceptance visual: la ficha debe conservar retrato authored nítido, jerarquía RPG legible y targets táctiles útiles en desktop y móvil; su aceptación requiere artifact PNG real.

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

## Materialización de manifests y paridad cross-runtime

Los manifests authored de `backend-python/chronicles_maps/` son la copia canónica. El frontend conserva mirrors byte-for-byte para fallback/offline y Go embebe los mismos bytes para su runtime nativo. Los corpus derivados de áreas y runs/API se generan siempre después de sincronizar esos manifests.

- Tras editar, añadir o retirar un mapa authored, ejecutar `make chronicles-contracts`.
- Ese comando sincroniza los mirrors de `frontend/src/chronicles/maps/` y `backend-go/internal/chronicles/content/maps/`, y regenera tanto `python_chronicles_area_corpus.json` como `python_chronicles_runs_corpus.json`.
- `make chronicles-contracts-check` es read-only y falla si hay un mirror o corpus stale.
- El gate Go/Python consume ese contrato único. No copiar manifests o hashes manualmente entre árboles como procedimiento normal.
- Una diferencia en nombres de archivos también es drift: altas/bajas del catálogo deben materializarse en las tres superficies en el mismo cambio.

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


### Contrato de materiales reutilizables

El atlas visual aprobado de Chronicles define cinco familias reutilizables y sus IDs estables: mazmorra `D01..D06`, castillo/interior `C01..C06`, exterior `E01..E06`, cueva natural `N01..N06` y variantes contextuales `V01..V06`.

- La generación visual debe elegir primero una **familia semántica por arquetipo/bioma** y sólo después variar determinísticamente dentro de esa familia. Nunca mezclar materiales de biomas arbitrariamente sólo para introducir variedad.
- Dungeon/cripta usa piedra oscura, desgastada, ladrillo de mazmorra, musgo, piedra rota y sillería/columnas oscuras.
- Castillo/interior usa caliza, sillería envejecida, mármol, arenisca, ladrillo rojo y columnas clásicas.
- Exterior usa piedra de muralla, piedra rústica, liquen, mezcla piedra/ladrillo, roca natural y bloque tallado.
- Cueva/montaña/mina usa roca de cueva, caliza natural, roca volcánica, minerales y humedad; estalactitas son dressing/prop, no una textura plana de cualquier muro.
- Madera, metal, yeso, tierra compacta, ladrillo ruinoso y grotesco/orgánico son variantes **contextuales**: sólo se aplican cuando la geometría/escena representa realmente ese material. No convertir por ejemplo un muro de piedra en chapa metálica porque el mapa tenga temática de forja.
- Los mapas procedurales deben mantener la selección reproducible para la misma topología/run. Cambiar de seed/topología puede escoger otras variantes compatibles dentro de la misma familia, pero F5/replay no debe barajar el acabado.
- La familia se deriva del arquetipo del mapa (por ejemplo cripta→dungeon, galería/basílica/archivo→interior, torre→exterior, cisterna/cueva→cueva húmeda). Los mapas futuros de cueva, mina o montaña deben caer explícitamente en la familia natural.
- El runtime puede sintetizar PBR proceduralmente mientras respete estos IDs, familias y lectura visual; el mock es contrato de lenguaje material, no obligación de empaquetar una textura raster concreta.
- El **mapa es la fuente de verdad del acabado estructural authored** cuando declara `materials`: `wallLegend` traduce tokens de una sola celda a IDs del atlas y `wallGrid` debe tener exactamente las mismas dimensiones que `grid`. Cada `#` debe declarar un token válido de muro y cada celda transitable debe usar `.`; el renderer no vuelve a sortear otro perfil para esos muros.
- Los mapas que todavía no declaran `materials` conservan el fallback semántico determinista por bioma para compatibilidad, pero las nuevas iteraciones visuales deben preferir authoring en el JSON del nivel.
- `materials.lightingProfile` también pertenece al mapa cuando la atmósfera del nivel necesita una exposición distinta. El perfil ajusta exposición/fills sin inventar fuentes de luz incoherentes ni eliminar las prácticas visibles del escenario.
- Props y dressing conservan su ownership: el atlas estructural no debe rociar perfiles sólo-de-prop sobre suelos/muros ni alterar walkability, colisiones o lectura táctica.

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

## Automap y ownership de viewport

Chronicles first-person es una superficie **viewport-owned**: durante la expedición no existe un modo windowed interno.

- El root de Chronicles ocupa siempre el viewport completo con layout propio (`100vw` + `100dvh`) en desktop, móvil vertical y móvil apaisado.
- El fullscreen del gameplay es **viewport-owned**, sin petición automática de fullscreen nativo del navegador. La API fullscreen nativa siempre permite a `Escape` abandonar ese estado y no puede ofrecer simultáneamente un `Escape` exclusivo para el menú. En escritorio puede quedar visible la barra del navegador; el juego ocupa todo el viewport útil. Fullscreen real sin barra queda a elección del navegador/usuario (p. ej. F11 o modo PWA).
- En móvil/coarse pointer se puede intentar `screen.orientation.lock('landscape')` sin solicitar fullscreen nativo. Si el navegador exige fullscreen para bloquear orientación, se degrada sin bloquear la partida, dejando el control «Apaisado» y la escena viewport-owned.
- Al salir de Chronicles se libera el lock de orientación que se haya solicitado; nunca se sale de un fullscreen nativo activado por el usuario u otra superficie.
- `Escape` cierra primero el automap si está abierto. En caso contrario abre/cierra el menú del juego, desde el que se puede continuar, volver a partidas guardadas o salir. No solicita fullscreen ni sale de Chronicles por sí solo.
- El automap es un overlay diegético de la expedición, accesible con `M` y con un control táctil/desktop visible. Mientras está abierto, los controles de locomoción/combate no actúan por debajo.
- La posición y orientación del marcador del grupo derivan exclusivamente de `state.x`, `state.y` y `state.direction`; el automap no mantiene una segunda posición ni una segunda lógica de facing.
- El grupo se representa como una flecha/chevron orientada con la dirección canónica N/E/S/O. Girar el grupo rota inmediatamente ese marcador.
- La cartografía se descubre al explorar. Una casilla visitada revela su celda y la geometría cardinal inmediata; contenido relevante sólo puede aparecer cuando su posición ya está revelada.
- La memoria de celdas exploradas es estado de presentación de la run y no debe convertir cada paso de exploración en un checkpoint remoto. Los checkpoints semánticos y la autoridad del mundo conservan su política existente.

Acceptance adicional:

- automap visible y usable en 390×844 y 844×390 sin overflow;
- marcador único del grupo y facing coherente tras giros;
- abrir automap no cambia posición, turnos ni combate;
- `Escape` desde automap no abre simultáneamente el menú;
- Chronicles continúa cubriendo el viewport completo con automap abierto o cerrado; desktop intenta browser-native fullscreen desde un gesto válido y móvil intenta además landscape lock, con fallback explícito cuando el navegador rechaza cualquiera de las APIs.

## Initiative combat contract

Chronicles exploration remains free and real-time until an encounter begins. Holding a movement direction walks the compact party continuously through the grid; ordinary exploration locomotion does not consume tactical turns or emit remote checkpoints per cell. Entering an enemy engagement radius, or explicitly attacking a reachable enemy, stops free locomotion, deploys combatants onto the tactical grid and switches the run into turn-based combat behind the initiative scheduler.

- Exploration input is hold-to-walk on keyboard/D-pad. Releasing input, hitting an obstacle or entering combat stops the continuous walk. Reduced-motion may suppress gait animation but must preserve the same real-time control semantics.
- Initiative is rolled once when the encounter starts: `Agility + 1d8`.
- The `1d8` variance is deliberate. Low-level combat should remain volatile enough that a slower actor can occasionally beat a slightly faster one; Agility becomes more dominant as stats scale.
- Party classes have a base Agility. Persistent profile progression may add Agility without mutating the v1 character-creator schema.
- Legacy enemies receive deterministic derived Agility from their movement archetype; authored EnemyBuilds may carry Agility directly.
- The rolled order remains fixed across rounds. Dead actors are removed from the queue; finishing the last participating enemy returns the run to exploration.
- Enemy turns resolve one actor at a time through the existing authoritative movement/attack predicates. Initiative combat must never fall back to the old immediate-retaliation path.
- The initiative queue, cursor and round are durable runtime checkpoint state. F5/re-entry must resume the same order rather than rerolling the encounter.
- Ranged attacks are combat entry too: attacking a reachable enemy outside its passive engagement radius still creates the encounter before damage is resolved.

Any future haste/slow/surprise mechanic should modify the initiative contract explicitly rather than adding a parallel speed stat. `Agility` is the canonical initiative stat.


## Movement contract — MM3-style grid turns (2026-10-08)

**Player decision:** The world is perceived and traversed as discrete first-person tiles, in the spirit of Might & Magic III, not free locomotion. Each tile can hold terrain, a prop, NPC, clue, loot, encounter, interactive object or mere scenery. Rendering may animate a step smoothly, but the authoritative position moves exactly one cardinal tile per accepted movement action.

- Exploration scheduler: **one successful party tile step → exactly one enemy movement activation**. All eligible enemies choose/resolve their one action in a deterministic order using actual runtime positions; never move twice per step. Player-facing turns are not dictated by elapsed time.
- Turning the camera/facing in place, opening UI, failed moves into walls, interactions that do not move, or idling do **not** advance enemy movement. A held direction may enqueue one step at a time, never jump or skip simulation ticks.
- Enemy movement is movement, **not a free attack**. When proximity triggers combat, exploration stops and existing initiative (Agility + 1d8) takes over; combat attacks resolve only on scheduled combat turns. Never both an exploration attack and a combat turn from the same player step.
- World tiles have explicit visible walkability/occupancy. Persistent story/loot flags and runtime entity positions remain authoritative; decorations may never produce invisible blockers.
- Applies to both new overworld/towns and existing first-person dungeon exploration. Keep Tactics as a separate runtime unless deliberately migrated, without sharing incompatible tick semantics.
- Reconcile existing hold-to-walk realtime and the pending '1 enemy activation per 3 steps' exploration PR before implementation. Supersede these rules for the new MM3-mode; do not silently combine cadences.
- Tests: one step → one enemy movement; two steps → two activations; wall, rotate, idle, UI → zero; enemy reaching engagement → initiative only; F5 restores positions and scheduler counters; mobile touch repeat cannot skip ticks.

## Campaign overworld and narrative contract (CH-W1 foundation)

**Product direction, 2026-10-08:** Chronicles of Matthias is a party-based first-person RPG with a connected overworld, towns, discoveries and hand-authored narrative. Dungeons are locations within the realm, not the whole progression. The campaign begins when the Queen tasks Matthias, the King's trusted pawn, with finding the missing King.

- Keep the current dungeon-level flow operational as a legacy entry and preserve old saves; the new campaign is introduced incrementally, with explicit migration/versioning rather than silently repurposing the current run's mapId, seed, or level depth.
- World topology uses stable location IDs and explicit traversable exits connecting authored regions (capital, village, road/forest, dungeon). Travel transitions must be reversible unless story state explicitly closes a path. No invisible movement blockers.
- The current region ID, entry anchor, visited/discovered locations, main quest stage, factual clue ledger and completed objective IDs are durable campaign/run data. Define a versioned checkpoint schema and bootstrap support before writing these values; never hide state in an undocumented worldFlags blob.
- Character XP, attributes, skill points and character progression stay with the profile, as specified above. Story-state transitions, run inventory, location and quest clues belong in authoritative versioned campaign checkpoints. Rewards must be idempotent across retries, F5 and multiple devices.
- Main quest «El rey desaparecido»: the Queen's briefing opens a journal goal to follow a real lead; the first visit to town supplies NPC information and a route to an exterior point of interest. Future acts reveal the larger mystery. Player-facing clues must correspond to actual state and locations.
- Cities are explorable scenes, not commerce dashboards: services, NPC dialogue and transactions are accessed through spatially/contextually discoverable interactions. The journal and inventory are secondary overlays, with no blocking modal forced during ordinary exploration.
- Overworld geography is spatial and connected. A level-1 player may encounter dangers too strong to fight and retreat; region threat is authored and legible instead of universally auto-scaling to the party.
- Maintain canonical full-viewport desktop and touch/landscape mobile contracts, and preserve exploration/combat phase ownership with initiative = Agility + 1d8.
- First implementation slice must prove an actual loop (Queen briefing → capital → traversable exterior → enter/exit dungeon → return to capital) with E2E tests for transitions, journal, F5 and idempotent saves. Visual changes demand inspected PNGs at desktop and mobile sizes. Keep Chronicles Tactics compatibility explicit in tests.
- Do not couple narrative to the current depth label: «Nivel 1, 2, 3…» represents floors of a dungeon only, not the overworld, character level or story chapter.



## Clasificación de mazmorras en el mundo de Chronicles

- **Campaña principal:** topología, puertas, trampas, puzzles, composición de salas y jefes diseñados, persistentes y reconocibles. Una nueva región principal opta expresamente por `layoutMode: authored`, `regionKind: dungeon` y la etiqueta narrativa `dungeonRole: main`. Python y Go no barajan el diseño ni mueven las anclas; sus versiones y revisiones son estables entre semillas.
- **Misiones secundarias:** pueden ser mapas authored o dungeons procedurales con objetivos garantizados. La categoría híbrida (salas fijas con conexiones variables) es un objetivo futuro, no una capacidad ya terminada.
- **Expediciones libres:** generación procedural con semilla persistida, variedad de amenazas, botín y dificultad; conservar los gates de conectividad y ausencia de blockers invisibles.
- **Compatibilidad obligatoria:** ningún dungeon histórico cambia de modo automáticamente. Etiquetar manifests de campaña que ya tienen partidas activas cambiaría hashes/revisiones autoritativas y provocaría 409. La migración del tronco principal debe introducir versiones de mapa/ruta y restaurar la variante procedural para las runs anteriores.

## Overworld quests, journal and landmarks (Rookwood slice)

- The open world follows quests, not gates: on `settlement`/`wilderness` maps the HUD objective is the active quest with content on that map (else the first active quest), then any available quest giver's label, and only then the exit label.
- Quest log: desktop shows «Encargos» inside the bottom expedition journal; touch layouts (where that journal is hidden) show the same list inside the floating «Crónica» panel. The story thread (`lost-king-prologue`) is labelled «Historia»; everything else is «Encargo secundario».
- Authored visual hooks for overworld content (renderer-only, no gameplay effect): `visualType` (`name-plaque`, `name-oak`, `rookwood-mourner`; `rookwood-mourner-voice` has no body), `persistentVisual: true` keeps an NPC/landmark visible after its interaction is spent, `visualActivatedWhen` (requirements) drives an activated look when the outcome lives inside an atomic `claim-reward`, and `visualFacing` (0 N, 1 E, 2 S, 3 W) orients a character.
- Overworld enemies are real bodies drawn from the shared enemy registry (they were previously invisible on exterior maps). A forest map (`rookwood-first-book`) dresses `#` cells as tree clumps and extends trees past the grid so gaps never show the void; collision is still only the grid.
- Gates on the west/east map edge rotate 90° so their posts flank the road instead of blocking the arriving camera.

## 2.5D billboards (first-person, MM3 style)

- First-person creatures and NPCs can be painted sprites that always face the camera, while walls, terrain and forest stay 3D. `buildChroniclesEnemyVisual(type, { sprites: true })` returns a billboard when a sheet exists and falls back to the procedural 3D model otherwise; Tactics never asks for sprites.
- Sheets: one row of square frames (`idle-a`, `idle-b`, optional `menace`, `attack`, `hurt`, `dead`, `speak`, `grateful`) in `frontend/src/assets/chronicles/sprites/` plus `sprites.json`. Cue priority: dead → hurt → attack (a blow it just landed) → menace (engaged/adjacent) → grateful (the NPC entry's `visualActivatedWhen`) → speak (party adjacent) → alternating idle. Under reduced motion there is no idle loop, but state-driven frames still apply.
- Source art is hand-authored vector code in `scripts/art/chronicles_sprites/*.mjs`, rendered deterministically with `node scripts/art/render_chronicles_sprites.mjs` (Chromium rasterizer → WebP). No image model is involved; regenerate the sheets whenever the source changes and review real in-game captures before accepting.
- First slice: bone hound and Edda (Rookwood).
