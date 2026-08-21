# Multistage backend image: dependencies are built once in /opt/venv and the
# runtime image contains only what the app needs.
FROM python:3.13-slim AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.13-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system chess \
    && useradd --system --gid chess --home-dir /app --no-create-home chess

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=chess:chess . .

USER chess
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT','4000') + '/api/health', timeout=3).read()" || exit 1

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-4000}
