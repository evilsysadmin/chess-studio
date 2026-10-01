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
)

func main() {
	port := env("PORT", "8080")
	upstream := env("PVP_PYTHON_UPSTREAM", "http://127.0.0.1:4000")
	handler, err := edge.New(edge.Config{
		UpstreamURL:  upstream,
		Release:      os.Getenv("GIT_COMMIT_SHA"),
		ReadyTimeout: 2 * time.Second,
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

	log.Printf("pvp-go listening on :%s -> %s", port, upstream)
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
