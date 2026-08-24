# Cloudflare Workers AI · narrativa de Chess Studio · V5

## Arquitectura

```text
React / narrativeProvider existente
        |
        | JWT
        v
FastAPI / Render
  - decide si el evento merece comentario
  - calcula HECHOS reales
  - firma dossier con HMAC
        |
        | HTTPS + HMAC
        v
Cloudflare Worker
  - valida timestamp + firma
  - limita y sanea el dossier
  - NO calcula hechos de ajedrez
        |
        | AI binding + routing
        +--> comentarios: @cf/meta/llama-3.2-3b-instruct
        +--> player_portrait: @cf/qwen/qwen3-30b-a3b-fp8
        `--> análisis (autopsia/Combat/SRE): @cf/qwen/qwen3-30b-a3b-fp8
```

La separación es deliberada: el motor y las estadísticas son la autoridad
factual. El LLM sólo escribe.

## Contrato recomendado

```json
{
  "event_type": "blunder",
  "facts": {
    "san": "Qd4",
    "eval_before": 1.2,
    "eval_after": -4.8,
    "lost_piece": "queen"
  },
  "tone": "sarcastic",
  "locale": "es-ES"
}
```

No envíes el historial completo de usuario si no hace falta. El dossier debe
contener sólo los hechos necesarios para esa frase.

## Seguridad

Render envía:

- `X-Chess-AI-Timestamp`
- `X-Chess-AI-Signature: sha256=<HMAC>`

La firma cubre exactamente:

```text
<timestamp>.<body-json-exacto>
```

El Worker permite 90 segundos de deriva y rechaza firmas viejas.

El browser no conoce `CHESS_AI_SHARED_SECRET` y no llama al Worker directamente.

## Fallback, kill switch y circuit breaker

Cloudflare es decorativo, no crítico:

- timeout → local
- 401/429/5xx → local
- JSON inválido → local
- texto vacío → local
- respuesta no grounded → local
- circuito abierto → local sin tocar Cloudflare
- `AI_NARRATIVE_ENABLED=false` → local sin tocar Cloudflare

El circuit breaker abre después de 5 respuestas consecutivas inutilizables y
reintenta a los 90 segundos. Se puede ajustar en Render:

```text
AI_NARRATIVE_CIRCUIT_FAILURES=5
AI_NARRATIVE_CIRCUIT_RESET_SECONDS=90
```

Nunca bloquea movimiento, reloj, persistencia ni resultado de partida.
El frontend V4 incluye `requestRemoteNarrativeDetached()` para lanzar el texto
sólo después de que el movimiento ya esté confirmado.

## Parámetros de generación

Routing actual por tarea:

- comentarios de partida: `@cf/meta/llama-3.2-3b-instruct`;
- `player_portrait`: `@cf/qwen/qwen3-30b-a3b-fp8`;
- análisis (`post_game_autopsy`, `combat_briefing`, `combat_debrief`, `observability_summary`): `@cf/qwen/qwen3-30b-a3b-fp8`.

El Worker devuelve el modelo realmente usado para que Observabilidad pueda separarlos.

Comentarios de partida — deliberadamente más variables porque son pullas cortas:

- max_tokens: 120
- temperature: 1.25
- top_p: 0.96
- top_k: 45
- repetition_penalty: 1.12
- frequency_penalty: 0.35
- presence_penalty: 0.25

`player_portrait` — deliberadamente más estable porque su función es diagnosticar:

- max_tokens: 180
- temperature: 0.60
- top_p: 0.85
- top_k: 20
- repetition_penalty: 1.08
- frequency_penalty: 0.10
- presence_penalty: 0.05

El retrato exige tres frases: acierto real, principal problema medido y siguiente
acción práctica, con una única pulla breve. No debe sacrificar utilidad por creatividad.

Las tareas analíticas usan `max_tokens: 190`, `temperature: 0.62`, `top_p: 0.86` y contratos específicos por evento. Autopsia y Observabilidad exigen tres frases compactas; briefing Combat dos; debriefing dos o tres. Todas reciben hechos reducidos y nunca autoridad sobre reglas o estado.

## Terraform y secretos

Terraform gestiona:

- script
- compatibility date
- Workers AI binding
- Rate Limiting binding (300 inferencias/minuto por ubicación Cloudflare). El namespace por defecto es `1606601`; cámbialo si ese entero ya identifica otro rate limiter de tu cuenta.
- Custom Domain `ai.shadowops.dpdns.org`
- `workers.dev` deshabilitado para este Worker

Terraform NO gestiona `CHESS_AI_SHARED_SECRET`, porque un `secret_text` sensible
seguiría formando parte del state. GitHub Actions ejecuta:

```bash
wrangler secret put CHESS_AI_SHARED_SECRET
```

después del `terraform apply`.

El endpoint público de producción es un **Workers Custom Domain**:
`https://ai.shadowops.dpdns.org`. Cloudflare gestiona el routing DNS y el
certificado TLS de ese hostname; no se crea un CNAME manual hacia
`workers.dev`. El subdominio `workers.dev` del script se mantiene deshabilitado.

## Puesta en marcha real (una vez)

No pegues el token de Cloudflare en el frontend, en Render ni en el repositorio.
El token se usa **sólo en GitHub Actions para desplegar el Worker**. El Worker
invoca Workers AI mediante el binding `env.AI`, así que la aplicación en
producción no necesita la API key de Cloudflare.

### 1. Token y Account ID

Guarda en **GitHub → Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: token de API, no la Global API Key. Para este workflow
  necesita poder editar Workers Scripts y Workers AI en la cuenta.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID de Cloudflare.
- `CHESS_AI_SHARED_SECRET`: secreto HMAC aleatorio compartido exclusivamente
  entre Render y el Worker. Genera uno, por ejemplo, con `openssl rand -hex 32`.

Si el token que ya tienes fue creado con la plantilla **Workers AI API Token**,
comprueba sus permisos: para desplegar el Worker también hace falta permiso de
Workers Scripts. Si no lo tiene, crea un token específico y limitado a esta
cuenta; no amplíes una Global API Key.

### 2. Desplegar

Ejecuta manualmente el workflow **Cloudflare Workers AI** o haz push de un
cambio bajo `infra/cloudflare/`. El workflow:

1. valida/aplica Terraform;
2. instala `CHESS_AI_SHARED_SECRET` con Wrangler fuera del state;
3. crea/importa el Custom Domain `ai.shadowops.dpdns.org`;
4. mantiene `workers.dev` deshabilitado para ese Worker;
5. verifica `GET https://ai.shadowops.dpdns.org/health`;
6. deja la URL final del Worker en el Job Summary.

También puedes validar el repo sin credenciales:

```bash
make cf-ai-preflight
```

Y después de desplegar:

```bash
python3 scripts/cloudflare_ai_preflight.py \
  --worker-url https://ai.shadowops.dpdns.org
```

### 3. Conectar Render

En el servicio backend de Render configura:

```text
AI_NARRATIVE_ENABLED=true
CF_AI_WORKER_URL=https://ai.shadowops.dpdns.org
CHESS_AI_SHARED_SECRET=<exactamente el mismo valor guardado en GitHub>
CF_AI_TIMEOUT_SECONDS=12
```

No configures `CLOUDFLARE_API_TOKEN` en Render. Después del siguiente deploy del
backend, el navegador seguirá hablando sólo con `/api/narrative`; FastAPI firma
el dossier y el Worker genera únicamente el texto.

### 4. Verificación

- `GET <worker>/health` debe devolver `ok: true`.
- En Admin, **Estado del narrador AI** debería empezar a registrar porcentaje
  Cloudflare cuando ocurran jugadas realmente comentables.
- Si Cloudflare falla o la configuración no está lista, el provider local sigue
  funcionando y la partida no se bloquea.

## API token de Cloudflare

El token sólo vive en GitHub Actions. Render no lo necesita. Concede únicamente
los permisos de cuenta necesarios para gestionar el Worker; no uses una Global
API Key.

## State en GitHub Actions

Este overlay administra tres recursos Terraform de nombre fijo. Para no
obligar al proyecto a contratar/configurar un backend de state adicional, cada
run de deploy importa primero el Worker, la configuración workers.dev y el
Custom Domain si ya existen, y después hace plan/apply. Para una infraestructura mayor, migra a un backend remoto real.


## Observabilidad V4

`GET /api/admin/ai-metrics` expone únicamente agregados del proceso actual:
porcentaje Cloudflare/fallback, p95 de Cloudflare, causas de fallback, kill
switch y estado del circuit breaker (abierto, fallos consecutivos, aperturas y
tiempo restante). La ventana está acotada a 500 eventos y no incluye usuario,
dossier ni texto.

Es telemetría operativa, no un sistema histórico. Si más adelante queremos
histórico, debe ir a métricas/observabilidad y no a Mongo como prompts crudos.

## Cooldown contextual

El navegador dispone de un gate opcional que evita comentarios en ráfaga. Los
valores iniciales son 2 ply y 2,5 segundos. Debe crearse una vez por partida o
sesión y reutilizarse; crear un gate nuevo en cada jugada anularía el cooldown.
