FROM golang:1.27.3-alpine3.23 AS build
ARG TARGETARCH
ARG EXPECTED_GO_VERSION=1.27.3
# Keep dependency and binary steps on the bundled patched Go, with no auto-switch.
ENV GOTOOLCHAIN=local
WORKDIR /src
# Verify the builder selected for the actual distributed image, not just CI.
RUN test "$(GOTOOLCHAIN=local go env GOVERSION)" = "go${EXPECTED_GO_VERSION}"
COPY go.mod go.sum ./
# Also verify modules have not been altered in the build cache after download.
RUN go mod download && go mod verify
COPY cmd ./cmd
COPY internal ./internal
# GO-2026-5932: the legacy OpenPGP packages have no upstream fix.
# Check the real target's import graph inside the release image builder.
RUN set -eu; \
    deps="$(CGO_ENABLED=0 GOTOOLCHAIN=local GOOS=linux GOARCH="$TARGETARCH" go list -deps ./cmd/pvp-edge)"; \
    if printf '%s\n' "$deps" | grep -Eq '^golang[.]org/x/crypto/openpgp(/|$)'; then \
      echo "GO-2026-5932: forbidden OpenPGP import in linux/$TARGETARCH" >&2; \
      exit 1; \
    fi
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/api-edge ./cmd/pvp-edge
RUN set -eu; \
    test "$(go version /out/api-edge)" = "/out/api-edge: go${EXPECTED_GO_VERSION}"; \
    go version -m /out/api-edge | grep -Fqx "$(printf '\tbuild\tGOOS=linux')"; \
    go version -m /out/api-edge | grep -Fqx "$(printf '\tbuild\tGOARCH=%s' "$TARGETARCH")"

FROM alpine:3.23
RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 chess \
    && adduser -S -D -H -h /app -u 10001 -G chess chess
WORKDIR /app
COPY --from=build /out/api-edge /app/api-edge
RUN ln -s /app/api-edge /app/pvp-edge
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=3s --retries=4 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/app/api-edge"]
