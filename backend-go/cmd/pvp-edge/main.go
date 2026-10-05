package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/edge"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

func main() {
	port := env("PORT", "8080")
	upstream := pythonUpstream()
	features := loadNativeFeatureFlags()

	native, err := buildNativeRuntime(features, upstream)
	if err != nil {
		log.Fatal(err)
	}
	if native.mongo != nil {
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := native.close(ctx); err != nil {
				log.Printf("native Go Mongo shutdown: %v", err)
			}
		}()
	}

	history := native.history
	if history != nil {
		historyCtx, stopHistory := context.WithCancel(context.Background())
		historyDone := make(chan struct{})
		go func() {
			defer close(historyDone)
			history.Run(historyCtx)
		}()
		defer func() {
			stopHistory()
			<-historyDone
		}()
	}

	requestTelemetry := newRequestTelemetry(history)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := requestTelemetry.Shutdown(ctx); err != nil {
			log.Printf("request telemetry flush: %v", err)
		}
	}()

	handler, err := edge.New(native.edgeConfig(upstream, os.Getenv("GIT_COMMIT_SHA"), requestTelemetry))
	if err != nil {
		log.Fatalf("invalid Go edge configuration: %v", err)
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
			log.Printf("Go API edge shutdown: %v", err)
		}
	}()

	native.logStartup(port, upstream)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Go API edge serve: %v", err)
	}
}

// newRequestTelemetry gives the routes Go serves natively the metrics and
// access log Python gives every request. It is fail-open: a bad exporter
// configuration only loses that signal. GO_REQUEST_TELEMETRY_ENABLED=false
// turns it off entirely.
func newRequestTelemetry(history *obshistory.Recorder) *telemetry.Recorder {
	if !envBool("GO_REQUEST_TELEMETRY_ENABLED", true) {
		return nil
	}
	cfg := telemetry.ConfigFromEnv(os.LookupEnv)
	secret := []byte(strings.TrimSpace(os.Getenv("JWT_SECRET")))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var sink telemetry.HTTPHistory
	if history != nil {
		sink = history
	}
	recorder, err := telemetry.New(ctx, cfg, telemetry.Options{
		History: sink,
		Username: func(r *http.Request) string {
			return sessionauth.VerifiedSubject(r.Header.Get("Authorization"), secret, time.Now())
		},
	})
	if err != nil {
		log.Printf("request telemetry degraded: %v", err)
	}
	log.Printf("request telemetry service=%s traces=%t metrics=%t logs=%t", cfg.ServiceName, cfg.TracesEnabled, cfg.MetricsEnabled, cfg.LogsEnabled)
	return recorder
}
