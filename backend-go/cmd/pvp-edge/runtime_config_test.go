package main

import "testing"

func TestNativeFeatureFlagsNeedsMongo(t *testing.T) {
	tests := []struct {
		name  string
		flags nativeFeatureFlags
		want  bool
	}{
		{name: "none", flags: nativeFeatureFlags{}, want: false},
		{name: "resident move alone", flags: nativeFeatureFlags{residentMove: true}, want: false},
		{name: "pulse", flags: nativeFeatureFlags{pulse: true}, want: true},
		{name: "lobby read", flags: nativeFeatureFlags{lobbyRead: true}, want: true},
		{name: "roster", flags: nativeFeatureFlags{roster: true}, want: true},
		{name: "chat", flags: nativeFeatureFlags{chat: true}, want: true},
		{name: "challenge resolution", flags: nativeFeatureFlags{challengeResolution: true}, want: true},
		{name: "challenge accept", flags: nativeFeatureFlags{challengeAccept: true}, want: true},
		{name: "challenge create", flags: nativeFeatureFlags{challengeCreate: true}, want: true},
		{name: "handoff cancel", flags: nativeFeatureFlags{matchHandoffCancel: true}, want: true},
		{name: "match ready", flags: nativeFeatureFlags{matchReady: true}, want: true},
		{name: "match resign", flags: nativeFeatureFlags{matchResign: true}, want: true},
		{name: "match read", flags: nativeFeatureFlags{matchRead: true}, want: true},
		{name: "match move", flags: nativeFeatureFlags{matchMove: true}, want: true},
		{name: "games read", flags: nativeFeatureFlags{gamesRead: true}, want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.flags.needsMongo(); got != tt.want {
				t.Fatalf("needsMongo()=%t want %t", got, tt.want)
			}
		})
	}
}

func TestLoadNativeFeatureFlags(t *testing.T) {
	t.Setenv("PVP_NATIVE_PULSE_ENABLED", "true")
	t.Setenv("PVP_NATIVE_RESIDENT_MOVE_ENABLED", "1")
	t.Setenv("GO_NATIVE_GAMES_READ_ENABLED", "on")

	flags := loadNativeFeatureFlags()
	if !flags.pulse || !flags.residentMove || !flags.gamesRead {
		t.Fatalf("flags=%+v", flags)
	}
	if flags.chat || flags.matchMove {
		t.Fatalf("unexpected default-enabled flags=%+v", flags)
	}
}

func TestPythonUpstreamPrefersNeutralAlias(t *testing.T) {
	t.Setenv("GO_PYTHON_UPSTREAM", "http://python-neutral:4000")
	t.Setenv("PVP_PYTHON_UPSTREAM", "http://python-legacy:4000")
	if got := pythonUpstream(); got != "http://python-neutral:4000" {
		t.Fatalf("pythonUpstream()=%q", got)
	}
}

func TestPythonUpstreamFallsBackToLegacyAlias(t *testing.T) {
	t.Setenv("GO_PYTHON_UPSTREAM", "")
	t.Setenv("PVP_PYTHON_UPSTREAM", "http://python-legacy:4000")
	if got := pythonUpstream(); got != "http://python-legacy:4000" {
		t.Fatalf("pythonUpstream()=%q", got)
	}
}

func TestPythonUpstreamDefault(t *testing.T) {
	t.Setenv("GO_PYTHON_UPSTREAM", "")
	t.Setenv("PVP_PYTHON_UPSTREAM", "")
	if got := pythonUpstream(); got != "http://127.0.0.1:4000" {
		t.Fatalf("pythonUpstream()=%q", got)
	}
}

func TestPythonFlagReadsLikeMainPy(t *testing.T) {
	t.Setenv("CHESS_FLAG_PROBE", " YES ")
	if !pythonFlag("CHESS_FLAG_PROBE", "false") {
		t.Fatal("YES is true")
	}
	t.Setenv("CHESS_FLAG_PROBE", "maybe")
	if pythonFlag("CHESS_FLAG_PROBE", "true") {
		t.Fatal("garbage is false, whatever the default")
	}
	if !pythonFlag("CHESS_FLAG_UNSET_PROBE", "true") || pythonFlag("CHESS_FLAG_UNSET_PROBE", "false") {
		t.Fatal("unset takes the default")
	}
}
