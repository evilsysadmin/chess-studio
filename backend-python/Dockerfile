# Multistage: la etapa "builder" instala las dependencias en un venv; la
# imagen final solo copia ese venv ya armado + el código, sin arrastrar pip,
# su caché de descargas, ni herramientas de build — la imagen final queda
# más chica y con menos superficie (menos paquetes = menos CVEs de los que
# preocuparse).

FROM python:3.13-slim AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------

FROM python:3.13-slim

WORKDIR /app

# "slim" recorta ca-certificates para achicar la imagen — pero sin eso el
# contenedor no tiene ninguna autoridad certificadora raíz en la que confiar,
# y no puede validar la cadena TLS de MongoDB Atlas al conectarse. Sin este
# paquete, la conexión a Mongo falla con SSL: TLSV1_ALERT_INTERNAL_ERROR (o
# similar) y el backend cae en silencio al respaldo en memoria — visto en un
# despliegue real, no en teoría.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

EXPOSE 4000

# Forma "shell" del CMD (no la de array) a propósito: así se puede
# interpolar la variable de entorno PORT, que Render (y otros hostings)
# inyectan solos.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-4000}
