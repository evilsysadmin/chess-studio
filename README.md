# Estudio de Ajedrez

<!-- Cambia TU-USUARIO/TU-REPO por los reales una vez que publiques el repo -->
![CI](https://github.com/TU-USUARIO/TU-REPO/actions/workflows/ci.yml/badge.svg)

**Resumen rápido**: app de ajedrez full-stack (React + FastAPI, motor de
IA propio con minimax) con seis modos de juego, progresión persistente,
y un sistema de "pista inversa" que te dice dónde te equivocaste en
cualquier partida ya jugada. Pensada como proyecto de portfolio — este
README documenta también el proceso, no solo el resultado.

Juego de ajedrez contra una CPU propia (front + back separados), con seis
modos distintos — partida rápida, torneo con progresión, práctica con
pistas gratis, tutorial interactivo, puzzles, y un Modo Combate con RPG por
encima de las reglas de ajedrez normales —, rating tipo ELO con gráfico de
evolución, logros, y un historial de partidas con "pista inversa": revive
cualquier partida jugada por jugada y te muestra dónde el motor hubiera
preferido mover en vez de lo que jugaste.

## Documentos aparte (features con una historia larga detrás)

Estas cuatro cosas tuvieron bastante ida y vuelta — se separaron del
README principal para no ahogarlo, pero la historia completa (qué se
probó, qué falló, cómo se corrigió) queda documentada igual:

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

> **Nota de validación:** confirmé que `docker-compose.yml` parsea correctamente
> con `docker compose config` (sintaxis, healthcheck, dependencias entre
> servicios, todo bien formado), y probé cada endpoint del backend levantado
> directo con `uvicorn` (sin Docker) contra `curl` real. No pude completar un
> build de Docker de punta a punta en el entorno donde armé esto porque no
> tenía salida de red hacia Docker Hub para bajar las imágenes base
> (`python:3.12-slim`, `nginx:1.27-alpine`). Son imágenes oficiales estándar,
> así que debería construir sin sorpresas en tu máquina — si algo falla al
> correr `docker compose up --build`, avísame con el error y lo resolvemos.

## Cómo correrlo en local sin Docker

Necesitas Python 3.13+ y Node.js 18+ instalados. Son dos procesos separados
(backend y frontend).

**1. Backend**

```bash
cd backend-python
python3 -m venv .venv && source .venv/bin/activate   # opcional pero recomendado
pip install -r requirements.txt
uvicorn main:app --reload --port 4000                # arranca en http://localhost:4000
```

**2. Frontend** (en otra terminal)

```bash
cd frontend
npm install
npm run dev         # arranca en http://localhost:5173
```

Abre `http://localhost:5173` en el navegador. El frontend ya está configurado
para hablar con el backend en `http://localhost:4000/api` (se puede cambiar
con la variable de entorno `VITE_API_URL` si lo despliegas en otro lado).
`http://localhost:4000/docs` tiene la documentación interactiva de la API.

> Corriendo así (sin Docker Compose) no hay Mongo disponible, así que el
> backend guarda las partidas en memoria automáticamente — funciona igual,
> solo que las partidas no sobreviven a un reinicio. Si quieres persistencia
> real sin Docker, corre un Mongo aparte y exporta `MONGO_URL` antes de
> arrancar `uvicorn` (por defecto usa `mongodb://localhost:27017`).

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

### Partida contra la CPU

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
- **Navegable por teclado**: Tab entra al tablero en un solo paso (no 64),
  las flechas mueven el foco entre casillas respetando la orientación (si
  está girado para jugar con negras, las flechas se sienten "hacia arriba
  de la pantalla", no hacia una fila fija), Enter/Espacio elige la casilla
  enfocada, y la tecla **`i`** abre el detalle de la pieza (en Combate,
  donde existe esa función) — el mismo patrón de "roving tabindex" que
  usan las grillas accesibles de verdad.
- El cuaderno de jugadas reconoce **aperturas conocidas** (Siciliana,
  Española, Gambito de Dama, y otra veintena más) a partir de la secuencia
  jugada — no es una base ECO completa, es un puñado de aperturas clásicas
  verificadas jugada por jugada con chess.js antes de sumarlas a la tabla
  (`openings.js`). Funciona en partida normal, replay, espectador, y
  batallas de combate (ahí de forma aproximada: el registro de combate solo
  guarda los ataques que conectaron, así que un fallo bien al principio
  puede hacer que no reconozca nada — no revienta, simplemente no muestra
  etiqueta).
- **Piezas**: set medieval en pixel art, diseño propio (32×40, PNG con
  contorno automático, `image-rendering: pixelated`) — reemplazó al set
  "Cburnett" que usó el proyecto hasta cierto punto. Historia completa
  (qué se probó de terceros y se descartó, el proceso pieza por pieza)
  en [`docs/pixel-art-pieces.md`](./docs/pixel-art-pieces.md).
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
  Caballos, Réti) en un modo paso a
  paso: recorres la secuencia real jugada por jugada con comentario en
  cada una, reconstruida con chess.js (no guardada a mano posición por
  posición). Reusa las mismas secuencias ya
  verificadas de `openings.js` (detección de aperturas en el cuaderno de
  jugadas), no son datos nuevos sin chequear. Hasta esta ronda, "Así
  juegas" podía nombrarte una apertura (por ejemplo, Defensa Alekhine) que
  el detector reconocía pero que nunca tuvo lección propia — el detector
  siempre reconoció 26 aperturas distintas, y "Aperturas famosas" solo
  cubría 10 de esas 26. Se agregaron las 8 más notorias que faltaban
  (Alekhine, Escandinava, Nimzoindia, Gambito de Rey, Pirc, Holandesa,
  Cuatro Caballos, Réti) — quedan 8 más del detector sin lección propia
  (las variantes Dragón y Aceptado/Rehusado de aperturas que ya tienen
  lección, y algunas menos jugadas como el Ataque Colle), agregables de la
  misma forma si hace falta.
- **Puzzle** (menú) da posiciones cortas para resolver — mate en 1, mate en
  2, o encontrar la jugada que gana material — con feedback inmediato y
  revelar solución si te trabas.
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
(`13 × √(nivel-1)`, tope en 100), para que la progresión dure. La versión
original usaba `(nivel-1) × 8`, lineal, y llegaba al tope de dificultad
ya en el nivel 14 — a partir de ahí, toda "la progresión" restante del
torneo era jugar siempre contra la CPU al máximo, sin margen para seguir
subiendo la exigencia. Con la curva nueva el tope llega recién en el
nivel 60. A propósito **no** depende del rating ELO (que es de solo
lectura, ver más abajo) — atar ambos crearía una retroalimentación rara
entre dos sistemas de progresión distintos. Las **pistas** en el torneo
cuestan puntos — el precio sube con tu nivel y con cuántas pistas ya
pediste en esa misma partida, así que gastar de más puede incluso
bajarte de nivel.

**Feature "quick win" encontrada a medio construir**: `streakBonus`
(bono por capturas consecutivas dentro de la misma partida) ya existía y
estaba conectado — al revisar en busca de algo más para agregar rápido
se encontró que **no existía el equivalente para victorias** de torneo:
solo se guardaban totales (`wins`/`draws`/`losses`), sin racha de
victorias consecutivas. Se agregó `winStreak`/`bestWinStreak` a
`applyResult` — sube con cada victoria, se rompe con tablas o derrota, la
mejor marca nunca baja. Mismo patrón que la racha de puzzles: compatible
con estado guardado de antes de este cambio, sin migración (`state.winStreak || 0`).

**Recompensas cosméticas por nivel** (`tournamentRewards.js`, elegibles
desde la propia pantalla de Torneo) — títulos junto al nombre de nivel, y
skins de color alternativas para las piezas (Azulado en nivel 10,
Esmeralda en nivel 25). Se desbloquean solas al subir de nivel, sin
gastar puntos — mismo criterio que la dificultad de CPU, "jugar más te da
más". Generar las skins nuevas destapó **un bug real ya en producción**:
la corona del rey tenía un color hardcodeado en el script de diseño que
nunca pasaba por el recoloreo — ni siquiera en el skin clásico actual, que
mostraba un parche rojo suelto en la corona dorada. Corregido en el script
fuente y verificado programáticamente en las 3 skins (0 colores originales
sin recolorear en ninguna).

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
16 piezas completas) antes de que arranque la partida. Bug real
encontrado mientras se probaba: `load_board`/`board_sans` (las funciones
que reconstruyen el tablero desde el historial guardado) creaban un
`chess.Board()` limpio sin reaplicar el hándicap — sobrevivía a la
creación de la partida, pero se perdía al pedir el estado de nuevo
(`GET`) o al jugar una jugada, porque la reconstrucción partía de la
posición estándar completa. Corregido en los 4 puntos donde se
reconstruye el tablero; probado en vivo contra un servidor real antes de
escribir los tests (creación, `GET`, y después de jugar — la pieza
faltante se mantiene afuera en los tres casos).

### Modo Combate

Botón "Combate": ajedrez normal, con una vuelta. Cuando intentas capturar
una pieza, primero ves el % de acierto (según fuerza/velocidad de ambas
piezas) y confirmas si te compensa el riesgo. Si falla, tu pieza esquivó —
pierdes el turno, pero no pasa nada más grave, y la pieza que esquivó banca
algo de XP por sobrevivir. Capturar también banca XP. Atacar sin haberte
movido de tu casilla de partida da un bono ("en reserva"), y seguir
atacando al mismo objetivo varias veces seguidas también suma. El **rey
nunca esquiva ni banca XP** — sigue jaque y jaque mate estándar, sin
excepciones. Las piezas que lleguen vivas al final de la batalla guardan
su progreso para la próxima; las que caigan tienen una única ventana para
revivirlas (con "XP de combate", una moneda aparte que se gana al
terminar cada batalla) antes de perderse para siempre.

**La XP se gasta al terminar la batalla, no en caliente jugada a jugada**
— antes se podía gastar en cualquier momento a mitad de combate (automático,
apenas se juntaba lo necesario; o a mano, tocando dos veces cualquier
pieza propia), lo que permitía reaccionar en el momento subiendo justo la
pieza que más convenía en esa jugada puntual — menos justo que decidir
antes de saber cómo iba a salir el resto de la partida. Ahora la XP se
acumula durante toda la batalla sin gastarse, y se aplica de una sola vez
al final (`autoLevelUp` sobre todas tus piezas sobrevivientes, si el
auto-nivelado está activo) — la compra manual, mientras tanto, queda
bloqueada con un mensaje explicando por qué hasta que termina la batalla,
momento en el que se puede seguir gastando tocando dos veces cualquier
pieza en el tablero final.

### Combate Roguelike

Una escalera de rivales cada vez más raros (menú → "Combate Roguelike"),
en vez de niveles lineales. La dificultad del motor sigue subiendo piso a
piso (tope en 95, nunca 100 — siempre queda un margen mínimo de azar),
pero lo que le da el sabor roguelike de verdad es el **material extra**:
cada piso le suma a la CPU una pieza de más sobre el tablero inicial
estándar — caballo, alfil, torre, dama, o el doble de peones —, calculado
con `chess.js` (`.put()`) del lado del cliente, sin tocar el backend para
nada (Combate ya maneja su tablero 100% local). Pierdes o te retiras, la
corrida termina — tu mejor piso alcanzado queda guardado para siempre,
aunque la corrida en sí no llegue tan lejos la próxima vez.

Reutiliza `CombatScreen.jsx` entero (mismas reglas de esquive/dados/XP que
el Combate normal) — se le agregaron props opcionales (`initialFen`,
`forcedHumanColor`, `difficultyOverride`, `onBattleResult`) que no rompen
nada del modo Combate existente cuando no se pasan. `RoguelikeScreen.jsx`
es el orquestador: calcula el modificador del piso una sola vez por piso
(no en cada render, si no cambiaría el rival a mitad de la partida),
arma el FEN modificado, y decide qué pantalla mostrar entre batallas
(seguir, retirarse, o corrida terminada).

Mientras se armaba esto se encontró (y corrigió antes de entregarlo) el
mismo bug de sincronización que ya había aparecido 3 veces antes en esta
sesión: las dos claves nuevas de `localStorage` (`chess-study-roguelike-run`,
`chess-study-roguelike-best-floor`) no estaban ni en `EXPORTABLE_KEYS`
(no sincronizarían a Mongo) ni en `resetAllProgress` (el botón de
"empezar de cero" no las tocaría). Esta vez se revisó a propósito antes
de dar la feature por terminada, en vez de que alguien lo reportara
después.

### Rating y logros

Un rating tipo ELO ("cómo te ve la CPU", chip en la cabecera) sube o baja
según tus resultados en Torneo y partidas normales sin "Partida de
práctica" (ahí las pistas gratis distorsionarían la medición). Combate
queda afuera a propósito: el resultado depende bastante del dado de las
capturas, no es una señal limpia de nivel de ajedrez — para eso está la
"pista inversa" del historial de combate, que mide la decisión sin el
factor azar. La relación funciona en un solo sentido, no es contradictoria:
Combate no **aporta** al rating, pero sí lo **consume** — la dificultad de
la CPU en Combate ya no se elige con un slider a mano, se calcula sola
según tu rating actual (`difficultyForRating` en `playerRating.js`, lineal:
tope en 100 alrededor de rating 2000). El rating en sí sigue viniendo de otro
lado (Torneo + partidas normales), Combate solo lo lee, nunca lo escribe.
Haz clic en el chip para ver el detalle: tu categoría
actual, cuánto falta para la siguiente, y un **gráfico de evolución** — se
graba una foto del rating cada vez que cambia, así que empieza vacío y se
va llenando con el uso, no reconstruye partidas de antes de este cambio.
Hay 14 logros repartidos por todos los modos, visibles desde "Ver logros"
en el menú.

**Arranca en 400, no en 600 como antes** — y no por capricho: 400 ya era
el **piso** (`Math.max(400, ...)` en `updateRating`), así que arrancar
más arriba y no poder volver nunca a tu propio punto de partida no tenía
sentido. Se evaluó arrancar directamente en 0 (la sugerencia original),
pero la fórmula de ELO se degrada en los extremos — con rating 0 contra
cualquier rival con rating positivo, el resultado "esperado" da casi 0, así
que la primera victoria (contra cualquiera, hasta el rival más flojo) salta
casi al máximo posible, y las derrotas después casi no bajan nada (ya se
"esperaba" perder). Eso no es más informativo, es más errático. En cambio,
sí se sumó lo que de verdad resolvía el problema real (que la CPU no sabe
nada de un jugador nuevo): un **K-factor provisional**, mismo concepto que
usan FIDE/USCF con jugadores sin clasificar — el rating se mueve al doble
de rápido (`PROVISIONAL_K_FACTOR = 48` en vez de `K_FACTOR = 24`) durante
los primeros 12 partidos, y se estabiliza después. Un jugador bueno sube
rápido de entrada; uno que recién empieza de verdad no se desestabiliza
con cada resultado suelto una vez que ya jugó lo suficiente.

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

**Bug real reportado por el usuario**: el mensaje de jugada mala podía
salir con la jugada sugerida sin su letra de pieza — por ejemplo "h8-a8"
en vez de "Rh8-a8" — lo que hacía parecer que el motor recomendaba un
salto de rey imposible (7 casillas en línea recta) cuando en realidad era
una torre moviéndose por la última fila, una jugada perfectamente legal.
La causa real: `move_to_dict` (en `chess_ai.py`) sí calculaba el campo
`piece` para la jugada sugerida, pero `/api/analyze-move` lo descartaba
al armar la respuesta — solo reenviaba `from`/`to`/`san`. El frontend
nunca tuvo con qué mostrar la letra, y `formatLongMove` (que necesita
`.piece`, no `.san`, para el prefijo) se llamaba en 4 lugares distintos
pasándole el campo equivocado. Corregido en el origen (el backend ahora
incluye `piece` en la respuesta) y en los 4 lugares del frontend que
armaban el mensaje (`ReplayScreen.jsx`, `CombatReplayScreen.jsx`,
`WorstMovesPanel.jsx`, `InsightsScreen.jsx`) — con un test de regresión
que confirma que el campo viaja en la respuesta real del backend.

### Espejo de ti mismo

Una CPU calibrada a tu propio historial de errores, en vez de un nivel
fijo elegido a mano (menú → "Espejo de ti mismo"). Honesto sobre su
propio límite: **no** es un motor de reconocimiento de patrones — no
imita el *tipo* de error que cometes (piezas colgadas, mates de espalda,
lo que sea), sino qué tan seguido y qué tan grave. La única fuente de
datos persistente sobre tus propios errores que existe hasta ahora es el
caché de "Buscar mi peor jugada de siempre" (`worstMoveCache.js`) — se
junta el `worst.loss` de cada partida ya cacheada, se promedia, y ese
promedio calibra la dificultad de la CPU (`mirrorMode.js`): cuanto más
alta tu pérdida promedio, más floja la CPU — para que se equivoque de un
tamaño parecido, en vez de jugar perfecto contra alguien que reconoce
errores grandes. Hace falta un mínimo de 3 partidas ya analizadas para
calcular un perfil confiable — con menos, el modal lo dice claro en vez
de calibrar con un promedio poco confiable.

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
analizarla una vez alcanza para siempre. Cada búsqueda solo le pega al
backend por las partidas que todavía no tienen entrada en el caché;
las demás se resuelven leyendo el resultado guardado, sin ninguna
llamada nueva. El caché vive en `localStorage` y se sincroniza a Mongo
con el mismo mecanismo del resto del perfil (`profileBackup.js`,
`EXPORTABLE_KEYS`) — no hizo falta ningún endpoint nuevo en el backend.
Verificado con un caso real: 10 partidas dan 50 llamadas la primera vez,
**0** llamadas en una segunda búsqueda idéntica, y exactamente 5 (las de
la partida nueva nada más) al agregar una partida de más sin tocar las
10 anteriores. Se poda solo: una entrada del caché que ya no corresponde
a ninguna partida del historial actual (por ejemplo, empujada afuera por
el tope `MAX_RECORDS`) se descarta en la siguiente búsqueda, en vez de
quedar creciendo para siempre.

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
piezas sigue en geometría simple. Historia completa (qué hace, cómo se
verificó, y el límite honesto que sigue vigente para la escena
interactiva) en [`docs/3d-experiment.md`](./docs/3d-experiment.md).

### Progreso, sincronización y accesos

**Tu progreso** (torneo, ejército de combate, rating, logros, historial de
partidas) vive en `localStorage` del navegador, pero también se sincroniza
con el backend: al arrancar la app, baja lo último que haya guardado en
Mongo para tu cuenta; después, en cada cambio de pantalla, sube lo que
tengas local. Así el progreso sobrevive aunque limpies el navegador o
cambies de dispositivo, siempre que inicies sesión con la misma cuenta
(ver [Perfiles de usuario](#perfiles-de-usuario-segundo-paso-del-mismo-tema)
más abajo — esto era cierto solo para un perfil único fijo antes de esa
ronda; ahora cada cuenta tiene el suyo). Si el backend no está disponible,
la app sigue funcionando igual con lo que haya local — la sincronización
nunca bloquea. También puedes exportar/importar tu progreso a mano como un
archivo (menú → "Exportar / importar mi progreso"), por si prefieres no
depender del backend en absoluto.

**Empezar de cero**: el mismo modal tiene un botón para borrar todo tu
progreso local (`resetProgress.js`) — junta 9 resets/borrados que ya
existían sueltos por distintos módulos (torneo, historial de partidas e
historial de combate, ejército, rating + su historial, logros, todas las
estadísticas de puzzle, el caché de peor jugada, y la skin/título
elegidos) en una sola acción, con confirmación de dos pasos porque es
irreversible. A propósito **no** toca la sesión de login ni las
preferencias de mute/voz — eso no es "progreso de juego", es configuración
de la cuenta/UI. Verificado con un test que puebla las 13 claves de
progreso conocidas y confirma que todas quedan en `null` tras el reset, y
otro que confirma lo contrario para las 4 claves que a propósito no debe
tocar.

**Bug encontrado en `profileBackup.js`**: el **historial real de batallas
de Combate** (`chess-study-combat-history`) nunca estuvo en la lista de
claves sincronizadas — solo el roster/ejército (`chess-study-combat-roster`)
lo estaba. En la práctica, tus batallas de combate NO sobrevivían a un
cambio de dispositivo o una limpieza del navegador, aunque tu ejército sí.
Corregido, con el mismo patrón de test que ya había atrapado un bug
idéntico antes (logros y puzzles resueltos, faltantes en esa misma lista).

**El mismo bug, una tercera vez** — buscando un "quick win" se revisaron
todas las claves de `localStorage` que existen en el código contra la
lista de sincronización, y faltaban **5 más**: el historial de rating
(`chess-study-rating-history`, del que depende el gráfico de evolución),
la racha de puzzles y su mejor marca, y la skin/título elegidos en
Torneo — las últimas cuatro, features de esta misma sesión que se
armaron sin acordarse de sumarlas a la lista. Corregidas con el mismo
patrón de test otra vez. La lección real: cada vez que se agrega una
clave nueva de `localStorage`, hay que sumarla a `EXPORTABLE_KEYS` a
mano — no hay nada que lo haga automático, así que el olvido se va a
repetir si no se revisa a propósito.

**ESC** cierra cualquier modal o te devuelve al menú desde cualquier
pantalla — salvo en medio de una partida o una batalla de Combate en
curso, donde un ESC accidental no debería hacerte perder progreso sin
avisar.

## Desplegar en producción (GitHub Pages + backend aparte)

GitHub Pages solo sirve archivos estáticos, así que el reparto queda así:
**frontend en GitHub Pages** (es justo lo que produce `vite build`) y
**backend en un hosting de verdad** (necesita ejecutar el motor de IA y
hablar con MongoDB, algo que Pages no puede hacer).

### 1. Backend en Render (gratis)

1. Anda a [render.com](https://render.com) y conecta tu cuenta de GitHub.
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

**Bug real de despliegue, encontrado en producción**: conectar a Atlas
podía fallar con `SSL: TLSV1_ALERT_INTERNAL_ERROR` en los tres shards a
la vez — no es contraseña mal puesta ni IP sin whitelistear (esos dan
otro tipo de error). La causa real: `python:3.13-slim` (la imagen base
del `Dockerfile`) recorta `ca-certificates` para achicar la imagen — sin
eso, el contenedor no tiene ninguna autoridad certificadora raíz en la
que confiar, y no puede validar la cadena TLS de Atlas al conectarse.
Corregido agregando `ca-certificates` + `update-ca-certificates` a la
etapa final del `Dockerfile` (no a la de build, ahí no hace falta —
`pip install` contra PyPI usa certificados distintos y ya funcionaba
bien). Sin Mongo conectado, el backend cae en silencio al respaldo en
memoria (`db.py` lo avisa por log, no revienta) — lo que en la práctica
significa que **cualquier cuenta de usuario que se registre desaparece
en el próximo reinicio** del contenedor, sin ningún aviso visible desde
el frontend.
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

### Roadmap

Si en algún momento hace falta cuentas de usuario o sincronizar el
progreso entre dispositivos, ese sería el momento de mover también el
torneo/historial a la base de datos — las funciones `create_game / get_game /
update_game / delete_game` de `game_store.py` ya dejan aislado el patrón
para hacerlo sin tocar el resto del backend.

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
paralelo) en cada push a cualquier rama y en cada pull request — 281 tests
en total (226 frontend + 55 backend). Sin esto, "tener tests" no protege nada: nadie se entera de que
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
completa, incluidas las fuentes de terceros que se probaron y se
descartaron por licencia o estilo. El proyecto usó el set **"Cburnett"**
(Colin M. L. Burnett, adaptado por Thibault Duplessis para Lichess,
GPLv2+) hasta esa ronda — si en algún punto de tu propio fork vuelves a
usarlo, mantén ese crédito.

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
**180/minuto** — 60 hacía que esa búsqueda tardara la vida. Verificado en
vivo contra el servidor real, no solo leído en la documentación de la
librería: 190 requests seguidos a `/api/analyze-move` dan exactamente 180
`200` y 10 `429`.
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
se hizo, como primer paso chico: **API keys estáticas para M2M nada más**,
sin login humano, sin base de datos de usuarios.

`M2M_API_KEYS` (variable de entorno, lista separada por comas) — si un
`X-API-Key` válido viaja en el header, `/api/analyze` y `/api/analyze-move`
suben de su límite público (60 y 180/minuto) a **1000/minuto**, con su
propio balde de cupo por key (no comparte cupo con el tráfico público de
la misma IP). Sin la variable configurada — el caso por defecto, incluido
en desarrollo local — ninguna key valida nunca: cero diferencia de
comportamiento respecto a como estaba antes. El frontend actual no manda
ningún header nuevo y no necesitó ningún cambio.

Verificado en vivo contra un servidor real, los 4 casos: sin la variable
configurada, una key inventada no cambia nada (180 OK / 10 bloqueados,
igual que sin key). Con la variable configurada pero sin mandar ninguna
key, el tráfico público sigue en el límite estricto. Con una key **válida**,
500 requests seguidos dan 500 `200`, cero bloqueos. Con una key inválida
(no está en la lista), vuelve a quedar en el límite estricto — no alcanza
con mandar *algo* en el header, tiene que ser una key real.

### Perfiles de usuario (segundo paso del mismo tema)

El paso grande que había quedado pendiente: cuentas de verdad para
humanos, para poder compartir la app con conocidos sin que todos pisen el
mismo progreso. Usuario + contraseña nada más — sin email, sin OAuth,
la opción con menos piezas externas para "unos pocos conocidos"
autohosteando esto. Registro **abierto**: cualquiera con el link se crea
su cuenta sola (`POST /api/auth/register`).

**Backend**: `users_store.py` (mismo patrón Mongo + respaldo en memoria
que el resto), `auth.py` (contraseñas hasheadas con `bcrypt`, sesión con
JWT — 30 días, sin estado en el servidor: el username va firmado adentro
del token, no hace falta ir a la base de datos solo para autenticar cada
request). `GET/PUT /api/profile` ahora exige `Authorization: Bearer
<token>` y devuelve/guarda el perfil de **ese** usuario — antes era un
documento único fijo (`profile_store.py`), compartido por cualquiera que
corriera la app; ahora es un documento por usuario.

**Bug real encontrado en el camino**: al renombrar la variable interna de
`profile_store.py` (de un solo perfil fijo a un diccionario por usuario),
`conftest.py` seguía apuntando al nombre viejo en su fixture automática —
tumbó los 42 tests existentes de una sola vez (todos "error de setup", no
fallas reales) hasta encontrar la referencia rota.

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

Los números (120 y 60 por minuto) están calculados para no romper el uso
legítimo más intenso de la app: recorrer un replay dispara hasta 24
llamadas seguidas a `/api/analyze-move` al analizar la partida completa, y
"Buscar mi peor jugada de siempre" puede disparar muchas más.

**Corrección real, no solo teórica**: hasta cierto punto, esas llamadas se
disparaban en secuencia pero **sin ningún control de ritmo propio** —
`analyzeGame`/`analyzeCombatLog` esperaban cada respuesta antes de la
siguiente, pero sin pausa entre una y otra. En niveles bajos (donde el
motor responde rápido) esto alcanzaba de sobra el límite de entonces
(60/minuto) en cuanto "Buscar mi peor jugada de siempre" encadenaba varias
partidas — visto en logs reales de producción: decenas de `429` seguidos,
con el análisis de esas jugadas perdido en silencio (atrapado por el
`try/catch`) en vez de fallar de forma visible. Se agregó un throttle
compartido en `gameReport.js` (`throttledAnalyzeMove`) que asegura un
mínimo entre **cualquier par** de llamadas a `analyzeMove` — sin importar
si vienen de la misma partida o de partidas distintas encadenadas.
Arrancó en 1.1s (con el límite del servidor en 60/minuto); cuando ese
límite subió a 180/minuto, el throttle bajó en proporción a 400ms — la
búsqueda quedó casi 3 veces más rápida sin volver a arriesgar un 429.
Verificado con timers reales (no simulados) en ambas versiones. El gap es
configurable vía `options.throttleMs` para que los tests puedan acelerarlo
sin tocar el comportamiento real — sin eso, la suite de tests de este
archivo pasó de 23 segundos a 79ms.

### Un crash real: `-inf` no es JSON válido

Visto en logs de producción, no en teoría: `/api/analyze-move` devolvía
un **500 Internal Server Error** crudo (`ValueError: Out of range float
values are not JSON compliant: -inf`) en posiciones con mate forzado. La
causa: `evaluate_board` (en `chess_ai.py`) devuelve `+-inf` a propósito en
esas posiciones — comportamiento correcto para que minimax compare bien
("esto es lo más extremo posible"), pero el encoder JSON que usa
Starlette (el framework debajo de FastAPI) llama a `json.dumps` con
`allow_nan=False`, así que un float infinito sin sanear no da un error
prolijo — revienta el propio serializador de la respuesta.

Se agregó `sanitize_eval()` en `main.py`, aplicada a los dos puntos donde
un score del motor podía llegar sin filtrar a la respuesta
(`evalAfterSuggested` y `evalAfterPlayed`): reemplaza `+-inf` por
`+-100000.0` — un número que sigue leyéndose como "esto es decisivo" sin
romper el JSON. Reproducido con una posición real de mate en 1 (torre y
rey contra rey solo) antes y después del fix, y agregado como test de
regresión (`test_analyze_move_with_forced_mate_does_not_crash` en
`test_main.py`) — el caso específico que rompió en producción no estaba
cubierto por ninguno de los 32 tests que ya existían.
