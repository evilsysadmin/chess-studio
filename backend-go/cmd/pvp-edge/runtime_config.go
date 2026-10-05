package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// nativeFeatureFlags is the single startup view of route/domain kill-switches.
// Keeping dependency decisions here prevents each migrated domain from growing
// another boolean chain in main.
type nativeFeatureFlags struct {
	pulse               bool
	lobbyRead           bool
	roster              bool
	chat                bool
	challengeResolution bool
	challengeAccept     bool
	challengeCreate     bool
	matchHandoffCancel  bool
	matchReady          bool
	matchResign         bool
	matchRead           bool
	matchMove           bool
	residentMove        bool
	gamesRead           bool
	gamesWrite          bool
	gamesHint           bool
	gamesAnalyze        bool
	system              bool
	profile             bool
	authSession         bool
	login               bool
	account             bool
	recovery            bool
	feedback            bool
	matthiasRead        bool
	narrative           bool
	pawnSlug            bool
	chronicles          bool
	chroniclesRuns      bool
	adminFeedback       bool
	adminUsers          bool
	adminObservability  bool
}

func loadNativeFeatureFlags() nativeFeatureFlags {
	return nativeFeatureFlags{
		pulse:               envBool("PVP_NATIVE_PULSE_ENABLED", false),
		lobbyRead:           envBool("PVP_NATIVE_LOBBY_READ_ENABLED", false),
		roster:              envBool("PVP_NATIVE_ROSTER_ENABLED", false),
		chat:                envBool("PVP_NATIVE_CHAT_ENABLED", false),
		challengeResolution: envBool("PVP_NATIVE_CHALLENGE_RESOLUTION_ENABLED", false),
		challengeAccept:     envBool("PVP_NATIVE_CHALLENGE_ACCEPT_ENABLED", false),
		challengeCreate:     envBool("PVP_NATIVE_CHALLENGE_CREATE_ENABLED", false),
		matchHandoffCancel:  envBool("PVP_NATIVE_MATCH_HANDOFF_CANCEL_ENABLED", false),
		matchReady:          envBool("PVP_NATIVE_MATCH_READY_ENABLED", false),
		matchResign:         envBool("PVP_NATIVE_MATCH_RESIGN_ENABLED", false),
		matchRead:           envBool("PVP_NATIVE_MATCH_READ_ENABLED", false),
		matchMove:           envBool("PVP_NATIVE_MATCH_MOVE_ENABLED", false),
		residentMove:        envBool("PVP_NATIVE_RESIDENT_MOVE_ENABLED", false),
		gamesRead:           envBool("GO_NATIVE_GAMES_READ_ENABLED", false),
		gamesWrite:          envBool("GO_NATIVE_GAMES_WRITE_ENABLED", false),
		gamesHint:           envBool("GO_NATIVE_GAMES_HINT_ENABLED", false),
		gamesAnalyze:        envBool("GO_NATIVE_ANALYZE_ENABLED", false),
		system:              envBool("GO_NATIVE_SYSTEM_ENABLED", false),
		profile:             envBool("GO_NATIVE_PROFILE_ENABLED", false),
		authSession:         envBool("GO_NATIVE_AUTH_SESSION_ENABLED", false),
		login:               envBool("GO_NATIVE_LOGIN_ENABLED", false),
		account:             envBool("GO_NATIVE_ACCOUNT_ENABLED", false),
		recovery:            envBool("GO_NATIVE_RECOVERY_ENABLED", false),
		feedback:            envBool("GO_NATIVE_FEEDBACK_ENABLED", false),
		matthiasRead:        envBool("GO_NATIVE_MATTHIAS_READ_ENABLED", false),
		narrative:           envBool("GO_NATIVE_NARRATIVE_ENABLED", false),
		pawnSlug:            envBool("GO_NATIVE_PAWN_SLUG_ENABLED", false),
		chronicles:          envBool("GO_NATIVE_CHRONICLES_ENABLED", false),
		chroniclesRuns:      envBool("GO_NATIVE_CHRONICLES_RUNS_ENABLED", false),
		adminFeedback:       envBool("GO_NATIVE_ADMIN_FEEDBACK_ENABLED", false),
		adminUsers:          envBool("GO_NATIVE_ADMIN_USERS_ENABLED", false),
		adminObservability:  envBool("GO_NATIVE_ADMIN_OBSERVABILITY_ENABLED", false),
	}
}

func (f nativeFeatureFlags) needsMongo() bool {
	return f.pulse ||
		f.lobbyRead ||
		f.roster ||
		f.chat ||
		f.challengeResolution ||
		f.challengeAccept ||
		f.challengeCreate ||
		f.matchHandoffCancel ||
		f.matchReady ||
		f.matchResign ||
		f.matchRead ||
		f.matchMove ||
		f.gamesRead ||
		f.gamesWrite ||
		f.gamesHint ||
		f.gamesAnalyze ||
		f.system ||
		f.profile ||
		f.authSession ||
		f.login ||
		f.account ||
		f.recovery ||
		f.feedback ||
		f.matthiasRead ||
		f.narrative ||
		f.pawnSlug ||
		f.chronicles ||
		f.chroniclesRuns ||
		f.adminFeedback ||
		f.adminUsers ||
		f.adminObservability
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

// pythonUpstream resolves the general Go front's Python compatibility backend.
// GO_PYTHON_UPSTREAM is canonical; PVP_PYTHON_UPSTREAM remains a temporary
// rollback/compatibility alias while deployment wiring migrates.
func pythonUpstream() string {
	if value := strings.TrimSpace(os.Getenv("GO_PYTHON_UPSTREAM")); value != "" {
		return value
	}
	return env("PVP_PYTHON_UPSTREAM", "http://127.0.0.1:4000")
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
