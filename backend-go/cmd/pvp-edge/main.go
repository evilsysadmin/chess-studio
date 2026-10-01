package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/edge"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pulse"
)

func main() {
	port := env("PORT", "8080")
	upstream := env("PVP_PYTHON_UPSTREAM", "http://127.0.0.1:4000")

	pulseEnabled := envBool("PVP_NATIVE_PULSE_ENABLED", false)
	rosterEnabled := envBool("PVP_NATIVE_ROSTER_ENABLED", false)
	var nativePulse http.Handler
	var nativeRoster http.Handler
	var mongoStore *pulse.MongoStore
	if pulseEnabled || rosterEnabled {
		mongoURL := strings.TrimSpace(os.Getenv("MONGO_URL"))
		mongoDatabase := strings.TrimSpace(os.Getenv("MONGO_DB_NAME"))
		jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
		if mongoURL == "" || mongoDatabase == "" || jwtSecret == "" {
			log.Fatal("native PvP features require MONGO_URL, MONGO_DB_NAME and JWT_SECRET")
		}
		startupCtx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		store, err := pulse.NewMongoStore(startupCtx, pulse.MongoConfig{
			URL:          mongoURL,
			Database:     mongoDatabase,
			QueryTimeout: envDurationMS("PVP_MONGO_TIMEOUT_MS", 2000*time.Millisecond),
		})
		cancel()
		if err != nil {
			log.Fatalf("native PvP pulse storage: %v", err)
		}
		mongoStore = store
		pulseHandler, err := pulse.NewHandler(pulse.HandlerConfig{
			Store:          store,
			JWTSecret:      jwtSecret,
			AllowedOrigins: splitCSV(os.Getenv("CORS_ORIGINS")),
			EnableRoster:   rosterEnabled,
		})
		if err != nil {
			log.Fatalf("native PvP pulse handler: %v", err)
		}
		if pulseEnabled {
			nativePulse = pulseHandler
		}
		if rosterEnabled {
			nativeRoster = pulseHandler
		}
	}
	if mongoStore != nil {
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := mongoStore.Close(ctx); err != nil {
				log.Printf("native PvP pulse Mongo shutdown: %v", err)
			}
		}()
	}

	handler, err := edge.New(edge.Config{
		UpstreamURL:  upstream,
		Release:      os.Getenv("GIT_COMMIT_SHA"),
		ReadyTimeout: 2 * time.Second,
		NativePulse:  nativePulse,
		NativeRoster: nativeRoster,
	})
	if err != nil {
		log.Fatalf("invalid pvp edge configuration: %v", err)
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       75 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := edge.Shutdown(ctx, server); err != nil {
			log.Printf("pvp edge shutdown: %v", err)
		}
	}()

	log.Printf("pvp-go listening on :%s -> %s native_pulse=%t native_roster=%t", port, upstream, nativePulse != nil, nativeRoster != nil)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("pvp edge serve: %v", err)
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func envDurationMS(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return time.Duration(value) * time.Millisecond
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if cleaned := strings.TrimSpace(part); cleaned != "" {
			out = append(out, cleaned)
		}
	}
	return out
}
