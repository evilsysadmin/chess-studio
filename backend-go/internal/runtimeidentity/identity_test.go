package runtimeidentity

import "testing"

func TestCanonicalAndLegacyNamesStayDistinct(t *testing.T) {
	if CanonicalServiceName != "chess-studio-backend-go" {
		t.Fatalf("canonical=%q", CanonicalServiceName)
	}
	if LegacyPvPServiceName != "chess-studio-pvp-go" {
		t.Fatalf("legacy=%q", LegacyPvPServiceName)
	}
	if CanonicalServiceName == LegacyPvPServiceName {
		t.Fatal("canonical runtime identity must not be the PvP compatibility name")
	}
}
