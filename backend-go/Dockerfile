FROM golang:1.27.1-alpine3.23 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/api-edge ./cmd/pvp-edge

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
