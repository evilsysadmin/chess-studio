package main

import (
	"testing"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentmove"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentoracle"
)

func TestNewResidentMoveProviderNativeIgnoresPythonOracleConfig(t *testing.T) {
	provider, err := newResidentMoveProvider(true, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := provider.(*residentmove.Chooser); !ok {
		t.Fatalf("provider=%T want *residentmove.Chooser", provider)
	}
}

func TestNewResidentMoveProviderFallbackUsesSignedPythonOracle(t *testing.T) {
	provider, err := newResidentMoveProvider(
		false,
		"http://backend:4000",
		"01234567890123456789012345678901",
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := provider.(*residentoracle.Client); !ok {
		t.Fatalf("provider=%T want *residentoracle.Client", provider)
	}
}

func TestNewResidentMoveProviderFallbackRejectsInvalidOracleConfig(t *testing.T) {
	if _, err := newResidentMoveProvider(false, "", "secret"); err == nil {
		t.Fatal("expected invalid oracle configuration")
	}
}
