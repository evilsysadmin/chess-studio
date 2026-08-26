# Grafana Cloud: primera instrumentación

Chess Studio conserva su panel interno de observabilidad y añade una salida
OTLP **opcional** desde el backend. No hay credenciales en el frontend ni se
publica un endpoint `/metrics`.

## Configuración en Render

En Grafana Cloud, abre `Connections` y busca `OpenTelemetry`. Copia los datos
de la tarjeta OTLP y crea una access policy token con permisos de escritura
para métricas y trazas. En las variables de entorno del servicio Render añade:

| Variable | Valor |
| --- | --- |
| `GRAFANA_OTLP_ENDPOINT` | URL OTLP de Grafana Cloud |
| `GRAFANA_OTLP_INSTANCE_ID` | Instance ID de la tarjeta OTLP |
| `GRAFANA_OTLP_TOKEN` | Access policy token de Grafana Cloud |

No pegues el token en este repositorio, en GitHub ni en la aplicación. El
backend construye la autenticación Basic sólo en memoria. Si falta cualquiera
de las tres variables, la integración queda apagada y Chess Studio funciona
igual que antes.

Tras guardar las variables, redeploy del servicio Render. La primera tanda de
métricas se envía como máximo un minuto después de que haya tráfico.

## Datos enviados

Métricas:

- volumen HTTP y duración, con método, ruta normalizada y familia de estado;
- volumen y duración de las solicitudes de narrativa/IA, con proveedor y canal;
- trazas HTTP sin query strings, cuerpos, credenciales, IPs, usuarios, FEN ni
  contenido de partidas.

El dashboard incluido es `chess-studio-overview.dashboard.json`. En Grafana:
`Dashboards` → `New` → `Import` → sube el archivo y elige el datasource
Prometheus/Mimir de tu stack.

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
