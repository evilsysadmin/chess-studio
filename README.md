# Estudio de Ajedrez

<!-- Cambia TU-USUARIO/TU-REPO por los reales una vez que publiques el repo -->
![CI](https://github.com/TU-USUARIO/TU-REPO/actions/workflows/ci.yml/badge.svg)

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

55 tests de backend (motor de IA, endpoints de la API) y 226 de frontend
(lógica de combate, rating, torneo, análisis de partidas, autenticación,
y el resto de los módulos). `.github/workflows/ci.yml` corre ambas suites
en paralelo en cada push y pull request; `deploy-pages.yml` corre los
tests de frontend antes de publicar — si algo falla, el deploy no arranca.

## Modos de juego

- **Partida rápida / Partida de práctica** — contra la CPU, dificultad
  ajustable de 0 a 100. "Partida de práctica" suma pistas del motor
  gratis e ilimitadas.
- **Torneo** — progresión persistente: puntos por victorias, tablas y
  capturas, niveles con dificultad de CPU creciente, pistas pagadas con
  esos mismos puntos, y títulos/skins de piezas desbloqueables por nivel.
- **Combate** — ajedrez con una capa de RPG: las capturas se resuelven
  con un % de acierto según fuerza/velocidad de ambas piezas, con
  esquive en vez de fallo directo. Las piezas ganan XP y suben de nivel
  al terminar cada batalla; las que caen tienen una ventana para
  revivirlas antes de perderse para siempre.
- **Combate Roguelike** — una escalera de pisos contra la CPU, cada uno
  con material extra del lado rival (una pieza de más, o el doble de
  peones). Perder o retirarse termina la corrida; la mejor marca
  alcanzada queda guardada.
- **Espejo de ti mismo** — una CPU calibrada al promedio de tus propios
  errores históricos, en vez de un nivel fijo.
- **Espectador** — dos CPU jugando entre sí, con pausas configurables.
- **Aprendizaje** — diez lecciones interactivas, una por pieza más
  enroque y jaque mate.
- **Aperturas famosas** — dieciocho aperturas clásicas, recorridas
  jugada por jugada con explicación en cada una.
- **Puzzle** — posiciones cortas para resolver (mate en 1, mate en 2,
  encontrar la jugada que gana material), con racha y reintentos pagados
  con puntos de torneo.

## Análisis y progreso

- **Historial y "pista inversa"** — cualquier partida terminada se
  reproduce jugada por jugada, comparando cada movimiento tuyo contra lo
  que el motor hubiera preferido en ese momento. Un panel lateral marca
  tus peores jugadas de la partida, con salto directo a cada una.
- **"Así juegas"** — estadísticas agregadas (aperturas, rachas, color
  preferido, capturas, evolución de rating), calculadas al instante sin
  volver a analizar nada. "Buscar mi peor jugada de siempre" analiza el
  historial completo bajo demanda, con resultados cacheados por partida
  para no repetir análisis ya hechos.
- **Rating tipo ELO** — sube o baja según tus resultados en Torneo y
  partidas normales (Combate y Práctica quedan afuera de la medición).
  Arranca en 400, con un K-factor más alto en tus primeros 12 partidos.
- **Logros** — 14 repartidos por todos los modos.
- **Voz de la CPU** — comentarios por voz opcionales en capturas, jaque
  y jaque mate (Web Speech API nativa del navegador, sin archivos de
  audio), apagados por defecto.
- **Música ambiental** — cuatro capas sintetizadas (Web Audio API, sin
  archivos de audio), suena en toda la app hasta que se mutea.
- **Experimento 3D** — ajedrez jugable en 3D, marcado explícitamente
  como experimental, aislado del resto de la app.

## Cuentas y sincronización

Registro abierto con usuario y contraseña (JWT, sin email ni OAuth). Tu
progreso (torneo, ejército de combate, rating, logros, historial de
partidas) vive en `localStorage` del navegador y se sincroniza con el
backend en cada cambio de pantalla — sobrevive a limpiar el navegador o
cambiar de dispositivo, siempre que inicies sesión con la misma cuenta.
Si el backend no está disponible, la app sigue funcionando igual con lo
que haya local. También se puede exportar/importar el progreso como
archivo, y hay un botón para borrar todo el progreso local (con
confirmación) si quieres empezar de cero.

**ESC** cierra cualquier modal o vuelve al menú desde cualquier
pantalla, salvo en medio de una partida o batalla en curso.

## API del backend

`http://localhost:4000/docs` tiene la documentación interactiva completa
(generada por FastAPI, con los schemas exactos de cada request/response).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crea una cuenta. Body: `{ username, password }` |
| POST | `/api/auth/login` | Inicia sesión, devuelve un token |
| GET | `/api/auth/me` | Usuario autenticado actual |
| POST | `/api/games` | Crea partida. Body: `{ difficulty: 0-100, color: 'w'\|'b'\|'random', handicap? }` |
| GET | `/api/games/:id` | Estado actual de la partida |
| GET | `/api/games/:id/moves?square=e2` | Jugadas legales desde una casilla |
| GET | `/api/games/:id/hint` | Sugerencia del motor para tu próxima jugada |
| POST | `/api/games/:id/move` | Jugada del humano. Body: `{ from, to, promotion? }`. Responde ya con la jugada de la CPU aplicada |
| POST | `/api/games/:id/undo` | Deshace tu última jugada (y la respuesta de la CPU, si la hubo) |
| DELETE | `/api/games/:id` | Abandona/borra la partida |
| POST | `/api/analyze` | Mejor jugada para una posición suelta. Body: `{ fen, level? }` |
| POST | `/api/analyze-move` | Compara una jugada jugada contra la mejor posible en esa posición. Body: `{ fen, from?, to?, level? }` |
| GET | `/api/profile` | Perfil del usuario autenticado (requiere token) |
| PUT | `/api/profile` | Sobreescribe el perfil del usuario autenticado — passthrough puro, la forma la define el frontend |
| GET | `/api/health` | Salud del servicio |

### Rate limiting

Por IP, con [slowapi](https://github.com/laurentS/slowapi). **120
requests/minuto** por defecto en toda la API; `/api/analyze` en
**60/minuto**; `/api/analyze-move` en **180/minuto**. `/api/health` queda
exento, para que el healthcheck de Docker nunca se vea afectado.

`M2M_API_KEYS` (variable de entorno, lista separada por comas) habilita
tráfico M2M autenticado: un `X-API-Key` válido en el header sube el
límite de `/api/analyze` y `/api/analyze-move` a **1000/minuto**, con
cupo propio por key, sin compartir balde con el tráfico público de la
misma IP. Sin la variable configurada, ninguna key valida nunca.

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
4. Cuando termine el deploy, Render te da una URL tipo
   `https://chess-study-backend.onrender.com`.
5. Confirma que arrancó bien: `https://tu-url.onrender.com/api/health`
   debería devolver `{"ok":true}`. Si no responde, revisa los logs del
   servicio en el dashboard de Render.

> El plan free de Render duerme el servicio tras 15 minutos sin
> tráfico — la primera visita después tarda 30-60 segundos en responder
> mientras arranca de nuevo. Es normal.

### 2. Frontend en GitHub Pages

1. En el repo de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**, agrega
   una variable `VITE_API_URL` con `https://tu-backend.onrender.com/api`.
3. Haz push a `main`. El workflow `.github/workflows/deploy-pages.yml`
   compila el frontend con la URL del backend ya metida adentro y
   publica solo.
4. En un par de minutos, el sitio queda en
   `https://tu-usuario.github.io/nombre-del-repo/`.

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
verificar el pixel art y las piezas 3D, y el estado del experimento 3D.
