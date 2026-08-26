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
    && addgroup -S chess \
    && adduser -S -D -H -h /app -G chess chess

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=chess:chess . .

USER chess
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT','4000') + '/api/ready', timeout=3).read()" || exit 1

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-4000}
