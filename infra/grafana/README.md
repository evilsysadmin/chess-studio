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

Las mismas dos variables activan las tres señales OTLP del backend: métricas en
Prometheus/Mimir, trazas en Tempo y logs operativos seguros en Loki. No hace
falta un token de Loki ni de Tempo adicional.

## Datos enviados

Métricas:

- volumen HTTP y duración, con método, ruta normalizada y familia de estado;
- volumen y duración de las solicitudes de narrativa/IA, con proveedor y canal;
- usuarios concurrentes como una cifra agregada de la ventana de presencia;
- trazas HTTP sin query strings, cuerpos, credenciales, IPs, usuarios, FEN ni
  contenido de partidas.
- logs HTTP estructurados para Loki: método, ruta normalizada, estado,
  duración, versión cliente y request-id efímero. Los logs de Render conservan
  su circuito de soporte propio; la copia OTLP no contiene usernames ni
  tracebacks.

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

Opcionalmente, define las variables de repositorio
`GRAFANA_METRICS_DATASOURCE_UID`, `GRAFANA_LOGS_DATASOURCE_UID` y
`GRAFANA_TRACES_DATASOURCE_UID` si los UID de tu stack no son,
respectivamente, `grafanacloud-humbletoucan355-prom`,
`grafanacloud-humbletoucan355-logs` y `grafanacloud-humbletoucan355-traces`.
El UID aparece al abrir cada datasource en Grafana; es el último segmento de
la URL de edición. Lanza una vez el workflow manualmente desde Actions;
después, cada cambio bajo `infra/grafana/` lo actualiza. El workflow adopta por
su UID real la carpeta existente llamada `Chess Studio`, y por UID el dashboard
existente, antes de aplicar. Así el flujo sigue siendo
idempotente incluso en runners efímeros.

## Qué vigilar en el dashboard

- **Disponibilidad API core** y **p95 core**: rutas de juego y cuenta sin
  `/api/narrative`. Los 4xx cuentan como API disponible: no son una caída del
  servicio.
- **Narrativa end-to-end** y **Workers AI p95**: la espera que percibe el
  jugador se separa de la salud de API. Así una dependencia lenta no vuelve
  roja una ruta normal de juego; el panel por proveedor muestra si llegó a
  Cloudflare o se resolvió con fallback local.
- **Usuarios concurrentes**: presencia agregada de los últimos 15 minutos.
  El panel muestra `0` si no hay jugadores activos; tras desplegar basta una
  llamada autenticada a `/api/status` y unos segundos para publicar muestra.
- **Workers AI / fallback local**: proporción de narrativa servida por Workers
  AI y la alternativa local. Un fallback alto no rompe la partida, pero señala
  que conviene revisar la dependencia de Cloudflare.

Los paneles usan ventanas de 5–15 minutos para que una sola petición o el ciclo
de exportación OTLP no produzcan falsas alarmas. El dashboard no instala alertas
por sí solo: observa una semana y ajusta los umbrales al tráfico real.

## Loki y Tempo

En **Explore**, selecciona el datasource Loki y filtra por
`service_name="chess-studio-api"`. Puedes empezar con `{service_name="chess-studio-api"}`
para ver cada request seguro. Los atributos OTLP aparecen como metadatos
estructurados: usa los filtros de Grafana para acotar por ruta o por familia de
estado, sin buscar cuerpos ni usuarios.

En Tempo busca el servicio `chess-studio-api`. Cada request HTTP abre una traza
con método, ruta normalizada y estado; las respuestas 5xx se marcan como error.
El evento de Loki se emite con esa traza todavía activa, por lo que Grafana puede
correlacionarlos mediante su contexto OTLP cuando el datasource lo presenta.

El dashboard publicado incluye una fila **Investigación de incidentes**:

- **Errores 5xx recientes**: logs de nivel error, para abrir el detalle de una
  petición sin exponer datos personales.
- **Narrativa reciente**: compara las llamadas a `/api/narrative` con el p95
  de Workers AI y fallback ya mostrado arriba.
- **Trazas recientes**: las últimas veinte peticiones, rápidas o lentas. El
  panel de revisión conserva el filtro de más de 500 ms. Abre una y utiliza
  `Logs for this span` si el enlace aparece.

Si Grafana no muestra aún el salto de traza a logs, abre el datasource Tempo,
en **Trace to logs** elige Loki y configura `service.name` → `service_name`,
con una ventana de `-2s` a `2s`. Es una mejora de navegación: los tres paneles
siguen funcionando de forma independiente.

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
