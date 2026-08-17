# Estudio de Ajedrez

**Resumen rápido**: app de ajedrez full-stack (React + FastAPI, motor de
IA propio con minimax) con seis modos de juego, progresión persistente,
y un sistema de "pista inversa" que te dice dónde te equivocaste en
cualquier partida ya jugada.

Juego de ajedrez contra una CPU propia (front + back separados), con seis
modos distintos — partida rápida, torneo con progresión, práctica con
pistas gratis, tutorial interactivo, puzzles, y un Modo Combate con RPG por
encima de las reglas de ajedrez normales —, rating tipo ELO con gráfico de
evolución, logros, y un historial de partidas con "pista inversa": revive
cualquier partida jugada por jugada y te muestra dónde el motor hubiera
preferido mover en vez de lo que jugaste.

## Documentos aparte

Estas cuatro cosas tienen bastante miga, asi que se han separado en ficheros. 

| Documento | De qué trata |
|---|---|
| [`docs/pixel-art-pieces.md`](./docs/pixel-art-pieces.md) | Las 12 piezas del tablero — qué se probó de terceros y se descartó (con motivo), y el proceso de diseño propio pieza por pieza |
| [`docs/ambient-music.md`](./docs/ambient-music.md) | La música de cuatro capas del menú — cada iteración real, con lo que sonaba mal y cómo se corrigió |
| [`docs/3d-experiment.md`](./docs/3d-experiment.md) | El experimento 3D jugable — qué hace, qué tan aislado está del resto, y el límite honesto que sigue vigente |
| [`docs/headless-3d-rendering.md`](./docs/headless-3d-rendering.md) | Cómo se armó un pipeline para *ver* el arte generado (pixel art y piezas 3D) sin tener navegador disponible |

## Estructura

```
chess-game/
├── backend-python/     API en Python/FastAPI + chess (reglas) + IA propia (minimax)
└── frontend/           App en React (Vite)
```

## Cómo correrlo con Make (más rápido)

Si tienes `make` instalado, es un atajo sobre Docker Compose:

```bash
make game      # construye y levanta backend + frontend (primer plano)
make ungame    # para y elimina los contenedores
```

Otros comandos: `make game-bg` (en segundo plano), `make logs`, `make status`,
`make restart`, `make clean` (borra también las imágenes). `make help` los lista todos.

## Cómo correrlo con Docker Compose directamente

Necesitas Docker y Docker Compose (v2, el que viene integrado como `docker compose`).

```bash
docker compose up --build
```

Eso levanta dos contenedores:

- **backend**: Python/FastAPI en el puerto `4000`
- **frontend**: el build de producción de Vite servido por Nginx, en el puerto `5173`

Abre `http://localhost:5173`. El frontend ya sabe hablarle al backend en
`http://localhost:4000/api` (se resuelve en tiempo de build, ver
`frontend/Dockerfile`). Con el backend corriendo, `http://localhost:4000/docs`
tiene la documentación interactiva de la API (generada sola por FastAPI).

Si esos puertos ya los usa algo más en tu máquina, cámbialos así:

```bash
BACKEND_PORT=4001 FRONTEND_PORT=5174 docker compose up --build
```

Para bajar todo: `docker compose down`.

### Tests del backend

```bash
cd backend-python
pip install -r requirements-dev.txt
pytest -v
```

29 tests: el motor de IA (`test_chess_ai.py` — evaluación, minimax, niveles
de dificultad) y los endpoints de la API (`test_main.py` — crear/jugar/
deshacer/analizar partidas, incluidos casos límite como coronación, enroque,
y que la CPU no responda después de un jaque mate).

## Cómo funciona

### Partida rápida contra la CPU

- **Juegas siempre con blancas**, la CPU responde con negras (salvo en
  Torneo y Combate, donde puedes elegir color o dejarlo al azar).
  
- Al crear una partida eliges la dificultad con un **slider de 0 a 100**:
  0 es casi aleatorio, 100 juega lo mejor que el motor puede dar en el tiempo
  que se le permite. Por debajo, combina profundidad de búsqueda (minimax con
  poda alfa-beta), algo de azar y "ruido" en la evaluación para que la
  dificultad suba de forma gradual y no a saltos bruscos.
  
- El tablero resalta las jugadas legales de la pieza seleccionada, anima el
  movimiento (el tuyo al instante, el de la CPU en cuanto responde), marca
  con un destello las capturas (con partículas pixeladas de impacto), y
  avisa con un mensaje breve cuando la CPU ya jugó y te toca a ti.
- El cuaderno de jugadas reconoce **aperturas conocidas** (Siciliana,
  Española, Gambito de Dama, y otras tantas más) a partir de la secuencia
  jugada — no es una base ECO completa, es un puñado de aperturas clásicas
  verificadas jugada por jugada con chess.js antes de sumarlas a la tabla
  (`openings.js`). Funciona en partida normal, replay, espectador, y
  batallas de combate (ahí de forma aproximada: el registro de combate solo
  guarda los ataques que conectaron, así que un fallo bien al principio
  puede hacer que no reconozca nada — no revienta, simplemente no muestra
  etiqueta).
  
- **Piezas**: set medieval en pixel art, diseño propio (32×40, PNG con
  contorno automático).
  
- **Música ambiental**: cuatro capas sintetizadas (sin archivos de
  audio) — pad, punteo de laúd/guitarra, saxofón con vibrato real, y
  percusión de 16 pasos estilo breakbeat con cuerpo tonal real en el
  bombo. Arranca una sola vez al cargar la app (`App.jsx`, no atada al
  ciclo de vida de ninguna pantalla en particular) y sigue sonando en
  cualquier vista — antes paraba al salir del menú a propósito ("no
  competir con los efectos de sonido de una partida"), decisión que se
  revirtió: ahora solo se calla con el botón de mute explícito, en
  cualquier pantalla. Historia de cada iteración (qué sonaba mal y cómo
  se corrigió) en [`docs/ambient-music.md`](./docs/ambient-music.md).

  Tiene un rollo peli de terror que honestamente le pega muy bien al juego. JAJA
  
- **La CPU habla** (`voiceCommentary.js`, botón junto al indicador de
  estado en Partida): `SpeechSynthesisUtterance` nativa del navegador,
  sin librerías ni archivos de audio — capturas, jaque y jaque mate, con
  varias frases por evento elegidas al azar. Apagado por defecto
  (opt-in). Detalle técnico en
  [`docs/ambient-music.md`](./docs/ambient-music.md) (comparte
  documento con la música porque ambos son "audio generado en el
  navegador sin archivos externos", aunque usan APIs distintas).
  
- **"Partida de práctica"** (menú) es una partida normal contra la CPU, sin
  torneo ni puntos, con pistas del motor gratis e ilimitadas para estudiar
  tranquilo.
  
- **"Aprendizaje"** (menú) es el tutorial: diez lecciones interactivas, una
  por cada pieza más enroque y jaque mate, con un mini-tablero de práctica
  libre en cada una.
  
- **"Aperturas famosas"** (menú, pantalla propia) — antes vivían enterradas
  como lecciones 11-16 dentro del Tutorial lineal, donde nadie las
  encontraba; ahora tienen su propia tarjeta y pantalla. Dieciocho
  aperturas (Española, Italiana, Siciliana/Najdorf, Gambito de Dama, India
  de Rey, Caro-Kann, Grünfeld, Inglesa, Escocesa, Francesa, Alekhine,
  Escandinava, Nimzoindia, Gambito de Rey, Pirc, Holandesa, Cuatro
  Caballos, Réti) en un modo paso a paso: recorres la secuencia real jugada por
  jugada con comentario en cada una, reconstruida con chess.js (no guardada a
  mano posición por posición). Reusa las mismas secuencias ya
  verificadas de `openings.js` (detección de aperturas en el cuaderno de
  jugadas), no son datos nuevos sin chequear
  
- **Puzzle** (menú) da posiciones cortas para resolver — mate en 1, mate en
  2, o encontrar la jugada que gana material — con feedback inmediato y
  revelar solución si te bloqueas.
  
- **Espectador** (menú) hace jugar a dos CPU entre sí — elige el nivel de
  cada bando (o déjalo al azar) y mira la partida con pausas configurables
  entre jugada y jugada, con sonido de jugada/captura y el chime de éxito
  al llegar a jaque mate. No queda en tu historial (no jugaste tú), pero
  puedes pausarla y reanudarla mientras se juega.

### Torneo

Botón "Torneo": una progresión persistente. Empiezas en el nivel 1 con 0
puntos. Ganar suma 20 puntos, las tablas 5, perder no resta nada (siempre
puedes reintentar). **Cada captura también da puntos**: el valor de la
pieza capturada (peón 1, caballo/alfil 3, torre 5, dama 9), con un bono
extra si capturas con una pieza de menor valor que la capturada, y todo
multiplicado según tu nivel actual. Cada 50 puntos subes de nivel, y la
dificultad de la CPU sube contigo — con raíz cuadrada, no lineal
(`13 × √(nivel-1)`, tope en 100), para que la progresión dure.

**Recompensas cosméticas por nivel** (`tournamentRewards.js`, elegibles
desde la propia pantalla de Torneo) — títulos junto al nombre de nivel, y
skins de color alternativas para las piezas (Azulado en nivel 10,
Esmeralda en nivel 25). Se desbloquean solas al subir de nivel, sin
gastar puntos — mismo criterio que la dificultad de CPU, "jugar más te da
más". 

**Puzzle ahora lleva una racha** (`puzzleStats.js`) — resolver a la
primera, sin ningún fallo, la sube; un fallo normalmente la rompe. Se
puede **pagar en puntos de torneo** (`puzzleRetryCost`, mismo criterio que
`hintCost`: base fija + más caro cuanto más larga la racha que se
protege) para que un fallo puntual no la rompa — solo se ofrece en el
primer fallo de cada intento, y solo si hay una racha real para proteger.
Rendirse con "Ver solución" también rompe la racha, igual que un fallo sin
proteger.

### Hándicap dinámico según tu rating

En Partida rápida (y Partida de práctica, que comparte configuración), la
CPU puede arrancar sin una pieza — convención clásica de ajedrez
("odds": pawn/knight/rook/queen odds, con siglos de uso), no un sistema
inventado. `handicap.js` calcula la brecha entre tu rating actual y la
dificultad que elegiste (reusando `difficultyForRating`, que ya existía
para Combate) — si la dificultad elegida es mucho más dura de lo que tu
rating sugeriría como "parejo", la CPU pierde una pieza: peón, caballo,
torre, o la dama en el caso más extremo, según qué tan grande sea la
brecha. Se calcula solo (nada que activar a mano) y se avisa en el modal
antes de arrancar la partida.

Aplicado en el backend, no simulado en el cliente — `NewGameRequest`
acepta un `handicap` opcional, y `apply_handicap()` saca la pieza
correspondiente del lado de la CPU nada más (el humano siempre tiene las
16 piezas completas) antes de que arranque la partida. 

### Modo Combate

Botón "Combate": ajedrez normal, con una vuelta de tuerca. Cuando intentas 
capturar una pieza, primero ves el % de acierto (según fuerza/velocidad de 
ambas piezas) y confirmas si te compensa el riesgo. Si falla, tu pieza esquivó —
pierdes el turno, pero no pasa nada más grave, y la pieza que esquivó gana
algo de XP por sobrevivir. Capturar también otorga XP, que se gasta en fuerza
o velocidad (automático o a mano). 

Atacar sin haberte movido de tu casilla de partida da un bono ("en reserva"), 
y seguir atacando al mismo objetivo varias veces seguidas también suma.
El **rey nunca esquiva ni banca XP** — sigue jaque y jaque mate estándar, 
sin excepciones. Las piezas que lleguen vivas al final de la batalla guardan 
su progreso para la próxima; las que caigan tienen una única ventana para revivirlas
(con "XP de combate", una moneda aparte que se gana al terminar cada batalla) 
antes de perderse para siempre.

### Rating y logros

Un rating tipo ELO ("cómo te ve la CPU", en la cabecera) sube o baja
según tus resultados en Torneo y partidas normales sin "Partida de
práctica" (ahí las pistas gratis distorsionarían la medición). Combate
queda afuera a propósito: el resultado depende bastante del dado de las
capturas, no es una señal limpia de nivel de ajedrez — para eso está la
"pista inversa" del historial de combate, que mide la decisión sin el
factor azar.

La relación funciona en un solo sentido, no es contradictoria:
Combate no **aporta** al rating, pero sí lo **consume** — la dificultad de
la CPU en Combate ya no se elige con un slider a mano, se calcula sola
según tu rating actual (`difficultyForRating` en `playerRating.js`, lineal:
tope en 100 alrededor de rating 2000).

El rating en sí sigue viniendo de otro lado (Torneo + partidas normales), 
Combate solo lo lee, nunca lo escribe.

Haz clic en el chip para ver el detalle: tu categoría actual, cuánto falta para 
la siguiente, y un **gráfico de evolución** — se graba una foto del rating cada vez
que cambia, así que empieza vacío y se va llenando con el uso, no reconstruye partidas 
de antes de este cambio.

Hay 14 logros repartidos por todos los modos, visibles desde "Ver logros"
en el menú.

### Historial y "pista inversa"

Todas las partidas terminadas (Torneo, Práctica, Partida rápida, y Combate
por separado) quedan guardadas y son reproducibles jugada por jugada. Al
abrir una, se analiza automáticamente comparando cada jugada tuya contra lo
que el motor hubiera preferido en ese momento — el cuaderno de jugadas se
colorea por severidad (imprecisión / error / error grave), y al pararte en
una jugada mala se dibuja en el tablero, con el mismo recuadro punteado azul
que una pista normal, cuál hubiera sido la mejor. Es literalmente eso: una
pista, pero mirando para atrás. En Combate, solo se analizan los ataques que
**conectaron** — la calidad de la decisión de ajedrez, no si el dado
acompañó. Un panel lateral con tus 3 peores jugadas de la partida (con
salto directo a cada una) evita tener que revisar el cuaderno entero a
mano.

### "Así juegas" (estadísticas agregadas)

Un resumen de tu historial completo: porcentaje de victorias (global y por
modo), tu apertura más jugada, preferencia de color, racha de victorias
más larga, piezas capturadas, y evolución del rating. Todo calculado al
instante con lo que ya está guardado — a propósito NO vuelve a analizar
cada partida contra el motor (`insights.js`), porque eso significaría
decenas de llamadas al backend y la pantalla tardando varios segundos en
abrir en vez de sentirse instantánea.

Para eso está el botón aparte **"Buscar mi peor jugada de siempre"**: la
excepción cara, a demanda — recorre todo el historial (normal y de
combate juntos) analizando partida por partida contra el motor, avisando
progreso y permitiendo cancelar en cualquier momento sin perder lo ya
encontrado (`findWorstMoveEver` en `gameReport.js`). Al terminar, un botón
lleva directo a esa jugada exacta en el replay correspondiente.

**Cachea el resultado por partida, no reanaliza nunca dos veces**
(`worstMoveCache.js`) — una partida terminada no cambia jamás, así que
analizarla una vez ya basta. Cada búsqueda solo ataca al
backend por las partidas que todavía no tienen entrada en el caché;
las demás se resuelven leyendo el resultado guardado, sin ninguna
llamada nueva. El caché vive en `localStorage` y se sincroniza a Mongo
con el mismo mecanismo del resto del perfil (`profileBackup.js`,
`EXPORTABLE_KEYS`) — no hace falta ningún endpoint nuevo en el backend.

También hay un resumen con sarcasmo ("Cómo te ve, sin filtro") — mismo
criterio de costo cero: se arma con los datos que insights.js ya calcula
gratis (racha, color, capturas, repetición de apertura), sin analizar nada
de nuevo. Si ya corriste "Buscar mi peor jugada de siempre" antes, se le
suma un zasca puntual sobre esa jugada específica (`generateRoast` en
`insights.js`).

### Experimento 3D (jugable de verdad)

Enlace en el footer del menú, marcado explícitamente como experimental —
ajedrez real en 3D (raycasting para elegir piezas, CPU real vía
`/api/analyze`, cámara por botones), aislado del resto de la app (no
toca `Board.jsx`, `three` carga diferido vía `React.lazy`). Peón y
caballero tienen diseño temático de "soldado medieval"; el resto de las
piezas sigue en geometría simple. 

### Progreso, sincronización y accesos

**Tu progreso** (torneo, ejército de combate, rating, logros, historial de
partidas) vive en `localStorage` del navegador, pero también se sincroniza
con el backend: al arrancar la app, baja lo último que haya guardado en
Mongo para tu cuenta; después, en cada cambio de pantalla, sube lo que
tengas local. Así el progreso sobrevive aunque limpies el navegador, 
siempre que inicies sesión con la misma cuenta
(ver [Perfiles de usuario](#perfiles-de-usuario-segundo-paso-del-mismo-tema)
más abajo.

**Empezar de cero**: el mismo modal tiene un botón para borrar todo tu
progreso local (`resetProgress.js`) — junta 9 resets/borrados que ya
existían sueltos por distintos módulos (torneo, historial de partidas e
historial de combate, ejército, rating + su historial, logros, todas las
estadísticas de puzzle, el caché de peor jugada, y la skin/título
elegidos) en una sola acción, con confirmación de dos pasos porque es
irreversible. A propósito **no** toca la sesión de login ni las
preferencias de mute/voz — eso no es "progreso de juego", es configuración
de la cuenta/UI. 

**ESC** cierra cualquier modal o te devuelve al menú desde cualquier
pantalla — salvo en medio de una partida o una batalla de Combate en
curso, donde un ESC accidental no debería hacerte perder progreso sin
avisar.

GitHub Pages solo sirve archivos estáticos, así que el reparto queda así:
**frontend en GitHub Pages** (es justo lo que produce `vite build`) y
**backend en un hosting de verdad** (necesita ejecutar el motor de IA y
hablar con MongoDB, algo que Pages no puede hacer).

### 1. Backend en Render (gratis)

1. Conecta a [render.com](https://render.com) y conecta tu cuenta de GitHub.
2. **New → Blueprint**, elige este repo. Render detecta `render.yaml` solo
   y arma el servicio a partir de `backend-python/Dockerfile` (multistage:
   una etapa instala las dependencias en un venv, la imagen final solo
   copia ese venv ya armado — más liviana, sin pip ni caché de descargas
   dando vueltas).
3. Te va a pedir cargar `MONGO_URL` a mano (queda como secreto, no vive en
   el repo). Para conseguirla:
   1. Crea una cuenta gratis en
      [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) y arma
      un cluster **M0** (el nivel gratis para siempre, no una prueba con
      vencimiento).
   2. **Database Access** → crea un usuario con contraseña (la vas a
      necesitar en el siguiente paso).
   3. **Network Access** → agrega `0.0.0.0/0` (cualquier IP) — el hosting
      gratuito no tiene una IP fija conocida de antemano, así que
      restringir por IP no funciona acá.
   4. **Connect → Drivers** → copia la connection string (algo como
      `mongodb+srv://usuario:contraseña@cluster0.xxxxx.mongodb.net/`, con
      la contraseña real, no un placeholder) y pégala como `MONGO_URL` en
      Render.
4. Cuando termine el deploy, Render te da una URL tipo
   `https://chess-study-backend.onrender.com`. Cópiala.
5. Confirma que arrancó bien: abre `https://tu-url.onrender.com/api/health`
   en el navegador — si ves `{"ok":true}`, está vivo. Si no responde,
   revisa los logs del servicio en el dashboard de Render (la causa más
   común es un `MONGO_URL` mal copiado).

> El plan free de Render "duerme" el servicio tras **15 minutos sin
> tráfico** — la primera visita después de estar dormido tarda **30-60
> segundos** en responder mientras arranca de nuevo. Es normal, no es que
> se rompió. Si te molesta para hacer demos, algo simple como un ping cada
> 10-14 minutos (un cron externo gratis, o incluso un "recordatorio"
> programado a mano) lo mantiene despierto — pero no hace falta para uso
> normal.

### 2. Frontend en GitHub Pages

1. En el repo de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**, agrega una
   variable `VITE_API_URL` con el valor `https://tu-backend.onrender.com/api`
   (la URL de Render del paso anterior, con `/api` al final).
3. Haz push a `main`. El workflow `.github/workflows/deploy-pages.yml` se
   encarga solo: compila el frontend con la URL del backend ya metida
   adentro, y calcula el `base` path correcto según el nombre del repo
   (no hay que tocar nada a mano ahí).
4. Al toque de un par de minutos, el sitio queda en
   `https://tu-usuario.github.io/nombre-del-repo/`.

Las partidas activas ("savegames") se guardan en **MongoDB**, no en memoria:
si reinicias el backend o el container, "continuar partida" sigue
funcionando — el navegador solo recuerda el `id` de la partida en
`localStorage`, el estado real vive en la base de datos.

- Se guarda la **lista de jugadas** (notación SAN), no el FEN ni un objeto
  de `chess.js`: el FEN por sí solo no alcanza para reconstruir el
  historial completo (solo describe la posición actual), así que cada
  request reproduce las jugadas guardadas para levantar el tablero entero,
  incluido el deshacer.
- Si Mongo no está disponible (por ejemplo corriendo `uvicorn main:app` a
  pelo, sin Docker Compose), el backend **cae automáticamente a un diccionario
  en memoria** (`backend-python/game_store.py` + `backend-python/db.py`) y
  avisa por consola — así el desarrollo local sigue funcionando igual que
  antes, sin necesidad de tener Mongo instalado a mano.
- El **torneo y el historial de partidas jugadas** (puntos, nivel, racha,
  partidas para reproducir) siguen viviendo en `localStorage` del
  navegador — es información ligada a ti como jugador en este navegador,
  no a una partida puntual, así que no hacía falta moverla a la base de
  datos en esta etapa.

## Tests del frontend

```bash
cd frontend
npm test          # corre toda la suite una vez
npm run test:watch # modo watch, para ir desarrollando
```

12 archivos de test: motor de Combate (`combat.js`, `combatRoster.js`),
análisis de partidas y "pista inversa" (`gameReport.js`), rating (`playerRating.js`),
logros, torneo, reloj, PGN, puzzles, y sincronización de perfil
(`profileBackup.js`). El más denso es `combat.js` — es la parte más delicada
del proyecto, con varios bugs sutiles que se encontraron y arreglaron sobre
la marcha (captura al paso, enroque, jaque forzado, ahogado
fantasma por esquives fallidos...). Los tests son justamente esos mismos
casos, convertidos en algo que se corre solo en vez de depender de acordarse
de probarlos a mano cada vez que se toca la fórmula de combate.

## CI/CD

`.github/workflows/ci.yml` corre toda la suite (frontend y backend, en
paralelo) en cada push a cualquier rama y en cada pull request — 251 tests
en total (204 frontend + 55 backend). Sin esto, "tener tests" no protege nada: nadie se entera de que
algo se rompió hasta que los corre a mano.

`.github/workflows/deploy-pages.yml` (el que publica el frontend en GitHub
Pages) corre los tests del frontend **antes** de compilar — si algo falla,
el deploy ni arranca. Los tests del backend no bloquean ese deploy en
particular porque el backend se publica aparte, en Render (ver "Desplegar
en producción" más abajo), pero sí los corre `ci.yml` en cada push igual.

## Créditos

Las 12 piezas actuales (`frontend/src/pieces-medieval/`) son diseño
propio, pixel art construido desde cero — ver
[`docs/pixel-art-pieces.md`](./docs/pixel-art-pieces.md) para la historia
completa.

## API del backend

`http://localhost:4000/docs` tiene la documentación interactiva completa
(generada sola por FastAPI, con los schemas exactos de cada request/response).
Resumen:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/games` | Crea partida. Body: `{ difficulty: 0-100, color: 'w'\|'b'\|'random' }` |
| GET | `/api/games/:id` | Estado actual de la partida |
| GET | `/api/games/:id/moves?square=e2` | Jugadas legales desde una casilla |
| GET | `/api/games/:id/hint` | Sugerencia del motor para tu próxima jugada |
| POST | `/api/games/:id/move` | Jugada del humano. Body: `{ from, to, promotion? }`. Responde ya con la jugada de la CPU aplicada |
| POST | `/api/games/:id/undo` | Deshace tu última jugada (y la respuesta de la CPU, si la hubo) |
| DELETE | `/api/games/:id` | Abandona/borra la partida |
| POST | `/api/analyze` | Mejor jugada para una posición suelta. Body: `{ fen, level? }` — no depende de una partida guardada |
| POST | `/api/analyze-move` | Compara una jugada jugada contra la mejor posible en esa posición — la base de la "pista inversa". Body: `{ fen, from?, to?, level? }` |
| GET | `/api/profile` | Perfil único guardado (torneo, ejército, rating, logros...) |
| PUT | `/api/profile` | Sobreescribe el perfil guardado — passthrough puro, la forma la define el frontend |
| GET | `/api/health` | Salud del servicio (usado por el healthcheck de Docker) |

### Rate limiting

Por IP, con [slowapi](https://github.com/laurentS/slowapi) — sin cuentas
de usuario todavía (ver más abajo), es la defensa principal contra que
alguien te deje el hosting sudando mandando cientos de requests por
segundo a un endpoint que corre minimax de verdad. **120 requests/minuto**
por defecto en toda la API;
`/api/analyze` (pistas, apertura de la CPU — tráfico bajo) se queda en
**60/minuto**; `/api/analyze-move` (el que más golpea "Buscar mi peor
jugada de siempre", que puede encadenar muchas partidas seguidas) subió a
**180/minuto** — 60 hacía que esa búsqueda tardara la vida. 

`/api/health` queda exento a propósito, para que el healthcheck de Docker
nunca se vea afectado. El frontend no necesitó ningún cambio — `api.js` ya
leía `body.error` de cualquier respuesta no exitosa, así que un 429
aparece como un mensaje de error legible en la interfaz existente, no como
un error crudo sin explicar.

### Auth M2M (primer paso de un tema más grande, pendiente)

Auth es un tema pendiente real — tanto para tráfico M2M como para humanos
(perfiles por usuario, storage por usuario, authz/authn de verdad). Se
decidió a propósito **no** encararlo entero de una — es un cambio de
arquitectura grande (cada colección de Mongo necesita un `user_id`, cada
query necesita filtrar por owner, hay que decidir qué pasa con el perfil
único actual) que merece pensarse aparte, no picarse de golpe. Lo que sí
se hizo, como primer paso pequeño: **API keys estáticas para M2M nada más**,
sin login humano, sin base de datos de usuarios.

`M2M_API_KEYS` (variable de entorno, lista separada por comas) — si un
`X-API-Key` válido viaja en el header, `/api/analyze` y `/api/analyze-move`
suben de su límite público (60 y 180/minuto) a **1000/minuto**, con su
propio balde de cupo por key (no comparte cupo con el tráfico público de
la misma IP). Sin la variable configurada — el caso por defecto, incluido
en desarrollo local — ninguna key valida nunca: cero diferencia de
comportamiento respecto a como estaba antes. El frontend actual no manda
ningún header nuevo y no necesitó ningún cambio.

### Perfiles de usuario (segundo paso del mismo tema)

Cuentas de verdad para humanos, para poder compartir la app con conocidos
sin que todos pisen el mismo progreso. Usuario + contraseña nada más —
sin email, sin OAuth, la opción con menos piezas externas para "unos 
pocos conocidos" autohosteando esto.

Registro **abierto**: cualquiera con el link se crea
su cuenta sola (`POST /api/auth/register`).

**Backend**: `users_store.py` (mismo patrón Mongo + respaldo en memoria
que el resto), `auth.py` (contraseñas hasheadas con `bcrypt`, sesión con
JWT — 30 días, sin estado en el servidor: el username va firmado adentro
del token, no hace falta ir a la base de datos solo para autenticar cada
request). `GET/PUT /api/profile` ahora exige `Authorization: Bearer
<token>` y devuelve/guarda el perfil de **ese** usuario — antes era un
documento único fijo (`profile_store.py`), compartido por cualquiera que
corriera la app; ahora es un documento por usuario.

**Decisión de alcance**: por ahora solo `/api/profile` quedó protegido
por usuario — es donde vive "tu progreso" de verdad (torneo, rating,
logros, todo lo que sincroniza `profileBackup.js`). Los endpoints de
partidas (`/api/games/*`) siguen sin dueño explícito, protegidos nada más
por tener un UUID no adivinable — extender la propiedad hasta ahí es un
cambio más grande (cada endpoint de jugar/deshacer/pedir pista necesitaría
la dependencia de auth más una verificación de que la partida es tuya),
que se dejó fuera de este primer paso a propósito.

**Frontend**: `auth.js` (registro, login, logout, token en
`localStorage`), `LoginScreen.jsx` (formulario combinado de
login/registro), gate en `App.jsx` — sin sesión, no se ve la app en
absoluto, se pide loguearse antes de sincronizar nada. Verificado con un
test que es el punto central de todo este cambio: dos usuarios
(`Alice`/`Bob`) guardan datos distintos en `/api/profile` con sus
respectivos tokens, y cada uno solo puede leer el suyo.

