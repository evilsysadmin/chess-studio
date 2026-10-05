package main

import (
	"os"
	"strings"
	"testing"
)

func TestBuildNativeRuntimeWithoutMongoNeedsNoDatabaseConfig(t *testing.T) {
	t.Setenv("CHESS_PVP_SPARRING_ENABLED", "false")
	t.Setenv("MONGO_URL", "")
	t.Setenv("MONGO_DB_NAME", "")
	t.Setenv("JWT_SECRET", "")

	runtime, err := buildNativeRuntime(nativeFeatureFlags{}, "http://python:4000")
	if err != nil {
		t.Fatal(err)
	}
	if runtime.mongo != nil {
		t.Fatal("empty feature set opened Mongo")
	}
}

func TestBuildNativeRuntimeRejectsMissingMongoConfigForNativeDataRoutes(t *testing.T) {
	t.Setenv("CHESS_PVP_SPARRING_ENABLED", "false")
	t.Setenv("MONGO_URL", "")
	t.Setenv("MONGO_DB_NAME", "")
	t.Setenv("JWT_SECRET", "")

	_, err := buildNativeRuntime(nativeFeatureFlags{gamesRead: true}, "http://python:4000")
	if err == nil || !strings.Contains(err.Error(), "MONGO_URL") {
		t.Fatalf("err=%v", err)
	}
}

func TestBuildNativeRuntimeRequiresOwnerForVirtualPlayers(t *testing.T) {
	t.Setenv("CHESS_PVP_SPARRING_ENABLED", "true")
	t.Setenv("CHESS_PVP_SPARRING_OWNER", "")

	_, err := buildNativeRuntime(nativeFeatureFlags{}, "http://python:4000")
	if err == nil || !strings.Contains(err.Error(), "CHESS_PVP_SPARRING_OWNER") {
		t.Fatalf("err=%v", err)
	}
}

func TestAdminUsersSharesTheNarrativeGateway(t *testing.T) {
	url := os.Getenv("PVP_MONGO_TEST_URL")
	if url == "" {
		t.Skip("PVP_MONGO_TEST_URL not set (startup pings Mongo)")
	}
	t.Setenv("CHESS_PVP_SPARRING_ENABLED", "false")
	t.Setenv("MONGO_URL", url)
	t.Setenv("MONGO_DB_NAME", "chess_test")
	t.Setenv("JWT_SECRET", "secret")

	for _, flags := range []nativeFeatureFlags{{adminUsers: true}, {adminUsers: true, narrative: true}} {
		runtime, err := buildNativeRuntime(flags, "http://python:4000")
		if err != nil {
			t.Fatal(err)
		}
		cfg := runtime.edgeConfig("http://python:4000", "test", nil)
		if cfg.NativeAdminUsers == nil {
			t.Fatalf("%+v: admin users handler not built", flags)
		}
		if (cfg.NativeNarrative != nil) != flags.narrative {
			t.Fatalf("%+v: narrative handler %v", flags, cfg.NativeNarrative)
		}
	}
}
