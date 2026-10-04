package main

import (
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
