# Multistage backend image on Alpine. Build tools never reach the runtime image;
# /opt/venv is copied between identical musl-based Python stages.
ARG PYTHON_IMAGE=python:3.13-alpine3.23
FROM ${PYTHON_IMAGE} AS builder

WORKDIR /app
RUN apk add --no-cache build-base linux-headers
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM ${PYTHON_IMAGE}
WORKDIR /app

RUN apk add --no-cache ca-certificates libstdc++ \
    && update-ca-certificates \
    && addgroup -S -g 10001 chess \
    && adduser -S -D -H -h /app -u 10001 -G chess chess

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=chess:chess . .

# Keep the OCI image config numeric so Kubernetes can prove runAsNonRoot
# without consulting /etc/passwd inside the image.
USER 10001:10001
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT','4000') + '/api/ready', timeout=3).read()" || exit 1

# Production entrypoint wraps FastAPI with an ultra-cheap hostile-path guard so
# repository/dotenv/traversal probes never reach application routing or tracing.
CMD uvicorn production_asgi:app --host 0.0.0.0 --port ${PORT:-4000}
