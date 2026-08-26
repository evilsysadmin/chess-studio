# Grafana Cloud: primera instrumentación

Chess Studio conserva su panel interno de observabilidad y añade una salida
OTLP **opcional** desde el backend. No hay credenciales en el frontend ni se
publica un endpoint `/metrics`.

## Configuración en Render

En Grafana Cloud abre tu stack y, en la tarjeta `OpenTelemetry`, pulsa
`Configure`. En la sección `Environment variables` copia los dos valores que
Grafana ya prepara. En Render usa esos mismos nombres, sin renombrarlos:

| Variable | Valor |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Valor que muestra Grafana |
| `OTEL_EXPORTER_OTLP_HEADERS` | Valor completo que muestra Grafana |

No pegues estos valores en el repositorio, en GitHub ni en la aplicación. El
segundo contiene una autorización Basic codificada; el backend la usa sólo en
memoria. Si falta cualquiera de las dos variables, la integración queda apagada y Chess Studio funciona
igual que antes.

Tras guardar las variables, redeploy del servicio Render. La primera tanda de
métricas se envía como máximo un minuto después de que haya tráfico.

## Datos enviados

Métricas:

- volumen HTTP y duración, con método, ruta normalizada y familia de estado;
- volumen y duración de las solicitudes de narrativa/IA, con proveedor y canal;
- usuarios concurrentes como una cifra agregada de la ventana de presencia;
- trazas HTTP sin query strings, cuerpos, credenciales, IPs, usuarios, FEN ni
  contenido de partidas.

El dashboard incluido es `chess-studio-overview.dashboard.json`. En Grafana:
`Dashboards` → `New` → `Import` → sube el archivo y elige el datasource
Prometheus/Mimir de tu stack.

## Dashboard como código

`terraform/` y el workflow `Grafana dashboards` publican el dashboard desde el
repositorio. Es independiente del despliegue de la app: un problema de
observabilidad no bloquea partidas ni GitHub Pages.

En Grafana crea una **service account** con permiso Editor (más adelante se
puede reducir a permisos de carpeta/dashboard) y genera un token `glsa_…`.
No uses aquí el token OTLP de ingesta. En GitHub configura estos secrets:

| Secret | Valor |
| --- | --- |
| `GRAFANA_URL` | URL base del stack, p. ej. `https://tu-stack.grafana.net` |
| `GRAFANA_AUTH` | Token de service account `glsa_…` |

Opcionalmente, define la variable de repositorio
`GRAFANA_METRICS_DATASOURCE_UID` si el UID de métricas no es
`grafanacloud-humbletoucan355-prom`. Lanza una vez el workflow manualmente desde Actions;
después, cada cambio bajo `infra/grafana/` lo actualiza. El workflow adopta por
su UID real la carpeta existente llamada `Chess Studio`, y por UID el dashboard
existente, antes de aplicar. Así el flujo sigue siendo
idempotente incluso en runners efímeros.

## Qué vigilar en el dashboard

- **Disponibilidad SLI**: respuestas que no son 5xx durante 15 minutos. Los
  4xx cuentan como API disponible: no son una caída del servicio.
- **p95 HTTP** y **p95 por ruta**: el tiempo de una petición lenta típica, para
  priorizar la ruta que realmente impacta al jugador.
- **Usuarios concurrentes**: presencia agregada que aparece tras el siguiente
  redeploy de Render y una llamada a `/api/status`; no exporta cuentas ni
  sesiones.
- **Workers AI / fallback local**: proporción de narrativa servida por Workers
  AI y la alternativa local. Un fallback alto no rompe la partida, pero señala
  que conviene revisar la dependencia de Cloudflare.

Los paneles usan ventanas de 5–15 minutos para que una sola petición o el ciclo
de exportación OTLP no produzcan falsas alarmas. El dashboard no instala alertas
por sí solo: observa una semana y ajusta los umbrales al tráfico real.

## Alertas iniciales sugeridas

- Error HTTP 5xx: más de 2% durante 10 minutos.
- Latencia p95: más de 1,5 s durante 10 minutos.
- Sin tráfico: sólo si esperas tráfico continuo; no conviene alertar de esto
  para una app personal.

El frontend hospedado en GitHub Pages no recibe ni necesita credenciales de
Grafana. Su telemetría agregada continúa pasando por la API y puede convertirse
en una métrica de backend en una segunda fase. Los runners de GitHub Actions se
instrumentan después, con una integración separada y sin mezclar sus secretos
con producción.
