### v16.6dm46d · Dominio propio + catálogo admin de pruebas

- GitHub Pages queda preparado para `chess-studio.shadowops.dpdns.org` desde raíz, con CNAME publicado en el artefacto y CORS del backend restringido al origen nuevo y al histórico de GitHub Pages.
- Render usa `api.chess-studio.shadowops.dpdns.org`, separado del frontend. Terraform gestiona e importa de forma segura los CNAME DNS-only de Pages y Render antes de aplicar cambios.
- Las cuentas administradoras desbloquean el catálogo de prueba completo: piezas, títulos, tableros, armas y mercenarios se pueden revisar sin gastar créditos ni falsificar progreso, y el acceso se revoca al cerrar sesión.

### v16.6dm46c · Dirección visual + solución legible + mercado desplegable

- **Ver solución** usa el mismo idioma visual que Autopsia y Replay: jugada realizada con origen/destino en rojo y pieza fantasma en el origen; alternativa del motor con origen/destino en azul. SAN y coordenadas acompañan el color.
- Añade cinco familias de piezas ilustradas —Regimiento Español, Shogunato Neón, División Cyber, Expedicionarios Marines y Delta Nocturna— desbloqueables con el nivel de Torneo y sin alterar el tamaño del tablero ni las reglas.
- El mercado de Combat queda visible tanto en la preparación rápida como dentro del despliegue; al cerrarlo vuelve al punto exacto del flujo. Los mercenarios se distinguen con tratamiento cromático y distintivo propio sin confundir el bando.
- Home gana ilustraciones atmosféricas específicas para Torneo, Combat y Partida rápida; «Más aprendizaje y herramientas» adopta la jerarquía, ritmo y acabado de las tarjetas principales.
- La protección de racha explica el saldo y el uso de los puntos; el email puede prepararse aunque el proveedor de salida esté temporalmente desactivado, sin esconder el estado operativo real.
- La radio parte de **Aleatorio**, conserva cualquier emisora elegida en el perfil y recupera anterior/siguiente desde las teclas multimedia con un único dueño estable de Media Session.
- Las lecciones se ordenan alfabéticamente con Aperturas/Gambitos primero y Defensas después.
- Home incorpora **Novedades** por release: un changelog breve y persistente que sólo muestra mejoras útiles para quien juega y omite ruido técnico.
- Incluye una guía de migración pragmática a Oracle Cloud Always Free manteniendo dominio propio, Pages como frontend y rollback durante la transición.

### v16.6dm46b · Aislamiento estricto entre cuentas

- Una respuesta tardía, una pestaña antigua o un análisis en curso ya no puede escribir datos bajo otra identidad autenticada.
- Cada alta elimina cualquier perfil huérfano del mismo username antes de entregar la sesión: una cuenta nueva empieza siempre vacía.
- Regresiones específicas cubren `Alice → Bob`, respuestas GET tardías y reutilización de usernames sin heredar historial ni peor jugada.

### v16.6dm46a · Progreso accionable + economía Combat

- Home diferencia las dos necesidades del jugador: **Así juegas** abre el diagnóstico con la siguiente acción concreta y **Mi progreso** abre directamente la evolución e historial. La guía contextual deja de vivir dentro de Cuenta y las tarjetas de aprendizaje usan la misma jerarquía visual que los modos principales.
- **Mi progreso** se reorganiza en Resumen, Rendimiento, Aperturas y Archivo. El mapa de aperturas deja de ocupar una página casi vacía, limita profundidad y líneas visibles, y presenta cada variante como una fila compacta. En móvil las secciones forman una cuadrícula 2×2 sin scrollbar ni overflow.
- Combat Chess incorpora una economía persistente de créditos obtenidos jugando, con recompensas acotadas por captura, resultado y sector. La campaña base sigue siendo ganable sin comprar nada: mercado, mercenarios y equipo son opciones laterales, nunca un peaje de progresión.
- El mercado ofrece contratos mercenarios de 1 batalla, 3 batallas o permanentes y equipo con un único slot por unidad, requisitos de nivel y bonus explícitos. Los bonus no contaminan las estadísticas base ni encarecen la subida de nivel; los contratos sólo consumen batalla si la unidad fue desplegada.
- Cada alta nueva queda pendiente de una biografía individual generada por Cloudflare Workers AI. La interfaz no inventa una personalidad genérica: muestra un estado honesto de redacción hasta recibir una bio válida y persistirla junto a la identidad de la unidad.
- El rango de Combat sustituye al antiguo XP global como señal de carrera; los créditos quedan como moneda y la XP se reserva para subir unidades. Dossiers, resúmenes, debrief y reanimación muestran esa separación con copy consistente.
- Validación visual en escritorio y 360/390/430 px, compilación de producción y suites completas. Sin cambios en las reglas del ajedrez normal ni en CI; el backend sólo amplía el contrato narrativo necesario para las biografías.

### v16.6dm45w · Ritmo visible + carrera de desafíos

- El detalle de rating incorpora checkpoints compactos de **Hoy**, **7 días** y **30 días**, con balance y partidas registradas. La curva conserva la visión completa, pero ya no obliga a interpretarla para saber si el periodo fue positivo o negativo.
- Los desafíos diarios pasan a formar parte explícita de la carrera: se cuentan retos completados, plenos y plenos limpios, además de la racha existente.
- Añade cuatro distintivos medibles de desafío diario: 10 retos, primer pleno, 7 plenos y 3 plenos limpios. Los hitos bloqueados muestran progreso real en el catálogo.
- Al ganar un distintivo resolviendo un reto diario aparece un aviso compacto y no invasivo; el hub diario muestra también el acumulado histórico.
- La presentación se ha validado visualmente en escritorio y 360/390 px sin overflow. No añade moneda, XP paralela ni obligaciones artificiales: gamifica constancia y dominio demostrable.
- Sin cambios en reglas de ajedrez, backend, CI o infraestructura.

### v16.6dm45v · Home con foco + audio con identidad + tests semánticos

- Rediseña Home con una jerarquía de producto más clara: Torneo lidera la acción, Combat y Partida rápida mantienen su peso secundario y las tarjetas se compactan en móvil sin perder contexto ni accesibilidad.
- El asistente de feedback deja de abrirse sobre el contenido: permanece disponible, avisa con discreción y ocupa su propio espacio dentro de Home.
- Cairo · Quiet Hours y Nilo · Balcón dejan de compartir perfil musical. Cairo adopta oud, metales apagados, contrabajo y percusión de mano; Nilo usa ney, vibráfono, piano eléctrico y violonchelo, sin batería.
- La Guía rápida vuelve a estar disponible desde Cuenta y los accesos de estado exponen nombres accesibles completos también cuando el texto visual se compacta en móvil.
- Los tests de copy pasan a validar contratos estables y significado en lugar de redacciones accidentales; los contratos de audio comparan identidad perceptiva entre familias y los E2E se anclan a regiones y acciones accesibles.
- Sin cambios en reglas de ajedrez, backend, despliegue ni infraestructura.

### v16.6dm43w · Higiene pre-beta + continuidad UX

- Endurece la continuidad de partidas: un fallo transitorio de red/5xx durante restore conserva la ruta y el snapshot en vez de expulsar al usuario a Home. El smoke crítico cubre partida rápida, torneo y Combat Chess.
- Combat Chess separa claramente dos acciones: **Salir al menú** guarda la batalla sin consecuencias; **Abandonar batalla y asumir bajas** exige confirmación y registra la retirada con las bajas ya producidas.
- El rate limiter usa la cuenta autenticada como bucket en rutas privadas y reserva la IP para tráfico previo al login, evitando que usuarios distintos detrás de la misma NAT compartan límites de juego/perfil.
- `repo_doctor.py` entiende el CI actual y deja de producir falsos FAIL cuando los gates se ejecutan mediante `make static-preflight`.
- Reduce deuda de tests estáticos: los contratos de `safeStorage` y continuidad de releases pasan a gates dedicados; el presupuesto baja de 5 a 3 source-reader tests y de 6 a 5 assertions acopladas a implementación.
- Limpia comentarios de producción ligados a números de release y los sustituye por explicaciones del comportamiento o compatibilidad que protegen.
- Sin refactors grandes, sin cambios de reglas de ajedrez, sin nueva telemetría y sin cambios en la cadena Terraform/Pages.

### v16.6dm43v · Pre-beta hardening + Desafíos diarios + continuidad Combat

- Añade una sección propia de **Desafíos diarios** con tres retos deterministas por día. Completar al menos uno mantiene la racha; completar 3/3 registra el pleno diario. Home sólo muestra el progreso compacto y la profundidad queda a un clic. El hub es restaurable después de refresh.
- **Combat Chess** distingue salir de una batalla de retirar la campaña: «Salir al menú» persiste el snapshot y permite continuar exactamente la misma campaña/batalla al volver. La retirada permanente sigue siendo una acción deliberada separada.
- Endurece la recuperación de errores con **Reintentar**, **Volver al menú**, recuperación de partida cuando existe snapshot y **Copiar diagnóstico** privado (release, vista, storage/online y error técnico; sin tokens, FEN, jugadas ni contenido de partida).
- Añade hardening pre-beta sin cambiar la arquitectura: límites explícitos en perfil/presencia/análisis, validación de tamaños de payload y un `make load-probe` manual y no bloqueante para `/health` y `/ready`. El API gate exige conservar los límites sensibles.
- Amplía compatibilidad de navegador de forma informativa: el E2E completo puede recorrer Chromium, Firefox y WebKit, mientras el gate crítico de cada push sigue usando Chromium para no triplicar tiempos. Añade regresiones de storage bloqueado y overflow móvil.
- Mantiene intacto el pipeline de producción `Preflight → [Frontend || Backend || Security || Playwright] → Terraform → Pages`; sin nuevas dependencias de Render ni nueva telemetría.

### v16.6dm43u · Hotfix contrato memoria de serie

- Ajusta el test de memoria de serie al contrato semántico actual: decisiva + marcador real + referencia a partidas anteriores, sin acoplarlo a una redacción antigua.
- Sin cambios de gameplay ni comportamiento de la CPU.

### v16.6dm43t · Rivalidad CPU + veteranos memorables + distintivos discretos

- Añade un expediente compacto de rivalidad contra la CPU: marcador, racha, forma reciente e incidente dominante visibles; aperturas, hitos y antecedentes quedan detrás de «Ver expediente completo». Todo se deriva del historial/rivalidad ya persistidos.
- Combat Chess hace más memorables los veteranos dentro de su dossier: cada unidad recibe un «Legado» factual (jefes, bajas, supervivencias, revives, veterania) y, si existe, muestra su última condecoración real. La pantalla principal de campaña y el camino «Jugar» no ganan complejidad.
- Los logros pasan a presentarse como Distintivos: por defecto sólo se muestran hasta seis ya desbloqueados; el catálogo completo queda a un clic. Se añaden únicamente tres hitos de rivalidad medibles: 25 partidas, racha de tres y victoria contra dificultad 75+.
- Sin nueva telemetría, sin cambios de CI/Render, sin nueva economía y sin cambios intencionados de reglas de ajedrez.

### v16.6dm43n · Entrenamiento prioritario + rivalidad + series + Combat simple

- **Qué entrenaría ahora** elige una sola prioridad a partir de datos medidos y favorece errores que ya tienen posiciones personales entrenables. El CTA aparece sólo cuando existe material real; Workers AI puede redactar el plan, pero no decide qué debilidad existe.
- **Memoria CPU v2** amplía la rivalidad entre partidas con balances históricos de apertura, hitos de carrera y dificultad reciente. Los comentarios siguen siendo escasos: en series activas sólo habla ante punto de serie/decisiva o hechos realmente destacables.
- **BO3/BO5 narrativas** derivan del marcador estados como Punto de serie, Contra las cuerdas y Todo o nada, con CTA contextual para la siguiente partida y sin crear estado narrativo paralelo.
- **Combat Chess mantiene el camino simple**: si no hay bajas pendientes, el botón principal juega con la formación actual o completa huecos con defaults recomendados. Personalizar despliegue, veteranos, medallas, hoja de servicio y Memorial quedan detrás de un clic. Una baja pendiente sí obliga a decidir porque puede implicar pérdida permanente de identidad.
- La profundidad de campaña usa sólo expedientes reales: un resumen opcional muestra veteranos con experiencia, condecorados, Memorial y un veterano destacado calculado desde batallas/supervivencias/bajas/bosses existentes.
- El smoke crítico de Playwright cubre ahora el camino de Combat con defaults y mantiene la Mesa de Guerra como ruta avanzada.
- Inventario estático esperado: 726 tests frontend / 119 archivos, 221 backend / 10, 15 E2E / 2 y 8 Worker / 1. Sin cambios intencionados en reglas de ajedrez normal.

### v16.6dm43h · Cabecera centrada

- Corrige el masthead principal: `Escuela de Ajedrez` queda centrado de verdad aunque exista el bloque de acciones/ajustes a la derecha.
- El engranaje y el estado de guardado permanecen anclados a la derecha en escritorio; en móvil vuelven al flujo normal para evitar solapes.
- Cambio exclusivamente visual, sin tocar navegación, gameplay ni sincronización.

### v16.6dm43g · Hotfix simple de perfil/CORS

- Mantiene el pipeline simple de dm43e: `Preflight → [Frontend || Backend || Security/Docker || Playwright] → Terraform/Worker → Pages`. GitHub Actions no espera a Render ni compara SHAs del backend; Render conserva su despliegue independiente como antes.
- Corrige el fallo real de navegadores con cambios locales pendientes: `PATCH /api/profile` está permitido por CORS y el gate estático exige que CORS cubra los métodos HTTP publicados.
- Conserva la autorreparación segura del journal `dirty`: sólo descarta metadatos locales inválidos después de leer correctamente el perfil remoto; una caída real de Mongo sigue siendo fail-closed.
- Conserva el bootstrap con reintentos transitorios, el Retro Player persistente al refrescar y el quality gate paralelo.
- Sin espera a Render, sin `RENDER_GIT_COMMIT`, sin scripts de sincronización de deploy y sin cambios intencionados de gameplay.

### v16.6dm43e · Quality gate paralelo

- Mantiene un único workflow de producción, pero tras `Preflight · contracts` ejecuta `Tests · Frontend`, `Tests · Backend`, `Security · Trivy + Docker` y `Tests · Playwright` en runners independientes y en paralelo.
- `Cloudflare Worker · Terraform` depende de las cuatro ramas; `GitHub Pages` depende de Terraform. El tiempo de pared del gate pasa a estar dominado por la rama más lenta en vez de sumar frontend + backend + seguridad + navegador.
- `make static-preflight` ejecuta el auditor con `--ci-wiring`, por lo que el pre-push detecta si se rompe el DAG o se vuelve a serializar accidentalmente el quality gate.
- Sin cambios intencionados de gameplay ni runtime de la aplicación.

### v16.6dm43d · Pipeline único + Retro Player persistente en refresh

- GitHub Actions concentra la ruta de producción en `.github/workflows/cicd.yml` con tres jobs seriales y visibles: `Tests → Cloudflare Worker · Terraform → GitHub Pages`. Desaparecen `workflow_run`, `terraform-cloudflare.yml` y `static.yml`; Pages sólo puede arrancar después de Terraform y ambos despliegan `github.sha`, el mismo commit que acaba de pasar Tests.
- El job `Tests` reúne frontend, backend, preflight estático, seguridad, imágenes Docker, smoke real de Compose y el smoke crítico de Playwright antes de permitir cualquier despliegue.
- El Retro Player conserva en `sessionStorage` pista, posición y transporte (`playing`, `paused`, `stopped`) durante refresh/remount. Un Stop sigue siendo Stop después de F5; Pausa conserva la posición; Play continúa la sesión. Logout/login limpia ese transporte y abre una sesión musical nueva con selección aleatoria como antes.
- El preflight y el auditor de suite consideran regresión volver a introducir workflows de producción separados o `workflow_run`.

### v16.6dm43c · Build audit · E2E estable + deploy serial + PATCH concurrente blindado

- Endurece los smoke Playwright tras la aparición de botones de ayuda: `Así juegas`, `Partida rápida` y `Combat Chess · Campaña` se localizan por texto visible dentro de su botón, evitando colisiones con `aria-label="Ayuda de …"`; el auditor impide reintroducir esos selectores regex ambiguos.
- El mock E2E de perfil implementa el contrato real `GET/PUT/PATCH`, revisiones por clave y `409` por conflicto, para que la sincronización optimista no quede fuera de los browser tests.
- Restaura y blinda la cadena de producción `CI → Cloudflare Workers AI → GitHub Pages`: un único workflow disparado por CI en `main` despliega/verifica primero el Worker y sólo después ejecuta el job de Pages con `needs: terraform`, usando en ambos el mismo `head_sha` aprobado por CI. `static.yml` queda únicamente como fallback manual.
- `make tests`/pre-push ejecuta también `static-preflight`, adelantando gates de release, API/auth, CSS, ciclos, Cloudflare y Worker antes de intentar el push.
- Corrige una carrera del primer `PATCH /api/profile`: la creación inicial usa `insert_one`; un `DuplicateKeyError` fuerza reread y resolución por revisión en vez de poder sobrescribir al escritor ganador. Se añade regresión específica.
- Corrige además la recuperación de una caché dirty: tras fusionar el PATCH se importa la foto completa devuelta por Mongo, evitando que una clave remota independiente vuelva a ser pisada por una caché local antigua en el siguiente flush.
- Combat Chess vuelve a invalidar `deploymentConfirmed` si la formación cambia después de confirmarla; arreglar la mesa obliga de nuevo a confirmar, como en el controlador pre-refactor.
- El deploy automático rechaza un CI aprobado para un SHA que ya no sea la punta de `main`, evitando rollbacks accidentales si dos pushes terminan sus CI fuera de orden.
- El smoke real Docker+Mongo cubre ahora `PUT → PATCH válido → PATCH stale=409 → relogin`, no sólo persistencia básica.
- Coverage V8 sigue siendo informativo: mientras `@vitest/coverage-v8` no esté sincronizado en `package.json` + lockfile, el workflow lo omite con warning en vez de producir un rojo engañoso.
- Inventario esperado tras la auditoría: 702 tests frontend / 117 archivos, 220 backend / 10, 15 E2E / 2 y 7 Worker / 1. Sin cambios intencionados de reglas de ajedrez.

### v16.6dm43b · Hotfix · readiness parcheable + contrato root actualizado

- `/api/ready` consulta `db.persistent_storage_required()` y `db.get_db()` en tiempo de llamada, evitando referencias importadas que impedían aislar/monkeypatchear Mongo en tests.
- El contrato de `/` incluye `ready: /api/ready`, coherente con el endpoint añadido en dm41.
- Sin cambios intencionados de gameplay, reglas de ajedrez ni frontend.

### v16.6dm43a · Hotfix · contrato de lazy audio tras extracción

- Corrige `frontendArchitectureContract.test.js` para validar la carga dinámica de `sound.js` en `useAuthenticatedAudio.js`, que es el dueño real de esa responsabilidad desde dm43.
- Mantiene `App.jsx` libre de imports estáticos de audio y conserva `useAuthenticatedAudio(loggedIn, ready)` como punto de orquestación.
- Sin cambios de gameplay ni de comportamiento de audio; es un hotfix de contrato/test tras el refactor estructural.

### v16.6dm43 · Deuda estructural · App/Game/Combat/CSS por capas + ciclos a cero

- Reduce la orquestación monolítica de `App.jsx` extrayendo autenticación/bootstrap, audio autenticado, refresco del retrato AI, sincronización de perfil y biblioteca de replay/historial a hooks dedicados.
- Extrae el reloj de partida de `GameScreen.jsx` a `useGameClock`, conservando persistencia, incremento, bandera caída y avisos de presión temporal.
- Extrae el gate de despliegue de Combat Chess a `useCombatDeploymentGate`; la ruta libre/no-campaña y las reglas de despliegue siguen intactas.
- Mueve liveness/readiness/status a `backend-python/system_api.py` para adelgazar `main.py` sin cambiar la superficie autenticada.
- Divide el antiguo `styles.css` de 9.220 líneas en ocho módulos importados en orden, con un contrato byte-a-byte que garantiza que la cascada resultante no cambia.
- La detección de tests Vitest pasa a ser recursiva y el preflight/CI incorpora un gate de ciclos de dependencias para frontend y backend.
- Inventario esperado: 701 tests frontend / 117 archivos, 217 backend / 10, 15 E2E / 2 y 7 Worker / 1. Sin cambios intencionados de gameplay.

### v16.6dm42 · Combat Chess · persistencia de sesión fuera del controlador

- Extrae bootstrap, snapshot, watchdog, limpieza y reanudación de turno CPU a `useCombatSessionPersistence`.
- Reduce el acoplamiento de `useCombatController` sin cambiar reglas, progresión, roster, campañas ni recuperación de batalla.
- Añade cobertura directa del contrato de persistencia y reanudación de Combat Chess.
- Inventario esperado: 695 tests frontend / 114 archivos. Sin cambios intencionados de gameplay.

### v16.6dm41 · Perfil concurrente + readiness real + deploy encadenado

- `PATCH /api/profile` sincroniza sólo claves modificadas mediante revisiones optimistas por clave; un `409` devuelve el snapshot/revisiones remotas para poder fusionar y reintentar sin pisar cambios independientes. `PUT` se mantiene por compatibilidad.
- El frontend conserva una cola de sincronización, registra claves sucias por usuario y resuelve conflictos de una sola clave sin sobrescribir preferencias/progreso remoto ajeno.
- `/api/health` queda como liveness barata y `/api/ready` comprueba disponibilidad real del almacenamiento persistente; Docker, Compose, Render y smoke usan readiness.
- GitHub Pages conserva la cadena serial de producción `CI → Cloudflare Workers AI → Pages`: primero deben quedar verdes los tests y el deploy/verificación del Worker, y sólo entonces se publica el mismo commit del frontend.
- Inventario esperado: 691 tests frontend / 113 archivos, 217 backend / 10, 15 E2E / 2 y 7 Worker / 1.

### v16.6dm40f · Testing pass III · menos wiring textual, menos doble ejecución

- Elimina dos contract-tests de tutoriales que inspeccionaban JSX (`tutorialId`, `setOpen`) y conserva los tests reales de catálogo, contenido y persistencia.
- Reclasifica `aiNarrativeFeaturesWiring` y `mechanicTutorials` como unit tests: ejecutan código productivo y ya no inflan artificialmente la capa contract.
- `stateInvariants` conserva sus property/fuzz deterministas, pero sale del grupo smoke para que el fail-fast no arranque con ~2.200 validaciones de FEN.
- Los source-readers bajan de 6 a 5 y el auditor ahora lista los ficheros detectados si se supera el ratchet, facilitando diagnosticar tests zombie tras sincronizaciones sin `--delete`.
- El CI de cada push deja de repetir Vitest/Pytest completos sólo para coverage informativo. Coverage pasa a workflow manual/semanal y mantiene artifacts sin bloquear entregas.
- No se elimina cobertura de resiliencia, seguridad, motor, ownership, persistencia, Worker runtime ni E2E crítico. Sin cambios de gameplay.

### v16.6dm40e · Test pruning · menos cartón, misma trinchera

- Poda 5 contract-tests puramente visuales/markup de frontend (`adminMobileLayout`, `armyRosterView`, `campaignOperationalFlow`, `combatBattleLayout`, `combatOperationalUx`) que fijaban CSS/copy/estructura interna y duplicaban comportamiento ya cubierto por lógica o Playwright.
- Reduce los contratos estáticos supervivientes a invariantes con valor: accesibilidad/lazy loading, privacidad de presencia, tutoriales, narrativa fuera del camino crítico, wiring de continuidad y prohibición de Web Storage directo; el privilegio Admin pasa a navegador real.
- `chessGlossary` y `zenMode` dejan de inspeccionar JSX y se quedan como tests de lógica/persistencia.
- El frontend baja de 751 a 692 definiciones y de 14 a 6 lectores de source; las assertions estáticas bajan de 413 a 41 y las especialmente acopladas de 67 a 7.
- El backend elimina dos duplicados exactos de reglas/serialización que ya viven en `test_core_game.py`, quedando 210 definiciones.
- Los presupuestos de deuda se ratchetean al nuevo baseline (6 source-readers / 7 assertions acopladas) para impedir que vuelva a crecer la línea Maginot.
- No se eliminan tests de resiliencia, seguridad, ownership, persistencia, motor, Worker runtime ni los 15 E2E/DOM críticos. Sin cambios de gameplay.

### v16.6dm40d · Testing trenches · resiliencia de estado y navegación

- Añade tests de comportamiento para las tres zonas de continuidad que estaban demasiado protegidas por contratos estáticos: reconexión de partida, persistencia de sesión activa y pila global ESC/clic derecho.
- La reconexión prueba explícitamente doble intento, respuestas tardías de otra partida/modo y una nueva caída de red durante el request.
- El estado `Guardado` queda protegido por una política pura: sólo aparece cuando existe descriptor activo y el snapshot local durable confirma escritura.
- La restauración distingue por test sesión realmente obsoleta (403/404) de fallos transitorios/red/5xx, preservando la posibilidad de reintento.
- La navegación modal extrae una pila pura testeable: un Escape sólo cierra el nivel superior; clic derecho editable no navega; retirar handlers no desordena la pila.
- El browser smoke de cada push sigue siendo informativo y de sólo 3 recorridos, pero el centinela Combat ahora atraviesa briefing -> Mesa de Guerra -> confirmar despliegue en vez de quedarse en el mapa.
- `test_suite_audit` exige que estos tests de resiliencia existan como comportamiento real y que no se degraden a lectores de source.
- Sin cambios intencionados de gameplay, motor, backend ni reglas de Combat Chess.

### v16.6dm40c · Playwright Combat DOM root fix

- Corrige la causa raíz del timeout de `combat-dom`: tras `PREPARAR EJÉRCITO`, la UI actual abre Mesa de Guerra automáticamente; el helper E2E intentaba después clicar `PREPARAR DESPLIEGUE` detrás del modal ya abierto y Playwright esperaba hasta el timeout por oclusión.
- `openDeployment()` acepta ahora tanto la transición automática actual como el flujo intermedio legado, sin clicar controles ocultos tras overlays.
- Playwright informativo queda sin retries, con timeout global de 20 s, acciones de 5 s y `expect` de 4 s para que un fallo real aparezca cerca de su causa.
- El auditor de tests impide reintroducir retries en la suite browser informativa.
- Sin cambios de gameplay, reglas de Combat Chess, backend ni seguridad.

### v16.6dm40b · Pipeline relief · Playwright informativo + Docker Alpine 3.23

- Playwright deja de bloquear el CI principal: el push ejecuta sólo 3 smokes críticos, sin retry, con 2 workers y un límite de 5 minutos para el job.
- La suite E2E completa se conserva fuera del camino crítico mediante workflow manual/nocturno.
- Frontend Docker fija `node:22-alpine3.23` en build y `nginx:stable-alpine3.23` en runtime; backend mantiene `python:3.13-alpine3.23`.
- Trivy y el smoke Docker siguen siendo gates bloqueantes: degradamos el navegador, no la seguridad ni la integración real.

### v16.6dm40a · Testing hardening · Worker runtime + E2E más rápido + persistencia real

- Workers AI gana 7 tests runtime con `node:test`: HMAC, routing por modelo/bucket, rate limit, sanitización, usage, errores acotados y `/health`, sin depender de npm ni de Cloudflare real.
- Playwright corre `fullyParallel` con 2 workers en CI, `actionTimeout` de 7 s y `navigationTimeout` de 10 s; un clic bloqueado falla cerca de la causa en vez de consumir 30 s.
- El smoke móvil conserva 360/390/430 px pero recorre Home/Combat una sola vez; las 15 definiciones E2E son ahora también 15 ejecuciones normales, no 17.
- El smoke Docker Compose crea una partida real en Mongo y la recupera después de un login nuevo, cubriendo persistencia entre sesiones con el stack real.
- CI cachea el navegador de Playwright y el preflight incorpora los tests runtime del Worker.
- GitHub Pages sólo despliega si el workflow de Workers fue encadenado desde un CI verde en `main`; un dispatch manual de Workers ya no puede saltarse el gate.
- El auditor avisa si V8 coverage está configurado sin `@vitest/coverage-v8`; sigue siendo deuda informativa hasta sincronizar `package.json` + lockfile con npm disponible.
- Sin cambios de gameplay, motor de ajedrez ni reglas de Combat Chess.

### v16.6dm40 · Workers AI · plan de entrenamiento bajo demanda

- Incluye el hotfix E2E dm39b: los tests de gameplay no atraviesan overlays de tutorial y el helper defensivo cierra cualquier tutorial visible sin dejar clics bloqueados 30 s.
- “Qué entrenaría ahora” permite pedir otra lectura de Workers AI sobre las mismas prioridades factuales ya calculadas por Chess Studio.
- Cooldown manual de 6 h por usuario, aplicado tanto en frontend como en FastAPI; sólo una respuesta real de Cloudflare consume la ventana.
- Admin omite el cooldown, igual que en “Así te ve la CPU”.
- Observabilidad distingue `training_plan` automático de `training_plan_manual` y mantiene el evento dentro del canal de análisis rico.
- Sin cambios del motor de ajedrez ni de reglas de Combat Chess.

### v16.6dm39b · Hotfix Playwright · tutoriales deterministas en E2E

- Los E2E de gameplay arrancan con los tutoriales de Combat ya vistos para impedir que overlays de onboarding intercepten clics ajenos al objetivo del test.
- `dismissTutorialIfVisible()` ahora cierra todos los tutoriales visibles de forma defensiva y falla rápido (2 s) si un overlay no desaparece, en lugar de dejar que el siguiente `.click()` consuma los 30 s globales de Playwright.
- Sin cambios de gameplay ni de comportamiento para usuarios reales.

### v16.6dm39a · Hotfix Playwright · flujo Combat actual

- Playwright deja de buscar el botón retirado `Iniciar Operación La Torre`: el arranque real usa `Empezar campaña →`.
- El acceso E2E a Combat se centraliza en `openCampaignMap()` para que smoke y pruebas DOM no dupliquen selectores del landing.
- El helper recorre la UX simplificada completa: mapa → ruta → `Resumen táctico` → `PREPARAR EJÉRCITO` → preparar/revisar despliegue → confirmar.
- Se retiran también las esperas fósiles de `BRIEFING TÁCTICO` y el supuesto salto directo desde briefing a despliegue. Sin cambios de gameplay.

### v16.6dm39 · Coaching AI + Admin operativo + backend Alpine

- “Qué entrenaría ahora” puede resumirse con Workers AI, pero la IA sólo recibe prioridades ya calculadas por estadísticas/incidentes reales; no diagnostica debilidades nuevas.
- El plan AI se cachea por usuario y por cambio factual de prioridades para evitar llamadas repetidas al reabrir la pantalla.
- Admin prioriza Estado operativo/Observabilidad antes de la tabla de usuarios.
- Backend Docker migra de Debian slim a `python:3.13-alpine3.23` con build multistage, usuario no-root y runtime mínimo.

### v16.6dm38b · E2E robusto y diagnóstico CI

- Playwright deja de esperar headings históricos de Combat Chess y sincroniza con acciones/regions reales del flujo (`Iniciar Operación La Torre`, Home lista).
- El smoke de presencia usa el copy actual `2 usuarios online` y evita otro falso negativo de UI.
- CI usa reporter `list`, timeout explícito de expectations y conserva trace/screenshot/video al fallar, para localizar el primer atasco sin acceso interactivo al runner.
- Sin cambios de gameplay ni backend respecto a dm38a.

# Chess Studio

### v16.6dm38 · Combat Chess progresivo + CI semántico

- Combat Chess suaviza deliberadamente el arranque de campaña: la primera batalla parte de dificultad 14 y la curva escala 14 → 20 → 29 → 38 → 48 → 59 → 70 hasta el boss.
- Las élites siguen siendo más peligrosas (+8 sobre su etapa), pero el primer tramo deja margen para aprender despliegue, probabilidades, intel y crear veteranos antes de exigir juego fino.
- El bonus de amenaza del ejército sigue calculándose sobre las unidades realmente desplegadas; las reservas no endurecen el rival.
- La primera etapa mantiene material estándar sin modificadores sorpresa. La campaña empieza como escaramuza y acaba como guerra, no al revés.
- El preflight Cloudflare valida semánticamente `workflow_run.workflows` en vez de depender de comillas/espacios exactos del YAML. La cadena exigida sigue siendo `CI → Cloudflare Workers AI → GitHub Pages`.
- Si al copiar una release se omite `.github/`, el preflight continúa detectando el workflow viejo; los workflows son parte obligatoria del artefacto.

### v16.6dm37 · Combat Chess · inteligencia por incertidumbre

- GitHub Pages queda encadenado a `CI -> Cloudflare Workers AI -> Pages`: el frontend no se publica si el workflow de Workers AI no termina verde para el mismo commit.
- El workflow de Cloudflare corre tras CI verde en `main`, despliega/verifica el Worker y Pages usa exactamente ese `head_sha`; se mantiene validación PR sin aplicar producción.
- El refresco manual de “Así te ve la CPU” para admins usa el endpoint admin dedicado, sin cooldown de 6 h; el endpoint público además normaliza de forma robusta la identidad antes de evaluar bypass.
- La pantalla de Torneo recupera anchura útil en desktop (hasta 780 px, tarjeta principal 690 px) sin volver a inflar paddings/altura ni romper móvil.
- `aiNarrativeFeaturesWiring.test.js` deja de leer strings del Worker/componentes: ahora prueba dossiers y routing Qwen mediante APIs exportadas y comportamiento real.
- `static-contract-risk-audit` pasa de informativo a presupuesto bloqueante: como máximo 14 tests lectores de source y 67 asserts acoplados; la deuda ya no puede crecer silenciosamente.
- El preflight de Workers AI comprueba también el encadenado de despliegue para evitar publicar un frontend que espere un contrato AI más nuevo que el Worker activo.

### v16.6dm35b · Admin AI free refresh + menos wiring frágil

- Workers AI usa Qwen3 30B-A3B también para comentarios; retratos y análisis continúan en el mismo modelo con sampling específico por tarea.
- Comentarios interactivos tienen presupuesto duro de 2 s en Render, fallback local inmediato y circuit breaker más rápido (3 fallos, 60 s) para que una degradación del proveedor no bloquee el tablero.
- El diagnóstico SRE distingue volumen, latencia y errores: una ruta con p95 alto no se llama "fallo" si no tiene 5xx.
- `POST /api/narrative` se marca como ruta `external_ai` con presupuesto propio; comentarios tienen timeout duro de 2 s y retratos/análisis ricos 5 s, con fallback local y circuit breaker por canal.
- Los dossiers SRE separan `error_routes`, `slow_standard_routes` y `/api/narrative`, y priorizan motivos concretos de fallback sobre recomendaciones genéricas.
- Observabilidad muestra SLI por canal AI (Cloudflare %, p95 y fallback) para comentarios, retrato y análisis.
- La pantalla de Torneo se compacta a un lienzo más ajustado, preservando el detalle bajo disclosure y el layout móvil.

### v16.6dm32 · Admin compacto + Observabilidad como subvista

- El panel Admin ya no renderiza el dashboard completo en el flujo principal: muestra un resumen operativo de 24 h con API p95, 5xx, Mongo, Workers AI y usuarios online.
- `Abrir observabilidad` entra en una subvista dedicada con histórico, rangos, auto-refresh, percentiles, dashboards y SRE AI intactos.
- El resumen deriva su estado de datos agregados y no añade telemetría ni contenido sensible.
- La navegación permite volver al panel Admin sin salir al menú principal.

### v16.6dm31 · Backend modular + abandono penalizado + dashboards operables

- `main.py` deja de contener las rutas de juego/motor: `game_api.py` concentra crear/cargar/mover/undo/hint/analyze/delete y `main.py` queda como composición, middleware, auth y wiring.
- Abandonar voluntariamente una partida competitiva ya iniciada cuenta como derrota: aplica rating/progreso/racha igual que perder; salir antes del primer movimiento o abandonar práctica/entrenamiento sigue siendo cancelación neutra.
- Observabilidad añade ejes Y numerados, grid útil, tooltips por bucket, selector p50/p95/p99/todas para API y Workers AI y auto-refresh opcional con cadencia configurable.
- El resumen SRE y el bloque “Fallback / errores AI” excluyen el motivo `ok`: éxito ya no puede aparecer como causa de fallo.
- El contador público usa singular correcto: `1 usuario online`; plural para el resto.
- Se elimina un contract-test de retrato AI que inspeccionaba strings de implementación y se conserva su contrato útil como test de comportamiento. La auditoría impide aumentar desde dm31 los tests que leen source text.
- `make backend-install` falla rápido con un mensaje claro en Python < 3.10 y recrea un `.venv` antiguo incompatible en vez de dejar que pip vomite cientos de versiones.

### v16.6dm30 · Mini-Grafana + retrato AI por partida

- Observabilidad gana dashboards compactos para Salud general, Workers AI y Tráfico, todos ligados al rango 24 h / 7 d / 30 d / personalizado.
- El selector temporal queda visible antes del dashboard; el detalle forense permanece bajo `Ver métricas completas`.
- El histórico añade p50/p95/p99 HTTP por punto, 4xx y p95/fallback de Workers AI para graficar sin inventar datos.
- “Así te ve la CPU” invalida su generación tras cada partida terminada y App dispara la actualización automática si aún no existe una lectura para esa generación; el cooldown de 6 h sigue siendo sólo manual.

### v16.6dm29e · Health gate robusto + feedback resuelto plegado

- El preflight de Cloudflare deja de depender de una cadena JSON exacta en el YAML y valida semánticamente el routing `analysis` + la comprobación de todos los modelos.
- Admin mantiene el feedback pendiente visible y mueve los resueltos a `Resueltos (N)`, plegado por defecto y reabrible.

### v16.6dm29d · Hotfix contrato cooldown del retrato AI

- Corrige `aiPlayerPortraitWiring.test.js`: el contrato ya no busca la firma obsoleta `markPlayerPortraitManualRefresh()` y acepta la llamada actual con `identityScope`.
- El test verifica explícitamente el comportamiento importante: una respuesta remota vacía/fallback no consume el cooldown; una lectura remota válida manual sí lo confirma.
- Sin cambios de producción en el flujo de retrato AI respecto a dm29c.

### v16.6dm29c · Qwen estable + puzzles sin falsos negativos SAN

- Qwen3 se ejecuta en modo **non-thinking** para retratos y análisis ricos (`/no_think`), porque estas respuestas breves no necesitan gastar presupuesto razonando antes de emitir texto. El margen de generación sube a 384 tokens para `player_portrait` y 448 para análisis, manteniendo el límite visible de 900 caracteres.
- El Worker acepta `message.content` como string o como partes y, si Cloudflare vuelve a responder vacío, registra `finish_reason` y si existía reasoning **sin guardar contenido**, para que el siguiente fallo sea diagnosticable.
- Los puzzles dejan de comparar la SAN como texto exacto. La solución se compara por jugada real (origen/destino/promoción) y tolera diferencias inocuas como `Nc7` frente a `Nc7+`.
- La horquilla curada de caballo `b5→c7+`, que amenaza rey y torre, queda cubierta explícitamente por test junto con el rechazo de movimientos legales distintos.
- Se conserva el contrato defensivo de dm29b para “Así te ve la CPU”; el texto barroco que motivó la alarma resultó ser feedback humano, pero la validación sigue siendo una defensa útil contra salidas realmente desviadas del modelo.

### v16.6dm29b · retrato AI con contrato verificable

- **“Así te ve la CPU” deja de confiar ciegamente en el prompt.** FastAPI valida la salida de `player_portrait`: exactamente tres frases, sin saludo/carta/tratamiento de usted, con al menos un ancla factual real y una acción concreta final. Si Qwen deriva, la respuesta se descarta y se usa el retrato local.
- Los rechazos quedan visibles como `portrait_contract_rejected:<motivo>` y **no consumen el cooldown manual de 6 h**.
- El caché del retrato sube a schema 6 y queda ligado a la identidad autenticada, evitando reutilización entre cuentas en el mismo navegador. El schema nuevo invalida retratos antiguos ya cacheados.
- La narrativa genera y propaga `X-Request-ID` desde navegador → FastAPI → Worker, y Render/Cloudflare pueden correlacionar la misma llamada sin registrar prompts, HECHOS ni identidad del usuario.
- El prompt de `player_portrait` refuerza que no conoce username, no responde a supuestas conversaciones y debe empezar directamente por el diagnóstico.

### v16.6dm29a · hotfix de propagación del health de Workers AI

- El workflow de Cloudflare ya no considera sano un `/health` perteneciente a la release anterior durante la propagación del Worker.
- El bucle de health exige ahora el routing exacto de `comments`, `player_portrait` y `analysis` antes de continuar al preflight estricto.
- Evita el falso fallo `routing analysis inesperado None` observado justo después de desplegar dm29.


### v16.6dm29 · Workers AI como capa de interpretación

- La autopsia post-partida conserva el análisis determinista del motor y añade un dictamen compacto de Workers AI construido sólo con resultado, accuracy, pérdida media y hasta tres incidentes ya calculados; nunca envía historial bruto ni FEN.
- Combat Chess añade briefing AI a la inteligencia de campaña y debriefing AI a resultados/bajas/veteranos reales. El modelo no decide despliegues, dificultad, bajas, XP ni reglas: sólo interpreta los hechos existentes.
- Admin → Observabilidad incorpora **¿Qué está pasando?**, un diagnóstico bajo demanda del rango seleccionado con métricas agregadas de API, Mongo y Workers AI. No recibe usuarios, cuerpos de requests ni contenido de partidas.
- Las tareas analíticas usan `@cf/qwen/qwen3-30b-a3b-fp8` con sampling conservador y contratos específicos; los comentarios rápidos de partida siguen en Llama 3.2 3B.
- Backend y Worker separan un tercer canal/bucket `analysis`, de modo que autopsias/briefings/diagnósticos no pueden abrir el circuit breaker ni agotar el rate-limit de comentarios o del retrato.
- Observabilidad clasifica los nuevos tipos de evento y `requestKind` para medir cuánto se usa cada función y con qué fallback/latencia/modelo.

### v16.6dm26 · Etiquetas de latencia más explícitas

- Admin → Observabilidad renombra `p50 / p95 / p99` a **Latencias p50 / p95 / p99** tanto para API/Render como para Workers AI.
- No cambia el cálculo, la telemetría ni la frecuencia de muestreo; es sólo precisión de interfaz para que el significado sea evidente también para quien no viva dentro de Grafana.

### v16.6dm25 · Retrato AI útil, seco y con pulla

- “Así te ve la CPU” deja de usar la configuración creativa de los comentarios de partida: `player_portrait` baja a `temperature 0.60`, `top_p 0.85` y 180 tokens para priorizar coherencia y utilidad.
- El contrato del retrato exige exactamente tres frases: **qué haces bien → principal patrón mejorable → siguiente acción concreta**, siempre apoyadas en HECHOS.
- Conserva el sarcasmo, pero limitado a una pulla breve que acompañe el diagnóstico; fuera metáforas largas, prosa pedante, anglicismos, citas/personajes inventados y despedidas.
- Los nombres de aperturas deben copiarse literalmente del dossier; no puede rebautizarlas ni añadir ajedrecistas históricos que no estén en los datos.
- El caché del retrato sube a schema v3 para retirar automáticamente lecturas antiguas generadas con el prompt demasiado estocástico.
- Los comentarios de partida no cambian: mantienen su mayor variedad y mala baba.

### v16.6dm24 · Retrato AI visible y sin frases amputadas

- “Así te ve la CPU” muestra **↻ Analizarme de nuevo** directamente bajo el retrato; ya no está escondido dentro de “Ver en qué se basa”.
- El cooldown de 6 h sigue visible junto a la acción y mantiene enforcement frontend + FastAPI.
- Los comentarios de partida conservan su límite corto, pero `player_portrait` dispone de hasta 240 tokens / 900 caracteres.
- Worker, backend, transporte frontend y caché comparten el nuevo límite del retrato; si se alcanza un límite defensivo, el texto corta en una frase completa o, como último recurso, en palabra con elipsis.
- El esquema de caché del retrato sube a v2 para invalidar automáticamente cualquier lectura vieja que ya hubiera quedado amputada a 420 caracteres.

### v16.6dm23 · Observabilidad global + feedback AI con cooldown

- Admin → Observabilidad: API/Render, Mongo, usuarios/juego y Workers AI, con resumen simple y detalle bajo clic.
- Workers AI expone tokens/latencias/eventos agregados; neuronas/coste se muestran sólo como estimación de la ventana reciente.
- “Así te ve la CPU” permite una lectura manual cada 6 h, con cooldown visible y enforcement también en FastAPI.


## Estado actual

La versión canónica está en `RELEASE.txt`. Desarrollo local: Node 22 y Python 3.13. La estrategia de tests vive en `docs/TESTING.md`; el README conserva debajo el historial de cambios para contexto.

### v16.6dm22 · Workers AI con voz común + retrato del jugador

- Workers AI usa una voz común en toda la app: tuteo, tono informal y sarcasmo juguetón de buen rollo, sin insultos personales ni voz corporativa.
- Los comentarios remotos de partida conservan la política de momentos notables y fallback procedural, pero ahora comparten explícitamente ese contrato de voz.
- `Así juegas` añade **Así te ve la CPU**: un retrato dinámico de 2–4 frases generado con el mismo Worker a partir de estadísticas e incidentes reales, nunca historial bruto ni datos sensibles.
- El retrato tiene fallback local instantáneo, se cachea y se regenera automáticamente cada 3 partidas; `Regenerar lectura` permite pedir otra versión a mano.
- El detalle `Ver en qué se basa` mantiene la complejidad bajo clic y explica qué señales factuales alimentan el retrato.
- El cache derivado se borra al cambiar de usuario o usar `Empezar de cero`; Admin cuenta estas generaciones en las métricas existentes del narrador.

### v16.6dm21d · Cloudflare Worker Custom Domain

- El narrador Workers AI se publica en `https://ai.shadowops.dpdns.org` mediante `cloudflare_workers_custom_domain`; Cloudflare gestiona routing DNS y TLS del hostname.
- `workers.dev` queda deshabilitado para este Worker: producción tiene un único endpoint público estable.
- El workflow descubre/importa también el Custom Domain en cada runner efímero y valida que no esté asociado accidentalmente a otro Worker antes de aplicar.
- El health check usa el dominio propio, tolera hasta cinco minutos de primera emisión TLS y deja directamente el valor de `CF_AI_WORKER_URL` para Render.
- No añade secretos: se reutilizan `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `CHESS_AI_SHARED_SECRET`.

### v16.6dm21c · Cloudflare canonical Worker URL hotfix

- El health check deja de reconstruir manualmente el hostname `workers.dev`: consulta `GET /workers/workers/{worker}` y usa `result.subdomain.url` como URL canónica devuelta por Cloudflare.
- Verifica también `deployed_on`; un Worker conocido pero sin deployment falla con diagnóstico explícito en vez de parecer un problema DNS.
- Los reintentos de `/health` muestran HTTP y cuerpo de respuesta para distinguir routing 404, propagación y fallos reales del Worker.
- Mantiene el bootstrap idempotente del namespace de cuenta y el switch `workers.dev` por-script de dm21b.

### v16.6dm21b · Cloudflare workers.dev bootstrap hotfix

- El deploy distingue el `workers.dev` por-script del namespace `workers.dev` global de la cuenta.
- Si una cuenta nueva devuelve 404 en `GET /workers/subdomain`, GitHub Actions crea automáticamente un subdominio de cuenta estable y no sensible mediante la API oficial antes de resolver la URL pública.
- Tras el bootstrap verifica que el Worker concreto tiene `workers.dev` habilitado y reintenta `/health` durante la breve propagación inicial.
- No cambia frontend, backend narrativo ni secretos; es una hotfix de provisioning/CI.

### v16.6dm21a · Cloudflare first-deploy hotfix

- Home suma una tarjeta compacta **Hoy** con reto diario, racha y última partida; el detalle queda bajo `Ver más`.
- La preparación de Combat Chess muestra sólo **Amenaza · Ejército · Intel** y deja el informe completo bajo clic.
- El debrief destaca un veterano únicamente cuando ocurre algo realmente notable (ascenso, condecoración, daño al boss, múltiples bajas o supervivencia extrema); el ranking completo queda plegado.
- Admin clasifica la release reportada como `Actual`, `Antigua`, `Otra` o `Sin dato`, añade contador/filtro de clientes antiguos y reutiliza el heartbeat existente.
- Playwright incorpora una pasada mobile a 360/390/430 px sobre Home, Admin y briefing/preparación Combat, vigilando scroll horizontal global.

### v16.6dm20 · Así juegas → Entrenar este error

- Las prioridades de `Así juegas` pueden abrir entrenamiento personal con un clic **sólo cuando existen posiciones reales relacionadas**; no se inventan ejercicios para recomendaciones genéricas.
- Las autopsias etiquetan puzzles personales con incidentes reconstruibles (mate ignorado, dama expuesta, horquillas sufridas, etc.) y reutilizan la procedencia de apertura existente.
- Los puzzles personales admiten filtro combinado por apertura/incidente y muestran el contexto del filtro al entrenar.
- Las posiciones antiguas pueden recuperar etiquetas de incidentes humanos cuando el FEN y la jugada guardada permiten reconstruirlas de forma segura.

### v16.6dm19 · Progressive UX + bundle/API gates
- Post-partida simple por defecto: tres métricas + hasta tres momentos clave; la autopsia completa queda bajo un detalle explícito.
- El informe post-partida se carga de forma lazy sólo al pedirlo.
- Nuevo informe informativo de tamaño gzip del bundle tras build.
- El gate de superficie API audita también rutas `APIRouter` en módulos secundarios y verifica el wiring auth/admin del router narrativo.

## Historial de cambios

### v16.6dm18 · Active-session restore refactor

- `App.jsx` delega la rehidratación de F5/deploy, Continuar partida y recovery del ErrorBoundary a `useActiveSessionRestore`.
- El restaurador mantiene Mongo como autoridad y conserva contrato/run/serie/reloj, compatibilidad con saves anteriores a dm6 y tratamiento conservador de 403/404 frente a fallos transitorios.
- El recovery prioriza snapshot persistido, después ids todavía vivos en React y, para Combat/Roguelike, remonta la vista sobre su snapshot local existente.
- Helpers puros cubren selección de recovery, contexto restaurado y descriptor legacy; los contract-tests inspeccionan el módulo dueño del comportamiento en vez de exigirlo dentro de `App.jsx`.
- `App.jsx` baja de ~1.170 a ~1.070 líneas sin cambios intencionados de gameplay ni navegación.

### v16.6dm17 · Navigation orchestration refactor

- `App.jsx` delega el estado de vista, back-stack y persistencia de navegación de sesión a `useViewNavigation`.
- La navegación normal (`navigateTo`) conserva historial; las restauraciones usan `replaceView` para no fabricar entradas falsas en Atrás.
- `goBack` mantiene el fallback seguro a Home, el back-stack sigue limitado a 40 vistas y sólo las pantallas reconstruibles sobreviven a refresh.
- El acceso inicial a la sesión activa es perezoso: no relee storage en cada render.
- `App.jsx` baja de ~1.200 a ~1.170 líneas sin cambios intencionados de gameplay, rutas visibles ni recuperación de partida.

### v16.6dm16 · App orchestration refactor

- `App.jsx` delega el heartbeat/presencia de pestaña a `usePresenceHeartbeat`, manteniendo la cadencia gruesa de 2 minutos y el mismo contrato de privacidad.
- La persistencia del sobre de partida activa pasa a `useActiveGameSessionPersistence`; Mongo sigue siendo la autoridad y `Guardado` exige además snapshot local válido.
- La reconciliación offline → online pasa a `useGameReconnect`, conservando descarte de respuestas tardías, reintento tras una segunda caída y soporte de partidas normales/torneo.
- `App.jsx` baja de ~1.315 a ~1.200 líneas sin cambios intencionados de gameplay ni navegación.

### v16.6dm15a · Audio context hotfix

- Corrige una referencia residual a `audioCtx` tras la modularización de dm15.
- El ducking/volumen usa ahora el contexto del nodo ambiental existente y no crea Web Audio sólo por parar la voz.
- Añade regresión directa para `duckAmbientMusic()` sin soporte Web Audio.

### v16.6dm15 · Audio modularization

- `sound.js` deja de contener catálogo, perfiles, preferencias, FX y propiedad del `AudioContext` en un único fichero; conserva la misma API pública para el resto de la app.
- El catálogo de 70 temas pasa a `ambientCatalog.js` y las identidades/feels estructuradas a `ambientProfiles.js`, ambos módulos declarativos sin timers ni WebAudio.
- FX cortos, preferencias/mute/volumen y el `AudioContext` compartido se separan en módulos pequeños; las lecturas de preferencias aprovechan `safeStorage`.
- `sound.js` baja de ~4.120 a ~1.730 líneas y V8 coverage informativo incluye la nueva arquitectura de audio.
- Se añade cobertura unitaria directa para preferencias de audio, incluido mute legacy, overrides por canal y normalización de volumen.

### v16.6dm14a · Hotfix de contrato de tutorial

- Ajusta el contract-test de `ModeTutorialTip` para comprobar el comportamiento de apertura (`setOpen(true)`) en vez de una frase de copy concreta; producción permanece sin cambios.

### v16.6dm14 · Persistence hardening + UX de campaña/cementerio

- Capa `safeStorage` común para sesión activa, reloj, navegación, auth/perfil y snapshot de batalla Combat: fallos de cuota/seguridad degradan a memoria sin impedir que arranque la app.
- Esquema versionado de storage con migraciones conservadoras: JSON/versiones corruptas se recuperan y una versión futura nunca se degrada ni se borra.
- Los overrides en memoria ganan a valores nativos antiguos cuando una escritura/eliminación falla, evitando falsos restores tras `QuotaExceededError` o `SecurityError`.
- El tooltip de Combat Chess explica la campaña en lenguaje directo y el acceso `?` de la tarjeta principal recibe una llamada visual más clara, respetando `prefers-reduced-motion`.
- El Cementerio de partidas queda como archivo/autopsia (Revisar/Película); se retira la resurrección directa. Replay/Némesis conservan el entrenamiento desde posiciones reales y el Memorial/Revive de unidades Combat no cambia.

### v16.6dm13 · Codebase cleanup & hardening

- `Empezar de cero` usa una única clasificación de progreso/preferencias y ya limpia racha diaria, actividad y claves legacy sin borrar preferencias puras.
- Un ErrorBoundary raíz protege también fallos durante la inicialización de App y conserva cualquier partida recuperable.
- Se elimina el endpoint muerto `GET /api/games/:id/moves`; `/hint` gana cobertura backend y los errores internos de una jugada ya no se disfrazan de 400.
- Poda segura de imports, helpers, APIs de audio, assets y CSS sin consumidores; se amplía además el conjunto informativo de coverage frontend.

### v16.6dm12a · Hotfix del contrato de presencia

- Corrige el test histórico que todavía esperaba `recent` exactamente a los 5 minutos.
- El contrato vigente queda cubierto como online → idle → recent → offline sin probar bordes temporales frágiles.
- No cambia lógica de producción.

### v16.6dm11 · Presencia de pestaña en primer plano

- Admin distingue usuarios online de pestañas de Chess Studio realmente visibles.
- Heartbeat de primer plano deliberadamente grueso: cada 2 minutos y sólo en cambios de visibilidad.
- Un estado visible caduca automáticamente si la pestaña muere sin poder despedirse.
- El contador del panel excluye a la propia cuenta administradora y no registra interacción fina ni contenido de partida.

### v16.6dm1 · Historial de ciclo de vida y modos fiables

- Historial de actividad persistente por usuario: partida iniciada, cancelada y finalizada, deduplicada por partida/estado.
- Admin consume ese journal cuando existe y conserva fallback compatible para perfiles antiguos.
- Etiquetas de modo centralizadas: Muerte súbita/Copa dejan de caer en Torneo y Combat distingue Campaña, Torre, Torre infinita y Batalla libre.
- Combat Chess emite también inicio/final/cancelación con un id estable por batalla.

## v16.6db · Hardening de regresiones Combat

- Guards ejecutables para impedir `battle → setup` silencioso en campaña.
- Contrato único de despliegue: 16/16 no basta si quedan bajas pendientes.
- Regresiones cubiertas para Memorial/aliases, reservas, bajas y gestos click/doble click/hover/drag.
- La mecánica de juego no cambia; esta versión endurece invariantes ya existentes.

## v16.6da · Consolidación operativa de Combat Chess

- Estado operativo de campaña persistente: créditos, XP de combate, efectivos, veteranos, reserva y bajas.
- Siguiente paso visible en cada fase.
- Debriefing de campaña más protagonista y autocontenido.
- Registro de batalla tipado visualmente.
- Marcas mínimas de veterano sobre las piezas (condecoración, técnica, revive).
- Ficha de unidad de batalla enriquecida.
- Cloudflare Workers AI queda preparado pero no se activa hasta disponer del token de Cloudflare.

## v16.6cz · Memorial inmutable + bitácora a la derecha

- La migración de aliases marciales sólo toca identidades activas; el Memorial conserva el alias histórico con el que cayó cada unidad.
- El Registro de batalla pasa a ser el contenido principal del rail derecho de Combat, en el hueco equivalente al chat de los otros modos.
- El estado táctico queda como resumen compacto sobre la bitácora.

## v16.6cy · Tooltip contextual de rangos

- Hover sobre una insignia militar muestra una guía breve del rango.
- Indica posición jerárquica, niveles que abarca, siguiente ascenso y el hito de metamorfosis.
- El tooltip se aplica a tablero, Mesa de Guerra y fichas/listas sin cambiar progresión ni estadísticas.
- En tablero, clicar/doble clicar sobre la insignia conserva el mismo gesto que clicar/doble clicar sobre la pieza.

## v16.6cx · Iconos de rango reconocibles de un vistazo

- Cada rango Combat usa ahora una silueta propia: rombo, chevrón, escudo, barra, doble barra, hoja, águila o estrella.
- Recluta sigue sin insignia para mantener el tablero limpio.
- Los iconos se muestran sobre la pieza, en Reserva/Desplegados y en la Ficha de unidad.
- Se conserva la agrupación cromática discreta por familia militar, pero la identificación ya no depende de contar rayas o estrellas.
- La progresión, niveles, XP, rangos y metamorfosis no cambian: es una capa exclusivamente visual.

## v16.6cw · Insignias militares de rango en unidades Combat

## v16.6cv · Briefing más limpio, XP visible, aliases marciales y ayuda por modo

- El briefing de campaña compacta inteligencia/créditos, centra `PREPARAR DESPLIEGUE` y relega `Retirar operación` a acción secundaria.
- La Mesa de Guerra muestra la XP de combate disponible junto a las bajas y explica de forma visible cuánto falta para cada revive.
- Se elimina de las fichas la métrica interna `Amenaza propia / CPU potencial`; la compensación sigue existiendo en la lógica de balance, no como ruido de interfaz.
- El catálogo automático de nombres pasa de aliases juguetones a apellidos/callsigns sobrios (`Rivas`, `Salcedo`, `Varela`, `Ferrer`...). Las identidades antiguas se migran sin perder identityId, rango, historial, medallas ni servicio.
- Los modos principales del menú ganan un `?` contextual: hover/focus muestra un resumen corto y clic abre el tutorial completo del modo.
- Se añaden tutoriales breves específicos para `Partida de práctica` y `Aperturas famosas`.

## v16.6cn · Ficha de unidad también desde el tablero

- Hover sobre cualquier pieza desplegada en la formación abre la misma ficha rápida de unidad.
- Clic directamente sobre la pieza fija la ficha, igual que en Reserva, Desplegados y Bajas pendientes.
- El click de la pieza no dispara el click de casilla, evitando mover/reasignar una unidad accidentalmente al abrir su expediente.
- Board expone callbacks opcionales y genéricos: el resto de modos no cambia de comportamiento.

## v16.6cm · Fichas flotantes de unidad

- La Mesa de Guerra elimina el panel fijo `Unidad · Inspector`: Reserva, tablero y Desplegados ganan espacio permanente.
- Hover o focus sobre una unidad abre una ficha flotante con rango, nivel, servicio, XP, supervivencias, bajas, bosses, medallas, técnicas y amenaza.
- Click sobre la unidad fija la ficha para poder renombrar, metamorfosear o enviar a reserva sin que desaparezca al mover el ratón.
- Las bajas pendientes usan la misma ficha para comparar qué merece revivir antes de gastar XP; sus botones de Revivir/Nuevo recluta siguen en la tarjeta.
- La ficha se renderiza mediante portal para no quedar recortada por los scrolls laterales; en móvil se presenta como panel inferior.
- Escape/clic derecho cierra primero la ficha abierta y sólo después sale de la Mesa de Guerra.

## v16.6ci · Banquillo visible + dropdowns legibles

- La mesa de despliegue expone `Todos / Tablero / Banquillo` como vistas rápidas con contadores; las reservas dejan de quedar escondidas dentro de un select.
- `Banquillo` muestra sólo las unidades no desplegadas y explica que están fuera de la formación actual.
- Los selects de filtros fuerzan esquema oscuro y opciones legibles para evitar el popup blanco con texto pálido del navegador.

## v16.6ch · Deployment de Combat Chess reparado

- `Enviar a reserva` deja realmente el puesto vacío; la normalización ya no recoloca la unidad automáticamente.
- Las bajas pendientes aparecen como caídas en vez de simular que el roster ha perdido unidades sin explicación.
- Al reemplazar bajas se generan reclutas nuevos y se vuelve a la mesa de despliegue para asignarlos conscientemente.
- Drag & drop usa una previsualización pequeña de la pieza y resalta con fuerza la casilla exacta de destino.
- Las bajas se pueden resolver en la propia mesa: revivir si hay XP o aceptar uno/todos los reclutas nuevos sin salir de deployment.
- Música curada a 70 temas: ocho nuevas piezas de jazz mediterráneo/nocturno y seis experimentales retiradas del catálogo y de sesiones antiguas.

## v16.6cg · Workers AI integrado + Admin directo
- Narrativa remota opcional con Cloudflare Workers AI, HMAC, kill switch, circuit breaker, rate limits, grounding y fallback procedural.
- Los comentarios de jugadas notables se lanzan fuera del camino crítico con cooldown; si el backend usa fallback local, se conserva el comentario procedural rico del frontend.
- Admin muestra métricas del narrador AI sin prompts ni datos privados.
- En Usuarios registrados, el nombre de usuario abre/cierra el expediente; desaparece el botón redundante “Ver detalles”.
- Timestamps de Admin unificados en español y reloj de 24 horas: `dd/mm/aaaa · HH:mm:ss`.

## v16.6cf · Combat setup operativo
- La preparación de Combat Chess pasa de manual vertical a dashboard ancho: CPU, color y subida en tarjetas compactas.
- Las reglas genéricas salen de la vista principal y permanecen en tutorial/tooltips; sólo quedan datos accionables del encuentro.
- Ejército resumido por progreso, reservas, bajas, XP, memorial y estado de despliegue, con acciones en grid.
- El panel de carrera usa su variante compacta en setup.



## v16.6cd · CI release-path fix
- `releaseContinuity.test.js` resuelve archivos desde `import.meta.url`, no desde `process.cwd()`.
- La comprobación de `RELEASE.txt` funciona igual en local y GitHub Actions.
## v16.6ca — Seek musical real + Combat operativo + media keys

- El slider musical reconstruye de verdad la composición desde la posición elegida y apaga el bus Web Audio anterior con un fade corto.
- El seek hace commit aunque el navegador pierda `pointerup`; Media Session soporta también `seekto`, `seekbackward` y `seekforward`.
- Combat Chess usa más ancho, menos texto y tooltips/tutorial para detalle.
- Admin etiqueta actividad reciente por modo real.
- Media Session se reclama al foco y Audio Session usa playback cuando está disponible.

## v16.6by — Test gate decoupling fix

- `run_frontend_critical_tests.mjs` ya no ejecuta auditorías de wiring de CI antes de Vitest.
- `make test-suite-audit` valida estructura/aislamiento local sin depender de `.github/workflows`.
- `make test-suite-audit-ci` añade la validación semántica del wiring de GitHub Actions.
- CI ejecuta explícitamente la auditoría `--ci-wiring` antes del gate crítico.
- El wiring acepta el runner directo o targets Make equivalentes; evita falsos rojos por formato YAML.

## v16.6bx — Test suite hardening + audit

- Audita toda la suite y añade un gate meta (`make test-suite-audit`) contra tests saltados, RNG global mal restaurado, reloj real, aserciones tautológicas y contract-tests de source text no declarados.
- Centraliza los 50 tests frontend críticos en un único manifest compartido por Makefile y GitHub CI.
- El backend completo autodetecta nuevos `test_*.py`; el gate core se ejecuta antes y se excluye sólo para evitar duplicidad.
- Corrige tests frágiles/obsoletos del roster, Daily, Roguelike y grada, y añade cobertura directa de `career.js`, `metaProgress.js`, `notation.js` y `requestId.js`.
- Aísla los tests puros de request limits del stack bcrypt/Mongo y endurece `Content-Length` duplicado contradictorio.
- Amplía Playwright con un segundo smoke para el mapa estratégico y la privacidad de intel.

Detalles en `docs/TEST_SUITE_AUDIT.md`.

## v16.6bw — Strategic Campaign Map + XCOM Events + Relics · roster test fix

- Campaign map rediseñado como ruta estratégica completa de 7 sectores y 3 carriles, con conexiones SVG, bifurcaciones, ruta recorrida, posición actual y responsive vertical en móvil.
- El mapa enseña topología/tipo de nodo pero nunca dificultad exacta, modificadores ni HP/dossier del boss sin inteligencia.
- Eventos de campaña ampliados a 4 arquetipos deterministas con 3 decisiones cada uno.
- Reliquias operativas persistentes durante la campaña: intel, economía, ruido, campamentos y preparación del boss; no alteran el movimiento de las piezas.
- Archivo de las últimas 12 operaciones con ruta, resultado, sector, reliquias y créditos finales.
- Campañas v1/v2 migran a v3 sin perder progreso ni inventar reliquias.

## v16.6bu — Audio UX 2.0 + debriefing + barracón + presets

- Radio musical por estilo, favoritos, exclusiones y modo Concentración.
- Transición entre pistas acortada y suavizada; sigue vigente el gate anti-chiu y el catálogo de 68 temas.
- Combat Chess añade debriefing real con supervivientes, bajas, kills, daño al boss, XP, méritos y ascensos.
- Barracón muestra desplegados/reservas/caídos de un vistazo y ordena reservas por jerarquía.
- Deployment permite guardar/cargar tres presets de escuadra con identidades y formas de despliegue.
- Nuevos tests críticos para presets y debrief.

## v16.6bt — 68 temas / 12 estilos / catálogo anti-clon

Amplía la música generativa con ocho pistas y cuatro familias nuevas: Trip-Hop/Downtempo, Dark Ambient, Bossa/Latin Lounge y Piano/Minimal. Cada pieza nueva tiene arreglo, métrica, instrumentación y feel propios; se mantienen el gate anti-`chiu-chiu`, la huella compositiva única y la normalización de volumen por densidad. También corrige la continuidad de versión del frontend.

Detalles musicales en `docs/ambient-music.md` y `docs/AUDIO_PERSONALITY_AUDIT.md`.

---

## v16.6bq — Career visuals, Daily vivo, replay Director’s Cut, grada y 60 temas

Añade una capa de lectura/ambiente sin tocar el motor de Combat Chess: perfil RPG y tres heatmaps derivados únicamente de historial real, calendario de 28 días para Daily Challenge con racha activa corregida y logros 3/7/30, replay cinematográfico con velocidades y capítulos críticos, reacciones anónimas y escasas de la grada en jugadas notables, y cuatro temas nuevos Lo‑Fi/Synthwave. El catálogo Web Audio queda en 60 pistas agrupadas en 8 estilos. Además incorpora `make data-ux-check`, un smoke offline para heatmaps, Daily y grada.

Detalles en `docs/v16.6bq-career-daily-replay-audience-audio.md`.

## v16.6bp — Más ambient: SPA, rock y clásica + preflight sin red

Amplía el catálogo Web Audio de 48 a 56 pistas con familias SPA/Zen, rock ambiental y clásica/cámara, añade timbres propios y agrupa el selector por estilo. También incorpora `make audio-check` y `make static-preflight` para validar música, sintaxis, Python y superficie API incluso sin acceso a npm. No cambia reglas ni saves de Combat Chess.

Detalles en `docs/v16.6bp-audio-expansion-static-preflight.md`.

## v16.6bo — Feature-freeze y arnés de regresión

Congela las features de v16.6bn para probar el sistema entero antes de seguir ampliando Combat Chess. Añade `make combat-smoke`, invariantes cruzados de campaña/deployment/continuidad/tutoriales, un guard que impide comprar inteligencia fuera del briefing o para otro nodo, y un checklist manual exhaustivo en `docs/v16.6bo-manual-test-checklist.md`.

Detalles en `docs/v16.6bo-test-freeze.md`.

## V16.6bl — Continuidad de Combate + cierre de backlog UX

- Conserva el hotfix de reanudación de batalla de Combat Chess mediante snapshot efímero en `sessionStorage`.
- Permite renombrar cualquier identidad del ejército sin cambiar su `identityId` ni perder expediente/estadísticas.
- Historial y Panel de admin pasan a tarjetas del menú principal; Admin sólo aparece para admins.
- Las pantallas internas hacen visible el atajo ya soportado `ESC o clic derecho · volver / cerrar`.
- Admin recibe actividad gruesa allowlisted (`Combat Chess`, `Torneo`, `Así juegas`, etc.) sin FEN, jugadas, chats ni contenido privado.
- Se mantiene Trivy 0.74.0; `trivy fs` conserva misconfiguración y los Dockerfiles quedan cubiertos por el gate de repo, además del gate de imágenes.

## V16.6bj — Reconciliación estricta de releases

- Consolida explícitamente `v16.6bh` + `v16.6bi`: roster 6+6+4 y fuzz legal con presupuesto local de 20 s conviven en una única baseline.
- Admin muestra `Release: v16.6bk · Build: <SHA>` para detectar inmediatamente un despliegue de GitHub Pages desfasado.
- `releaseContinuity.test.js` entra en el gate crítico local y de GitHub CI para proteger features acumuladas clave frente a regresiones de baseline.
- No cambia dependencias ni esquemas persistentes.

Detalles en `docs/v16.6bk-release-reconciliation.md`.

## V16.6bi — Presupuesto explícito para fuzz en CI

- `stateInvariants.test.js` conserva las 32 semillas y hasta 70 plies por semilla, pero el property test pesado tiene un timeout local de 20 s en vez de depender de los 5 s globales de Vitest.
- El bucle evita regenerar el FEN y evita miles de assertions exitosas: sólo lanza error cuando encuentra una violación real, manteniendo el seed/ply/FEN para reproducibilidad.
- No se modifica el timeout global ni se reduce cobertura; los cuelgues del resto de la suite siguen fallando a los 5 s habituales.

Detalles en `docs/v16.6bi-ci-fuzz-budget.md`.

## V16.6bh — Orden de batalla legible + rango global explícito

- El roster pasa de 8×2 a 6+6+4 en escritorio para que alias, rango y estado se lean sin truncarse; la última fila queda centrada.
- Toda la tarjeta abre el expediente y desaparece el redundante `Expediente →`; tablet sigue a 4 columnas y móvil a 2.
- `Soldado/Cabo/...` queda rotulado como **Rango global de campaña**, con una aclaración explícita de que no es ninguna unidad del ejército.

Detalles en `docs/v16.6bh-roster-readability-global-rank.md`.

## V16.6bg — Glosario contextual por hover/tap

- Los términos técnicos del juego tienen tooltip corto contextual: hover con ratón, focus/teclado y tap en móvil.
- `cp`, `CCT`, `FEN`, `PGN`, `ELO`, Accuracy, Blunder y demás comparten una sola fuente de verdad con el Glosario completo.
- Integrado inicialmente en Autopsia, Replay, Rival Fantasma, Laboratorio, Así juegas, Admin, Control táctico, compartir resultados y Tutorial.
- `chessGlossary.test.js` endurece el gate crítico para exigir tooltip breve a todos los términos.

Detalles en `docs/v16.6bg-contextual-glossary-tooltips.md`.

## V16.6bf — Campaña con orden de batalla + glosario

- Combat Chess · Campaña incrusta la formación completa de 16 unidades con alias visibles y expediente individual al pulsar; la hoja global queda reducida a una Carrera de campaña compacta.
- Aprendizaje añade un Glosario buscable (cp, CCT, FEN, PGN, táctica, evaluación, etc.) y la autopsia incluye un glosario rápido cp/CCT.
- `combatCampaign.test.js` entra en el gate crítico para que una regresión de persistencia no espere a la suite completa.

Detalles en `docs/v16.6bf-campaign-roster-glossary.md`.

## V16.6be — CI campaign fix + autopsy context

- Registra las claves persistentes de la campaña de Combat Chess en el perfil y las elimina también con el reset global.
- La autopsia reconstruye contexto táctico real: pieza/casillas, capturas, respuesta real, pieza que castiga una pieza colgada y alternativa del motor.
- Añade regresión para el contexto forense y conserva los tests de campaña como gate.

## V16.6bd — Orden de batalla + Estambul grave

- Roster completo de 16 identidades en formación 8×2; el Rey aparece como mando y las otras 15 unidades conservan carrera militar.
- Alias visibles como nombre principal y expediente individual en modal con servicio, medallas, mejoras, metamorfosis, técnicas y revivir.
- Marca visible unificada: **Combat Chess · Batalla libre** y **Combat Chess · Campaña**.
- Estambul revisado hacia un 9/8 más grave y melódico, ~127–129 BPM, con clarinete/qanun completos y dos dums/kicks dominando el patrón.

## V16.6ba — Combat Chess

- **V16.6bc:** Combat Chess campaign v1, presencia pública que excluye al admin consultante y percusión con subgrave/kick más contundente.
- **Combat Chess** pasa a ser el nombre visible de la campaña roguelike militar; `roguelike` se conserva como descriptor e identificador interno compatible.
- Lema: **Forma tu ejército. Haz veteranos. Rompe las reglas. Sobrevive.**
- Historial y diagnóstico distinguen Combat Chess del Combate libre en vez de etiquetar por defecto registros sin `mode`.

Detalles en `docs/v16.6ba-combat-chess-brand.md`.

## V16.6az — Metamorfosis ganada + compensación de amenaza

- Las formas mutantes ya no se desbloquean sólo por nivel: exigen rango y servicio individual real.
- Caballo: Comandante + 3 supervivencias; Alfil: Coronel + Cinco bajas + Hierro viejo; Torre: General + Veterano de campaña + Cicatriz del Rey Viejo.
- La CPU recibe hasta +20 de dificultad por potencia permanente real del ejército (stats, metamorfosis válidas y técnicas equipadas), con tope absoluto 100.
- La dificultad base y la compensación efectiva quedan registradas en el historial de batalla.

Detalles en `docs/v16.6az-earned-metamorphosis-threat-balance.md`.


## V16.6ax — Técnicas tácticas + NarrativeProvider

- **Fuego de línea**: primer movimiento especial de un solo uso; un peón Coronel puede desbloquearlo por 18 XP propio y capturar hasta 3 casillas como torre, manteniendo la tirada de acierto de Combate.
- **Loadout prebatalla**: las técnicas se desbloquean/equipan desde `Tu ejército`; el uso se reinicia por batalla, no por fase de Boss.
- **Identidad intacta**: revivir conserva alias, ID y técnicas; una baja definitiva sí los destruye.
- **NarrativeProvider**: frontera procedural/LLM-ready; el narrador sólo redacta hechos ya calculados y nunca tiene autoridad sobre jugadas, XP, rangos o estado.

Detalles en `docs/v16.6ax-techniques-narrative.md`.


## V16.6aw — Hotfix reset global del ejército

Corrige la regresión por la que `Borrar todo mi progreso` eliminaba el roster de Combate y acto seguido lo recreaba al generar las nuevas identidades de nivel 1. El reset específico del ejército sigue creando/persistiendo un destacamento nuevo; el reset global ahora deja `chess-study-combat-roster` realmente ausente antes de sincronizar el perfil vacío.

Detalles en `docs/v16.6aw-reset-roster-hotfix.md`.

## V16.6av — Unidades con nombre + loadout de metamorfosis

- Cada ficha de tu ejército nace con alias aleatorio desde nivel 1; una baja definitiva genera un reemplazo con identidad nueva.
- El alias viaja dentro de la batalla y aparece en ficha/logs.
- Metamorfosis deja de ser permanente: eliges forma antes de cada combate.
- Desbloqueos más caros: Comandante → Caballo, Coronel → Alfil, General → Torre; sin Dama por ahora.

Detalles en `docs/v16.6av-combat-identity-loadout.md`.


## V16.6au — Percusión más humana

- Microtiming, dinámica, timbre, decay y panorama varían de forma controlada en los kits acústicos.
- Los downbeats siguen firmes; sólo los golpes secundarios se relajan unos milisegundos.
- Ghost notes muy discretas en darbuka/frame drum/brushes para romper la sensación de caja de ritmos.
- Sin samples ni dependencias nuevas: sigue siendo Web Audio y completamente offline.

Detalles en `docs/v16.6au-percussion-humanize.md`.


## V16.6as — Metamorfosis de veteranos de Combate

- **Rango por pieza**: cada veterano tiene rango militar propio según su nivel real.
- **Peón Capitán**: desde nivel 6 puede elegir una metamorfosis permanente a Caballo o Alfil.
- **Identidad persistente**: conserva slot de origen, mejoras, XP, muerte/revivir e historial aunque cambie de clase.
- **Regla mutante confinada**: sólo se aplica a Combate/Roguelike; normal, torneo y puzzles no se tocan.
- **Boss-safe**: las reconstrucciones de fase restauran la metamorfosis sin resucitar bajas.

Detalles en `docs/v16.6as-combat-metamorphosis.md`.


## V16.6ar — Rangos y condecoraciones de Combate

- Hoja de servicio persistente con rango global, méritos, campañas y condecoraciones por hechos reales.
- Rangos militares individuales de cada pieza superviviente, derivados de su nivel comprado.
- Los rangos altos exigen victorias/progresión real; perder 400 veces no convierte a nadie en General.

Detalles en `docs/v16.6ar-combat-service.md`.


## V16.6ap — Rival Fantasma basado en tu juego real

- **Espejo evoluciona a Rival Fantasma**: conserva la dificultad derivada de tus autopsias y añade tendencias medidas de capturas, peones, dama, jaques y enroques.
- **Sin teatro de IA**: si faltan al menos 3 partidas normales y 3 autopsias, el modo no se habilita ni inventa un perfil.
- **Motor protegido**: el estilo sólo desempata variantes a ≤14 cp y nunca pisa una línea de mate; una dama gratis sigue siendo una dama gratis.
- **Backend validado**: los cinco sesgos aceptan exclusivamente valores `-1..+1`; la partida y sus revanchas conservan el perfil fantasma.
- **CI**: `mirrorMode.test.js` entra en el gate crítico; CI incorpora también el gate de Zen que faltaba en la lista explícita.

Detalles en `docs/v16.6ap-rival-ghost.md`.


## V16.6al — límite real de request + puzzles imposibles + estado centrado

- **API hardening**: el límite de 1 MiB cuenta bytes reales y bloquea también cuerpos chunked/sin `Content-Length`; las rutas públicas de identidad deben conservar rate-limit o CI falla.
- **Puzzles/FEN**: se detectan reyes adyacentes y material imposible por promociones, incluidos alfiles incompatibles con los peones restantes. El banco curado pasa por este validador común.
- **UI**: `X online · Backend UP/DOWN` queda centrado también en responsive.
- **CI**: el nuevo middleware tiene tests propios y entra en el gate backend.

Detalles en `docs/v16.6al-request-hardening-puzzle-center.md`.


## V16.6f — Así juegas unificado + CI reparado

- **Una sola sección “Así juegas”**: desaparece la entrada independiente “Centro de operaciones”; dentro del expediente hay subpáginas `Diagnóstico` y `Expediente` con toda la analítica, coaching, evolución y entrenamiento ya existentes.
- **Frontend CI**: Vitest dispone de `sessionStorage` realista en el setup de Node; se corrige el FEN del test de pieza bloqueada y la legalidad de puzzles entra en el gate crítico.
- **Backend CI**: se corrigen tres tests desfasados (cliente anónimo, score de mate con distancia y firma `email=` del mock) sin relajar seguridad ni modificar el motor para satisfacer asserts antiguos.
- **Deploy condicionado**: Pages sólo despliega `main` después de `CI → Cloudflare Workers AI` en verde, y construye exactamente el SHA aprobado por esa cadena.

Detalles en `docs/v16.6f-ci-insights-hub.md`.


## V16.6b — recuperación de cuenta con Resend

- **Email obligatorio para altas nuevas** cuando la recuperación está activa; las cuentas antiguas siguen entrando sin migración y pueden añadirlo después desde Mi cuenta.
- **Mi cuenta** permite añadir/cambiar el email confirmando la contraseña actual.
- **He olvidado la contraseña** ya tiene flujo UI completo; la respuesta pública no revela si el email existe.
- El enlace `?resetToken=...` abre directamente la pantalla de nueva contraseña, caduca a los **30 minutos**, inicia sesión al completarse e invalida enlaces anteriores al cambiar el hash.
- **Resend por HTTPS**, sin SMTP gestionado por Chess Studio. `RESEND_API_KEY` vive sólo en Render.
- Mongo aplica **índice único parcial de email** para cerrar carreras entre registros/cambios concurrentes sin romper usuarios legacy sin email.
- `render.yaml` activa `ENABLE_EMAIL_RECOVERY=true` y deja el remitente de prueba de Resend; tras verificar `shadowops.dpdns.org`, se cambia `PASSWORD_RESET_FROM` en Render.

Configuración y flujo en `docs/email-recovery.md`.


## V16.6 — La Torre, Rey Boss y economías separadas

- **Roguelike con objetivo**: La Torre tiene 10 pisos, encuentros deterministas, élites, miniboss, recompensa temporal entre pisos y un objetivo explícito. Tras completar el piso 10 se desbloquea continuar en modo infinito.
- **Rey Boss experimental**: sólo el rey del jefe final tiene HP (**5**). Un jaque humano hace **1 daño** y un mate hace **2**. Si un mate no agota sus HP, rompe la fase y la pelea continúa desde una nueva fase. Las piezas normales NO tienen HP.
- **Perks del intento**: se elige 1 de 3 recompensas deterministas al superar cada piso. Fuerza/Velocidad temporales se aplican sólo durante ese intento y no contaminan la veteranía permanente.
- **Torneo saneado**: capturas = **moneda de pistas únicamente**; resultados = XP/nivel del torneo; ELO = resultado de la partida contra la dificultad real. Se recalibra la curva de dificultad porque el motor actual castiga bastante más que el antiguo.
- **CI de Pages**: `.github/workflows/static.yml` ejecuta gate crítico + suite frontend completa antes del build/deploy. `npm ci` sólo instala dependencias; no ejecuta tests.
- **Última actividad**: login/heartbeat mantienen `last_activity`; login fuerza además `last_login` y el admin tiene fallback para cuentas legacy, evitando el falso “Sin actividad”.
- **Movimiento ilegal por seguridad del rey**: doble beep SFX en intentos claros de mover una pieza clavada/dejar el rey expuesto; la CPU lo explica en Game Chat una sola vez por partida aunque insistas.
- **Música**: el catálogo sube a **42 temas**, añadiendo seis pistas originales más cálidas/animadas con oud + guitarra española y chill jazz luminoso, sin copiar melodías de las referencias.

Detalles en `docs/v16.6-tower-boss-ci-tournament.md`.


## V16.5 — saneamiento de Combate + recuperación + audio vivo

- **Combate/Roguelike auditado**: Fuerza y Velocidad vuelven a tener funciones distintas; los encuentros se fijan por seed+piso; la previsión coincide con el piso real; el fuego concentrado sólo acumula fallos consecutivos al mismo objetivo; una jugada tranquila, un acierto o cambiar de blanco lo reinicia.
- **Integridad ajedrecística de Combate**: salir de jaque y una captura que da mate conectan al 100 %; los fallos no fabrican mate/ahogado por un turno nulo y sí pueden activar unas tablas legítimas por 50 jugadas. CI tiene un gate específico para Combate/Roguelike.
- **Recuperación de cuenta por email**: las altas nuevas de la UI piden email, se puede cambiar desde Mi cuenta y existe `He olvidado la contraseña` con enlace de 30 minutos e invalidación tras usarlo. En producción el envío usa Resend; en desarrollo, sin proveedor, el enlace se deja en logs.
- **Torneo y rating**: cada partida de torneo actualiza ELO igual que una partida normal; perder resta, ganar suma y las tablas se ajustan a la fuerza rival.
- **VOICE más robusto**: OFF por defecto, preview dentro del gesto del usuario y reintento para Chromium cuando `speechSynthesis.speak()` acepta una frase pero no llega a arrancarla. La voz sólo lee entradas reales de Game Chat y mantiene el ducking de música.
- **Mini-Winamp**: control de volumen 0–100 persistente por perfil. El catálogo sube a **36 temas**, con cuatro pistas nuevas más rítmicas (`Cairo · farol rojo 01:37`, `Beirut · taxi nocturno 02:18`, `Tánger · mesa roja`, `Estambul · tavla 03:08`) para equilibrar los nocturnos contemplativos.
- **Navegación y UX**: clic derecho hace atrás igual que ESC en pantallas internas, sin secuestrar el menú contextual de campos editables. Una pieza legalmente inmóvil por clavada absoluta lo explica en pantalla en vez de parecer rota.

Detalles y reglas verificadas en `docs/v16.5-sanitization.md`.


## V16.4 — voz del rival + mesa alineada + compartir compacto

- `VOICE ON/OFF` pasa a la cabecera de Game Chat y está **OFF por defecto**; la CPU pronuncia únicamente los comentarios reales del chat, no narraciones genéricas de capturas/jaques.
- Perfil TTS sobrio/docto: se prioriza `es-ES`, voz natural cuando el SO la ofrece, ritmo pausado y tono ligeramente grave. La música hace *ducking* mientras habla y recupera volumen después.
- La mesa de partida refuerza la geometría **Winamp izquierda / tablero centro / Game Chat derecha**, con los tres alineados por arriba.
- El modal **Compartir** se compacta y equilibra: tarjeta estable y cuatro acciones en una rejilla 2×2 (1 columna en móvil).

Detalles en `docs/v16.4-voice-layout-share.md`.


## V16.3 — Así juegas visible + login silencioso + 32 temas

- **“Así juegas”** deja el footer y pasa a ser una llamada principal dentro de “Aprender y practicar”, para que el análisis personal no quede escondido.
- **Login silencioso**: no se muestra el mini-Winamp ni arranca música antes de autenticarse; la música comienza cuando el perfil del usuario real ya está sincronizado.
- El catálogo crece de 27 a **32 temas**. Nuevas piezas: `Cairo · Quiet Hours`, `Nilo · balcón 01:52`, `Alepo · después de la lluvia`, `Amán · habitación de terciopelo` y `Medina · humo azul`.
- Las cinco nuevas mantienen forma larga, cuatro secciones, melodía/contramelodía y arreglos originales de jazz árabe nocturno e introspectivo.

Detalles en `docs/v16.3-insights-login-quiet-jazz.md`.


## V16.2 — radio / tablero / rival + 27 temas

- Durante partida: mini-Winamp a la izquierda, tablero al centro y Game Chat a la derecha; la notación queda debajo del tablero.
- Fuera de partida el reproductor permanece arriba como en V16.1.
- Se retira `MUSIC ON/OFF`: Play/Pause + Stop gobiernan la música; `FX ON/OFF` sigue independiente.
- Catálogo ampliado de 21 a **27 temas**, con seis nuevas piezas originales de cuatro secciones y mayor desarrollo melódico/contrapuntístico.

Detalles en `docs/v16.2-radio-board-rival-music.md`.


## V16.1 — reproductor global + Game Chat

- El mini-Winamp es ahora global y permanece disponible en todas las pantallas, incluidos login, sincronización y resultados compartidos.
- Los comentarios en vivo de la CPU se registran en un **Game Chat** persistente por partida, sobreviven a refresh/Continuar y quedan archivados con la partida para releerlos desde Historial/Replay.
- Los comentarios de resultado tardíos también se incorporan al registro ya guardado.
- El gate aislado del core ajedrecístico mantiene **25/25 tests PASS**.

Detalles en `docs/v16.1-global-player-game-chat.md`.

## V15.5 — Reproductor retro + Beirut 01:13

- Mini reproductor de música tipo Winamp en la cabecera: anterior, Play/Pause real, Stop real, siguiente, contador/progreso y selector de tema.
- Pause conserva el punto del secuenciador; Stop reinicia la pista a 00:00. Mute de música y mute de FX siguen siendo controles separados.
- El tema inicial sigue sorteándose en cada login y permanece durante esa sesión salvo cambio manual.
- Nuevo tema original `Beirut 01:13`: jazz levantino nocturno con buzuq sintético, clarinete oscuro, Rhodes, contrabajo y escobillas, con forma larga antes de repetir el arreglo.
- `Al-Ándalus` permanece intacto.

# Estudio de Ajedrez

<!-- Cambia TU-USUARIO/TU-REPO por los reales una vez que publiques el repo -->
![CI/CD](https://github.com/TU-USUARIO/TU-REPO/actions/workflows/cicd.yml/badge.svg)

App de ajedrez full-stack: motor de IA propio (minimax con poda alfa-beta),
seis modos de juego, progresión persistente, cuentas de usuario, y un
sistema de análisis retrospectivo que muestra dónde te equivocaste en
cualquier partida ya jugada.

## Estructura

```
chess-game/
├── backend-python/     API en Python/FastAPI + motor de ajedrez propio (minimax)
└── frontend/           App en React (Vite)
```

## Cómo correrlo

### Con Make

```bash
make game      # construye y levanta backend + frontend (primer plano)
make ungame    # para y elimina los contenedores
```

Otros comandos: `make game-bg` (segundo plano), `make logs`, `make status`,
`make restart`, `make clean`. `make help` los lista todos.

### Con Docker Compose

```bash
docker compose up --build
```

- **Backend**: Python/FastAPI en el puerto `4000` (`/docs` tiene la
  documentación interactiva de la API, generada por FastAPI)
- **Frontend**: build de producción servido por Nginx, en el puerto `5173`

Para cambiar los puertos:

```bash
BACKEND_PORT=4001 FRONTEND_PORT=5174 docker compose up --build
```

Para bajar todo: `docker compose down`.

> `frontend/Dockerfile` fuerza `--base=/` al compilar — Docker Compose
> siempre sirve el frontend desde la raíz (Nginx sirve el build directo
> en `/`), a diferencia de GitHub Pages
> (`usuario.github.io/nombre-repo/`). `vite.config.js` trae un `base`
> fijo pensado para ese segundo caso; sin el `--base=/` explícito en el
> Dockerfile, el build local heredaría ese prefijo y el `index.html`
> pediría los assets en una ruta que Nginx no tiene — el bundle nunca
> llegaría a cargar.

### Local, sin Docker

Requiere Python 3.13+ y Node.js 18+. Son dos procesos separados.

```bash
# Backend
cd backend-python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 4000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

Sin Docker Compose no hay Mongo disponible, así que el backend guarda las
partidas en memoria automáticamente — funciona igual, solo que no
sobreviven a un reinicio. Para persistencia real sin Docker, corre un
Mongo aparte y exporta `MONGO_URL` antes de arrancar `uvicorn` (por
defecto usa `mongodb://localhost:27017`).

### Tests

```bash
# Backend
cd backend-python
pip install -r requirements-dev.txt
pytest -v

# Frontend
cd frontend
npm test           # corre toda la suite una vez
npm run test:watch # modo watch
```

Hay suites de backend y frontend para motor de IA, endpoints, combate, rating, torneo, análisis de partidas, autenticación y el resto de módulos. `.github/workflows/cicd.yml` ejecuta el pipeline principal en cada push y pull request; en `main` encadena `Tests → Cloudflare Worker · Terraform → GitHub Pages`. Los workflows auxiliares de coverage/E2E completo son informativos/manuales o programados; el deploy de producción no vive en ellos.
frontend antes de publicar — si algo falla, el deploy no arranca.

## Modos de juego

- **Partida rápida / Partida de práctica** — contra la CPU, dificultad
  ajustable de 0 a 100. "Partida de práctica" suma pistas del motor
  gratis e ilimitadas.
- **Torneo** — progresión persistente con economías separadas: los resultados
  dan XP de nivel, las capturas dan moneda para pistas y el rating ELO sólo
  cambia por el resultado final contra la CPU. Los títulos/skins se desbloquean
  por nivel.
- **Combate** — ajedrez con una capa de RPG: las capturas se resuelven
  con un % de acierto donde **Fuerza es ofensiva y Velocidad defensiva**.
  Un fallo consume el turno sin mover la pieza; salir de jaque o dar mate
  mediante una captura es 100 % seguro. Las piezas bancan XP y lo gastan
  al terminar la batalla. Si cae una veterana hay una sola ventana para
  recuperarla con XP de combate: si no, se pierde su progreso y ese slot
  vuelve en la siguiente batalla como pieza nueva de nivel 1.
- **Combat Chess · La Torre** — roguelike militar de 10 pisos con encuentros de seed persistente,
  élites/miniboss y una recompensa temporal entre pisos. El piso 10 enfrenta
  al **Rey Viejo**: sólo ese rey usa HP (5); jaque = 1 daño y mate = 2. Las
  piezas normales siguen sin HP. Tras derrotarlo se desbloquea modo infinito.
  Tablas, derrota, retirada o una batalla interrumpida terminan el intento.
- **Rival Fantasma** — una CPU calibrada con tus autopsias y tendencias reales de
  capturas, peones, dama, jaques y enroques. El estilo sólo desempata variantes
  casi equivalentes del minimax; no convierte tus manías en blunders artificiales.
- **Espectador** — dos CPU jugando entre sí, con pausas configurables.
- **Aprendizaje** — diez lecciones interactivas, una por pieza más
  enroque y jaque mate.
- **Aperturas famosas** — dieciocho aperturas clásicas, reintentos
  jugada por jugada con explicación en cada una.
- **Puzzle** — posiciones cortas para resolver (mate en 1, mate en 2,
  encontrar la jugada que gana material), con racha y reintentos pagados
  con puntos de torneo.

## Análisis y progreso

- **Historial y "pista inversa"** — cualquier partida terminada se
  reproduce jugada por jugada, comparando cada movimiento tuyo contra lo
  que el motor hubiera preferido en ese momento. Un panel lateral marca
  tus peores jugadas de la partida, con salto directo a cada una.
- **Autopsia PRO + Cámara del crimen** — al terminar una partida, el informe
  clasifica los tres incidentes más graves, emite un dictamen sarcástico y permite
  saltar al replay justo antes de la peor jugada. "Reproducir crimen" muestra
  el impacto y la alternativa preferida por el motor.
- **"Así juegas"** — estadísticas agregadas (aperturas, rachas, color
  preferido, capturas, evolución de rating), roast sarcástico basado en hechos
  y una sección de entrenamiento con hasta cinco prioridades accionables:
  reincidencias tácticas, aperturas problemáticas, repertorio estrecho, sesgo de
  color, poco trabajo de puzzles o tendencia de rating. Todo eso se calcula al
  instante sin análisis extra. "Buscar mi peor jugada de siempre" sí analiza el
  historial completo bajo demanda, con resultados cacheados por partida.
- **Rating tipo ELO** — sube o baja según tus resultados en Torneo y
  partidas normales (Combate y Práctica quedan afuera de la medición).
  Arranca en 400, con un K-factor más alto en tus primeros 12 partidos.
- **Logros y trofeos de vergüenza** — hitos normales más eventos tácticos raros: mate ignorado, mate regalado, dama perdida contra peón, ahogado ganador, horquillas sufridas y también hazañas como coronar o capturar una dama con peón.
- **Voz de la CPU** — `VOICE ON/OFF` vive dentro de Game Chat y arranca **OFF**.
  Usa Web Speech API nativa: sólo pronuncia las frases que realmente entran en
  el chat, con una selección de voz `es-ES` sobria, ritmo pausado y ducking de
  la música. Al activarla hace una prueba audible y reintenta el motor cuando
  Chromium acepta `speak()` pero no llega a arrancar la utterance. La voz final
  disponible depende de las voces TTS instaladas/ofrecidas por navegador y SO.
- **Música ambiental seleccionable** — **42 temas** sintetizados con Web Audio
  API (sin archivos de audio). **Al-Ándalus conserva su generador original** y
  el resto usa secuenciación estructurada, secciones largas, melodía y
  contramelodía. El catálogo mezcla jazz árabe/nocturno contemplativo con temas
  más vivos y rítmicos. En cada login autenticado se sortea un tema y permanece
  durante esa sesión salvo cambio manual; en login/sincronización inicial no
  hay reproductor ni música.
- **Audio** — Play/Pause y Stop gobiernan la música; FX tiene su ON/OFF separado
  y el mini-Winamp incorpora volumen 0–100. Volumen y FX se sincronizan en el
  perfil.
- **Logs correlacionables** — El backend emite `request_id=<id>` y
  `user=<username>` junto a método, ruta, estado HTTP y duración. El navegador
  genera `X-Request-ID`, el backend lo devuelve en la respuesta y los errores
  visibles incluyen `Ref: <id>` para encontrarlos en Render en segundos. Nunca
  se registran contraseñas ni JWT.
- **Experimento 3D** — ajedrez jugable en 3D, marcado explícitamente
  como experimental, aislado del resto de la app.

## CPU

En las partidas contra la CPU aparece un avatar discreto del rival. No
comenta cada movimiento: sólo interviene ante sucesos especialmente
llamativos detectables al instante y sin requests extra al motor, por
ejemplo mates, mates en una ignorados o regalados, ahogados sangrantes,
damas capturadas (especialmente por peones), promociones, horquillas,
ensartados, jaques a la descubierta y sacrificios vistosos. Las frases son sarcásticas/jocosas y varían según la barbaridad la haya hecho el humano o la propia CPU. No existe selector ni etiqueta de personalidad: la CPU simplemente tiene un carácter fijo, sarcástico, despiadado y elegante, con la misma memoria de rivalidad en todas las partidas. La fuerza del motor sigue dependiendo únicamente de la dificultad.

## Cuentas y sincronización

Registro con usuario, contraseña y **email de recuperación** (JWT, sin OAuth).
Las altas nuevas de la interfaz piden email; cuentas antiguas pueden añadirlo o
cambiarlo desde **Mi cuenta** confirmando su contraseña actual. `He olvidado la
contraseña` envía un enlace temporal de 30 minutos que queda invalidado tras el
primer cambio de contraseña. Si `INVITE_CODE` está configurado, crear cuenta
exige además ese código; `ALLOW_REGISTRATION=false`
cierra las altas por completo. Las rutas públicas de identidad son registro,
login y solicitud/consumo de recuperación; además `/api/health` es público. El
resto de la API exige autenticación. Las partidas nuevas quedan asociadas al username del
JWT y otro usuario no puede leerlas, moverlas, deshacerlas ni borrarlas aunque
conozca el UUID. Tu progreso (torneo, ejército de combate, rating, logros, historial de
partidas) vive en `localStorage` del navegador y se sincroniza con el
backend en cada cambio de pantalla — sobrevive a limpiar el navegador o
cambiar de dispositivo, siempre que inicies sesión con la misma cuenta.
Si el backend no está disponible, la app sigue funcionando igual con lo
que haya local. También se puede exportar/importar el progreso como
archivo, y hay un botón para borrar todo el progreso local (con
confirmación) si quieres empezar de cero.

**Panel de admin**: la variable de entorno `ADMIN_USERNAMES` (lista
separada por comas, mismo patrón que `M2M_API_KEYS`) marca qué cuentas
ven el link "Panel de admin" en el menú. También acepta el comodín `*`
para convertir a cualquier cuenta autenticada en admin; el
`docker-compose.yml` local lo usa así a propósito. En producción conviene
usar siempre una lista explícita de usernames. El panel muestra resumen y
un expediente desplegable por usuario (rating actual/máximo, resultados,
rachas, dificultad máxima vencida, capturas y damas ganadas/perdidas,
puzzles, logros y la peor jugada ya analizada/cacheada). Sin la variable
configurada, nadie es admin. El backend revalida el permiso en cada
request — el frontend solo decide si mostrar el link o no, esa decisión
nunca es la barrera de seguridad real.

**ESC** y el **clic derecho** hacen “atrás” en las pantallas internas y cierran
el modal superior. Durante una partida/batalla activa no abandonan la partida
accidentalmente; el clic derecho tampoco secuestra el menú contextual dentro de
inputs, textareas ni otros campos editables.

## API del backend

La documentación FastAPI (`/docs`, `/redoc`, `/openapi.json`) está deshabilitada
por defecto, también en producción. En un entorno de desarrollo controlado se
puede habilitar explícitamente con `EXPOSE_API_DOCS=true`.

**Política de acceso:** todo endpoint funcional exige JWT, excepto registro,
login, `forgot-password`, `reset-password` y `/api/health`. `/api/analyze` y
`/api/analyze-move` aceptan como alternativa
una `X-API-Key` presente en `M2M_API_KEYS`. No existe análisis anónimo.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crea una cuenta. Body: `{ username, password, email?, inviteCode? }`. La UI V16.5 exige email en altas nuevas; el backend conserva compatibilidad con cuentas/clientes antiguos. |
| POST | `/api/auth/login` | Inicia sesión, devuelve un token |
| POST | `/api/auth/forgot-password` | Solicita recuperación por email. Respuesta genérica exista o no la cuenta; límite 5/hora/IP. |
| POST | `/api/auth/reset-password` | Cambia contraseña usando el token temporal de recuperación; límite 10/hora/IP. |
| PUT | `/api/auth/email` | Cambia el email de recuperación de la cuenta autenticada confirmando la contraseña actual. |
| GET | `/api/auth/me` | Usuario autenticado actual; incluye `email` e `isAdmin` |
| POST | `/api/games` | **JWT.** Crea partida privada del usuario autenticado. Body: `{ difficulty: 0-100, color: 'w'\|'b'\|'random', handicap? }` |
| GET | `/api/games/:id` | **JWT + ownership.** Estado actual de una partida propia |
| GET | `/api/games/:id/hint` | **JWT + ownership.** Sugerencia del motor |
| POST | `/api/games/:id/move` | **JWT + ownership.** Jugada del humano. Body: `{ from, to, promotion? }`. Responde ya con la jugada de la CPU aplicada |
| POST | `/api/games/:id/undo` | **JWT + ownership.** Deshace tu última jugada (y la respuesta de la CPU, si la hubo) |
| DELETE | `/api/games/:id` | **JWT + ownership.** Abandona/borra la partida |
| POST | `/api/analyze` | **JWT o API key M2M.** Mejor jugada para una posición suelta. Body: `{ fen, level? }` |
| POST | `/api/analyze-move` | **JWT o API key M2M.** Compara una jugada jugada contra la mejor posible en esa posición. Body: `{ fen, from?, to?, level? }` |
| GET | `/api/profile` | Perfil del usuario autenticado + revisiones por clave (requiere token) |
| PUT | `/api/profile` | Reemplazo completo compatible para importaciones/clientes antiguos; avanza revisiones de claves modificadas |
| PATCH | `/api/profile` | Sincronización optimista por clave con revisiones; devuelve `409` + snapshot remoto si una clave cambió en otra pestaña |
| GET | `/api/admin/users` | Lista de usuarios registrados con sus estadísticas — requiere `ADMIN_USERNAMES` |
| GET | `/api/health` | Liveness barata del servicio; no toca Mongo |
| GET | `/api/ready` | Readiness: exige Mongo si la persistencia está configurada; en desarrollo puede indicar `storage: memory` |

### Rate limiting

Por IP, con [slowapi](https://github.com/laurentS/slowapi). **120
requests/minuto** por defecto en toda la API; `/api/analyze` en
**60/minuto**; `/api/analyze-move` en **180/minuto**. `/api/health` queda
exento, para que el healthcheck de Docker nunca se vea afectado.

`M2M_API_KEYS` (variable de entorno, lista separada por comas) habilita
tráfico M2M autenticado exclusivamente para `/api/analyze` y
`/api/analyze-move`: un `X-API-Key` válido sube además su límite a
**1000/minuto**, con cupo propio por key. Sin JWT ni API key válida esos
endpoints devuelven 401. Sin la variable configurada, ninguna key valida.

Login queda limitado a **10 intentos/minuto/IP**, registro a **5/hora/IP**,
solicitud de recuperación a **5/hora/IP** y consumo del token de reset a
**10/hora/IP**.
`INVITE_CODE` funciona como puerta de entrada: si existe, un alta sin el código
correcto devuelve 403. `ALLOW_REGISTRATION=false` sigue siendo el cortacorriente
maestro para congelar altas sin cambiar el código. En producción el backend se
niega a arrancar si `JWT_SECRET` conserva la clave de desarrollo o tiene menos
de 32 caracteres. CORS queda restringido a orígenes exactos; además normaliza
configuraciones con una ruta de GitHub Pages (`.../chess-studio/`) al Origin real
`https://evilsysadmin.github.io`, evitando el 400 de preflight visto en V10.

## Desplegar en producción

GitHub Pages solo sirve archivos estáticos, así que el reparto queda
así: **frontend en GitHub Pages** (lo que produce `vite build`) y
**backend en un hosting con soporte de contenedores** (Render, por
ejemplo) + **MongoDB Atlas** para persistencia.

### 1. Backend en Render

1. Anda a [render.com](https://render.com) y conecta tu cuenta de GitHub.
2. **New → Blueprint**, elige este repo. Render detecta `render.yaml`
   solo y arma el servicio a partir de `backend-python/Dockerfile`.
3. Carga `MONGO_URL` a mano en el dashboard (queda como secreto, no vive
   en el repo):
   1. Crea una cuenta gratis en
      [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) y
      arma un cluster **M0** (nivel gratis para siempre).
   2. **Database Access** → crea un usuario con contraseña.
   3. **Network Access** → agrega `0.0.0.0/0` (cualquier IP) — el
      hosting gratuito no tiene una IP fija conocida de antemano.
   4. **Connect → Drivers** → copia la connection string (con la
      contraseña real, no un placeholder) y pégala como `MONGO_URL`.
4. Carga también `JWT_SECRET` como variable secreta con un valor largo y aleatorio. El valor de desarrollo incluido en el código no debe usarse en Internet.
5. Para **recuperación de contraseña real**, crea una API key en Resend y guárdala
   como `RESEND_API_KEY`. Configura `PASSWORD_RESET_URL` con la URL pública exacta
   del frontend (para este repo: `https://evilsysadmin.github.io/chess-studio/`).
   Para enviar a cualquier usuario, verifica un dominio/remitente en Resend y
   define `PASSWORD_RESET_FROM`; el remitente de prueba de Resend tiene
   restricciones. Sin API key, en desarrollo el enlace se imprime en logs.
6. Si quieres altas por invitación, configura también `INVITE_CODE` con un valor no trivial. Puedes mantener `ALLOW_REGISTRATION=true`: el invite code ya gatea el registro. Usa `ALLOW_REGISTRATION=false` sólo si quieres congelar todas las altas.
7. Cuando termine el deploy, Render te da una URL tipo
   `https://chess-study-backend.onrender.com`.
8. Confirma que arrancó bien: `https://tu-url.onrender.com/api/health`
   debería devolver `{"ok":true}`. Si no responde, revisa los logs del
   servicio en el dashboard de Render.

> El plan free de Render duerme el servicio tras 15 minutos sin
> tráfico — la primera visita después tarda 30-60 segundos en responder
> mientras arranca de nuevo. Es normal. La pantalla de login dispara un
> pedido a `/api/health` apenas se muestra (sin esperar a que se mande el
> formulario, "fire and forget" — nunca bloquea ni muestra error si
> falla) para empezar a despertar el backend mientras el usuario escribe
> sus credenciales, en vez de que el cold-start le pegue justo en el
> login real.

### Dominio propio: Pages + API (Cloudflare + Render)

`chess-studio.shadowops.dpdns.org` es el dominio público del frontend en
GitHub Pages. La API no puede compartir ese hostname: usa el dominio actual
de Render o el subdominio independiente `api.chess-studio.shadowops.dpdns.org`.
Para este último, asócialo al servicio en **Render -> Settings -> Custom
Domains** y verifica el CNAME en DNS.

Terraform crea e importa, si ya existían, ambos CNAME DNS-only: el frontend
apunta a `evilsysadmin.github.io` y la API a `chess-study-backend.onrender.com`.
En Render añade primero `api.chess-studio.shadowops.dpdns.org` como Custom
Domain y, cuando quede verificado, configura
`VITE_API_URL=https://api.chess-studio.shadowops.dpdns.org/api` en las variables
de Actions de GitHub y vuelve a desplegar el frontend. La API incluye ahora una ruta `/`
de diagnóstico para que abrir el dominio del backend no termine en el 404
genérico de FastAPI; `/api/health` es liveness y `/api/ready` es el readiness que comprueba el almacenamiento persistente.

### 2. Frontend en GitHub Pages

1. En el repo de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**, agrega
   una variable `VITE_API_URL` con `https://api.chess-studio.shadowops.dpdns.org/api`
   después de verificar el dominio en Render.
3. Haz push a `main`. `.github/workflows/cicd.yml` ejecuta un único pipeline serial: `Tests → Cloudflare Worker · Terraform → GitHub Pages`. Si Tests o Terraform fallan, Pages no arranca; las tres etapas trabajan sobre el mismo `github.sha`.
4. En un par de minutos, el sitio queda en
   `https://chess-studio.shadowops.dpdns.org/`.

### Persistencia

Las partidas activas se guardan en MongoDB, no en memoria — si se
reinicia el backend, "continuar partida" sigue funcionando. Si Mongo no
está disponible, el backend cae automáticamente a un diccionario en
memoria y avisa por consola, sin romper el desarrollo local. El torneo y
el historial de partidas jugadas siguen viviendo en `localStorage` del
navegador, sincronizados con el perfil del usuario autenticado.

## Créditos

Las piezas del tablero (`frontend/src/pieces-medieval/`) son diseño
propio, pixel art construido desde cero.

## Documentación adicional

Notas técnicas más detalladas de algunas partes puntuales del proyecto
viven en `docs/`: el pipeline de renderizado headless usado para
verificar el pixel art y las piezas 3D, el estado del experimento 3D, la
configuración del dominio Cloudflare/Render y una reserva de ideas en
`docs/roadmap-ideas.md`.

## v7 — entrenamiento con memoria

La aplicación puede convertir errores serios detectados por la Autopsia en puzzles personales, mantiene un marcador persistente contra la CPU única, registra reincidencias tácticas, incorpora desafío diario, expediente de aperturas y heatmap de pecados en “Así juegas”. Véase `docs/v7-features.md`.

## V12 — Rivalidad y memoria

- Relojes: 1+0, 3+2, 5+0, 10+0, 15+10 y sin reloj.
- Series al mejor de 3/5 con color alternado, marcador en partida e historial de series.
- Compartir resultados mediante enlaces públicos autocontenidos en el hash, sin exponer sesión/JWT/perfil.
- Memoria contextual de la CPU basada en rachas, aperturas repetidas, nivel, resultados recientes e hitos reales.

Detalles: `docs/v12-rivalry-memory.md`.

## V13 — Centro de operaciones

La V13 añade una capa de carrera/entrenamiento sobre las partidas reales: contratos, temporadas, Puzzle Rush, Racha, Boss Run, evolución, perfil ajedrecístico, mapa de aperturas, cementerio, rescate de posiciones desde FEN, película automática, tarjeta PNG compartible y hemeroteca contextual de la CPU. Ver `docs/v13-operations-center.md`.

## V14 — Expediente total

V14 amplía el Centro de Operaciones con accuracy propia, informe semanal, Hall of Fame/Shame, conversión de ventajas, defensa desesperada, rivalidad y clínica por aperturas, material donado, presión de reloj, Copa personal, Sudden Death, control táctico, predicción prepartida, confianza contextual de la CPU, laboratorio libre, temas de tablero desbloqueables y autopsias compartibles por incidente. No añade nuevas mecánicas de resurrección de partidas; se conserva únicamente el rescate desde posición intermedia que ya existía y sigue siendo entrenamiento sin ELO.

Detalles: `docs/v14-full-madness.md`.

## V15.1 — reparación de migración visual/estadística

- Centro de Operaciones reconcilia automáticamente las estadísticas básicas con historiales anteriores a V13/V14, evitando temporadas/rivalidades a cero cuando ya existen partidas.
- Laboratorio Libre reutiliza ahora el tablero principal y, por tanto, el sprite art/skin/tema seleccionado.

Detalles en `docs/v15.1-fixes.md`.

## V15.2 — música larga y expediente “Así juega” en Admin

- Los 17 temas estructurados tardan ahora al menos dos minutos en repetir exactamente su forma de arreglo; Al-Ándalus conserva intacto su generador original.
- Admin → Ver detalles incluye “Así juega <usuario>”, cargado bajo demanda y calculado con el mismo motor de insights/sarcasmo/coaching que usa el propio jugador.
- La nueva ruta de detalle admin sigue protegida por JWT + comprobación de rol admin y no expone credenciales ni el perfil completo.

Detalles en `docs/v15.2-music-admin-insights.md`.


## V16.6a — ELO dinámico en torneo

El cambio de ELO depende del resultado y de la fuerza efectiva de la CPU; capturas, puntos de pistas y XP de torneo permanecen separados. Véase `docs/v16.6a-dynamic-tournament-elo.md`.

## V16.6 — Torneo saneado, Torre Roguelike y gates de deploy

- ELO dinámico por fuerza efectiva de la CPU y resultado; capturas/XP/pistas quedan desacoplados.
- Curva de dificultad del torneo recalibrada para el motor V16.x.
- Última actividad del admin con heartbeat, last_login y fallback legacy.
- `static.yml` ejecuta gate crítico + suite frontend antes de build/deploy.
- Movimiento ilegal por seguridad del rey: beep repetible + explicación única en Game Chat.
- 42 temas ambientales, con una nueva tanda andalusí/café más animada.
- Roguelike convertido en Torre de 10 pisos con encuentros, recompensas temporales, miniboss, Rey Viejo de 5 HP y modo infinito tras completarla.
- Recuperación por email permanece desactivada en esta release.

## V16.6am — Admin móvil legible

En pantallas de hasta 700 px, Admin deja de comprimir la tabla de escritorio y presenta cada usuario como una ficha legible y táctil. Acciones deja de ser sticky en móvil y los detalles expandidos se adaptan a una sola columna. Véase `docs/v16.6am-mobile-admin.md`.

## V16.6an — expediente histórico de series

BO3/BO5 ahora deja un expediente persistente: rachas de series, barridas, remontadas, finales decisivas y las cinco series recientes aparecen en **Así juegas**. La CPU usa esos hechos reales al abrir o cerrar una serie, sin inventar recuerdos. Véase `docs/v16.6an-series-dossier.md`.

## V16.6ao — Modo Zen / examen

La partida incorpora un `Zen: ON/OFF` persistente por perfil. Oculta coordenadas, ayudas legales, última jugada, predicción, comentarios/voz de CPU, Game Chat, notación y avisos secundarios sin tocar reglas, memoria ni estadísticas. Se conservan reloj y avisos imprescindibles del modo. Véase `docs/v16.6ao-zen-mode.md`.

## V16.6ay — expediente individual y Memorial de Caídos

Cada identidad de Combate mantiene historial propio de batallas, supervivencias, bajas, bosses, rachas y condecoraciones. Una baja conserva una única ventana de resurrección; si se inicia la siguiente batalla sin recuperarla, su identidad pasa definitivamente al Memorial y el slot recibe un recluta nuevo con otro alias y expediente limpio. Véase `docs/v16.6ay-unit-dossiers-memorial.md`.


## v16.6bk — Combat resume hotfix

- Las batallas activas de Combat Chess guardan un snapshot efímero en `sessionStorage` después de cada turno.
- Un reload/remount en la misma pestaña reanuda la batalla en vez de devolver al setup.
- Campaña/Torre reconocen el snapshot al restaurar un nodo ya marcado como `fighting`.
- Finalizar, retirarse, volver al setup o cambiar explícitamente de sesión limpia el snapshot.
- Una rotación de JWT del mismo username en otra pestaña ya no se trata como cambio de identidad ni fuerza `window.location.reload()`. Un cambio real de usuario sigue recargando por seguridad.

## v16.6bm — Deployment táctico y barracón ampliado

Combat Chess incorpora una mesa de guerra previa a batalla reutilizando el tablero real: drag/drop o tap para asignar identidades a sus 16 puestos de origen. El barracón puede superar 16 unidades mediante refuerzos permanentes de campaña; las reservas no cuentan como participantes, bajas ni amenaza hasta que se despliegan. La metamorfosis cambia la forma de combate, no la identidad ni el tipo de puesto: un peón metamorfoseado sigue ocupando un slot de peón. Véase `docs/v16.6bm-combat-deployment-board.md`.


## v16.6bn — XCOM-lite, Deployment 2.0 y tutoriales in-game

Combat Chess añade briefing previo a batalla, créditos operativos e inteligencia progresiva que permite decidir qué veteranos arriesgar sin filtrar de gratis la dificultad exacta. Deployment gana búsqueda, filtros, orden y auto-fill por veteranos/reclutas. Además, `Aprendizaje` incluye tutoriales de todas las mecánicas actuales que se salen del ajedrez estándar y los modos especiales enlazan a su ayuda contextual. Véase `docs/v16.6bn-xcom-deployment2-tutorials.md`.
## v16.6dd · Test-suite audit

Auditoría exhaustiva de calidad de tests. Principales cambios:

- Playwright pasa de 2 a 5 flujos y cubre deployment obligatorio, hover/doble clic Tablero↔Banquillo y continuidad de una batalla Combat tras reload.
- El gate frontend crítico baja de 60 a 25 ficheros (75,7% → 41,6% de las definiciones), manteniendo `npm test` como autoridad completa.
- `combatOperationalUx.test.js` deja de depender de copy de UI para contratos de comportamiento.
- Tests backend puros de narrativa/request-limits quedan aislados de auth/Mongo.
- `prepare_repo.py` deja de autoeditar tests obsoletos.
- Playwright conserva trace/screenshot/video de fallos en CI.
- Auditor y deuda restante documentados en `docs/TEST_SUITE_AUDIT.md`.


## v16.6de · Coverage + navegador real

- Coverage V8 real sobre la lógica crítica frontend, con umbral inicial de 60% líneas/funciones/statements y 50% branches.
- Coverage backend con pytest-cov y branch coverage; umbral inicial global 55%.
- El CI genera y conserva informes `lcov`/`coverage.xml`.
- Los componentes/interacciones React siguen probándose en Chromium real con Playwright, no con contratos de strings.
- Nuevos casos DOM para focus, click/doble-click y persistencia de la ficha de unidad.

Los umbrales son un **ratchet inicial**, no una meta final: deben subir cuando el baseline real de CI sea conocido.

## v16.6df · Coverage informativo

Coverage deja de ser un gate bloqueante. La suite frontend/backend sigue siendo
obligatoria, pero los jobs de coverage usan `continue-on-error` y publican sus
artifacts aunque el baseline esté por debajo de las referencias. Frontend ya no
declara `thresholds` en Vitest y backend mantiene branch coverage con
`--cov-fail-under=0`. `make coverage` también informa sin tumbar `release-gate`.
El objetivo es observar primero el baseline real y aplicar ratchet más adelante.

## v16.6dg · Hotfix de contratos estáticos

Tres fallos de Vitest eran expectativas antiguas, no regresiones del juego. Los contratos de Combat dejan de depender de una palabra presente sólo en un comentario, de una condición que ahora vive en `canReturnCombatToSetup()`, y del antiguo guard global `pinned && bankedXp > 0` para mejoras. La suite está alineada con el comportamiento actual sin debilitar esos contratos.



## v16.6dh · Suite por capas + deployment directo

- Frontend se divide en **smoke / unit / contract**, tres grupos disjuntos: `npm test` los ejecuta en ese orden y ningún fichero se repite.
- Backend queda explícitamente dividido en **smoke (motor/IA)** e **integration/API**.
- CI deja de ejecutar un gate crítico y después volver a ejecutar esos mismos tests dentro de la suite completa.
- Se retiran tres pruebas históricas redundantes: `combatFreeze.test.js`, `releaseContinuity.test.js` y `combatRegressionContract.test.js`.
- El meta-auditor comprueba que cada test frontend pertenece exactamente a una capa.
- Mesa de Guerra: doble clic en una unidad del banquillo la envía al **primer slot compatible libre** en orden canónico; nunca expulsa otra unidad automáticamente.
- `Board.jsx` elimina los atributos JSX duplicados `draggable`, `onDragStart` y `onDragEnd` que advertía Vite.
- Guía actual de tests: `docs/TESTING.md`.

## v16.6di · Combat Chess más legible

- La campaña muestra sólo sector, créditos y bajas en primer plano; el resto del estado del ejército queda plegado.
- El primer sector usa material estándar para introducir la campaña sin una asimetría inmediata.
- Cualquier modificador que cambie el material enemigo se anuncia siempre antes de combatir, incluso sin comprar inteligencia.
- La inteligencia compra precisión sobre amenaza y dificultad; no oculta reglas visibles del tablero.
- Preparación y briefing reducen métricas simultáneas y enfatizan una sola acción siguiente.

## v16.6dj · Home simple + feedback operativo

- La home de Combat Chess · Campaña prioriza una sola acción: iniciar la operación. Ejército, expediente, reglas y archivo quedan plegados hasta que el jugador los pida.
- El contador `X usuarios online` vuelve a abrir el Panel de admin para usuarios administradores; queda blindado por contrato estático.
- La Home incorpora un botón flotante `Dar feedback` con formulario mínimo. El feedback se guarda autenticado en backend/Mongo y llega a todos los admins.
- Admin incorpora bandeja de feedback con contador de nuevos y estados `Nuevo`, `Leído` y `Resuelto`.
- Deployment marca con `+` las unidades que realmente pueden comprar al menos una mejora con su XP actual.
- La ficha de unidad se cierra con ESC o clic central; los rótulos de estadísticas ganan algo de aire tipográfico.

## v16.6dk · Combat Chess más amigable

Combat Chess usa ahora divulgación progresiva: home, mapa, briefing y preparación enseñan sólo la siguiente decisión necesaria. Progreso, intel avanzada, expediente, reliquias y ajustes siguen disponibles, pero detrás de secciones secundarias. La preparación añade `Usar formación recomendada` para reducir fricción a jugadores nuevos.

## v16.6dl · UX global más amable

La divulgación progresiva usada en Combat Chess se extiende al resto de la aplicación: Home, Partida rápida, Torneo, Espectador, Rival Fantasma, Laboratorio, Puzzles, Así juegas e Historial. La acción principal queda visible y la configuración/analítica avanzada pasa a desplegables, sin eliminar funcionalidad.



### v16.6dm34a · Hotfix test de acciones del roster

- Corrige el test extraído de `combatRosterActions`: un roster recién reseteado crea identidades persistentes, pero no entradas de progreso en `pieces` hasta que una unidad tiene estado guardado.
- El test ahora prepara explícitamente una pieza activa y valida el rename donde realmente vive el alias: `identities[key]`.
- Sin cambios de lógica productiva ni balance de Combat Chess.

### v16.6dm34 · Mantenibilidad Combat + ajustes globales + observabilidad operativa

- `useCombatController.js` baja de más de 1.100 líneas a ~1.040 al extraer helpers de batalla/snapshot y todas las mutaciones del roster/deployment a módulos testeables (`combatControllerSupport.js` y `combatRosterActions.js`).
- El contrato de salida distingue explícitamente abandono voluntario (`forfeit`) de una pestaña/recarga con sesión recuperable (`resume`): cancelar una partida competitiva iniciada sigue penalizando, mientras un recovery no se convierte en rendición.
- Admin añade **Reanalizar jugador**: endpoint exclusivamente admin que fuerza una lectura de `player_portrait` con Workers AI sin consumir el cooldown del jugador y sin enviar su username al modelo.
- Observabilidad incorpora rangos cortos **15 min / 1 h / 2 h / 6 h**. Desde dm34 las muestras nuevas se guardan en buckets de 5 minutos; el backend sigue leyendo el histórico horario legado para no perder datos previos.
- El retrato AI endurece el prompt de la tercera frase y amplía el reconocimiento de recomendaciones accionables para reducir falsos `portrait_contract_rejected:missing_action` sin aflojar grounding ni el contrato de tres frases.
- Una **gear global** en la cabecera abre Ajustes desde cualquier vista autenticada. Centraliza reloj por defecto, música/SFX/volumen e infraestructura de idioma; las preferencias se sincronizan con el perfil mediante `safeStorage`.
- Se conserva el balance Combat 50–90% de dm33a y el CTA de Observabilidad centrado.

### v16.6dm33 · Hardening de mantenimiento + suelo justo en Combat

- Combat Chess fija un suelo de **50% de acierto** para cualquier captura probabilística normal; los aciertos forzados por rey/mate siguen al 100% y el techo normal continúa en 90%.
- `make doctor` valida sin instalar nada el runtime local (Python/Node/npm), release markers, lockfiles y wiring de CI; dependencias locales y Docker se reportan como WARN si faltan.
- Observabilidad marca explícitamente las muestras pequeñas para que percentiles y SRE AI no parezcan conclusiones sólidas con tres requests. El dossier AI recibe esa calidad de muestra.
- Los gráficos de latencia API incorporan referencias discretas a 300 ms (sano) y 750 ms (vigilar), además de los ejes, tooltips y selector p50/p95/p99 ya existentes.
- No hay cambios de API ni nuevas métricas sensibles.

### v16.6dm28

- Observabilidad histórica: Admin permite consultar 24 h, 7 d, 30 d o fechas concretas; los agregados horarios se persisten en Mongo sin guardar usuarios, FEN, prompts, mensajes ni bodies. Para rangos largos la serie se agrupa por día.
- Workers AI deja trazas operativas útiles en Render: éxito (`workers_ai_ok`), fallback (`workers_ai_fallback`) y 429 propios (`narrative_429`) con tipo de evento, modelo/canal, latencia, motivo y estado del circuito, pero sin identidad ni contenido del usuario. El Worker de Cloudflare registra además errores del binding y respuestas vacías.
- Compatibilidad Qwen3: el Worker acepta tanto respuestas `{ response }` como `choices[0].message.content`, evitando falsos fallbacks al usar `@cf/qwen/qwen3-30b-a3b-fp8`. Retratos y comentarios tienen rate-limit y circuit breaker separados.
- El cooldown manual de “Así te ve la CPU” sólo se consume tras una respuesta Cloudflare válida; un fallback no castiga al usuario seis horas.
- El reproductor retro queda bloqueado en modo expandido mientras hay un tablero activo, tanto en partidas normales/torneo como en Combat Chess. Fuera del tablero puede seguir plegándose.
- Repaso de deuda técnica: persistencia productiva migrada a `safeStorage`, contrato que impide reintroducir Web Storage directo, eliminación conservadora de exports/helpers muertos y limpieza de tests que sólo cubrían código retirado.

### v16.6dm27
- Workers AI usa routing por tarea: comentarios en Llama 3.2 3B y “Así te ve la CPU” en Qwen3 30B-A3B FP8.
- El frontend detecta releases nuevas mediante `release.json` sin caché y avisa al usuario; nunca ofrece recarga durante una partida activa.
- El gate de release valida `APP_RELEASE`, `RELEASE.txt` y `frontend/public/release.json` en conjunto.

### v16.6dm34b · Hotfix contrato HomePlayNudge

- Extrae la política de habilitación del nudge de Home a `homePlayNudgePolicy.js`.
- El contract test deja de depender de una expresión JSX literal y la regla se cubre con unit test de comportamiento.
- Sin cambios funcionales en la invitación por inactividad.

### v16.6dm34c · Health contract compartido y auditoría de tests frágiles

- El deploy de Cloudflare Workers AI deja de duplicar una expresión Python inline para validar `/health`: workflow y preflight reutilizan `scripts/cloudflare_health_contract.py`, que exige los tres routings reales (`comments`, `player_portrait`, `analysis`). Esto elimina falsos negativos por espacios, comillas o reescrituras equivalentes del YAML sin aflojar el contrato live.
- El preflight se autocontrola con un payload válido y otro sin `analysis`, de forma que no puede dejar de exigir accidentalmente ese routing.
- La cadencia de presencia/admin queda centralizada en `presenceCadence.js` y cubierta por un unit test, retirando otra comprobación de una constante literal dentro de JSX/implementación.
- Nueva auditoría informativa `make static-contract-risk-audit`: inventaría los tests que leen source text y señala candidatos acoplados a implementación (`const`, setters, handlers JSX, imports/lazy, `indexOf`, etc.). No bloquea CI todavía; sirve para reducir la deuda de forma incremental en lugar de reemplazar una cadena frágil por otra.
