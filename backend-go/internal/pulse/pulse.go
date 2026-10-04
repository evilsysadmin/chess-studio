package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/corspolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvpclock"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvproute"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	defaultPollAfter     = 3 * time.Second
	defaultQueryTimeout  = 2 * time.Second
	rosterJoinLimit      = 30
	rosterJoinWindow     = time.Minute
	lobbyChatLimit       = 12
	lobbyChatWindow      = time.Minute
	challengeCooldown    = 20 * time.Second
	rosterTTL            = 45 * time.Second
	challengeTTL         = 75 * time.Second
	lobbyChatTTL         = 24 * time.Hour
	presenceOnline       = 4 * time.Second
	presenceReconnecting = 12 * time.Second
	disconnectGrace      = pvpclock.DisconnectGrace
	handoffDelay         = 5 * time.Second
	pvpTimeControlID     = "30+0"
	pvpInitialClockMS    = pvpclock.InitialMS
	nativeHeaderValue    = "lobby-pulse"
)

type Store interface {
	AuthState(context.Context, string) (exists bool, sessionVersion int64, err error)
	Revision(context.Context, string, time.Time) (string, error)
	MatchState(context.Context, string, string, time.Time) (matchPulseState, error)
	JoinRoster(context.Context, string, time.Time) (rosterRow, error)
	LeaveRoster(context.Context, string, time.Time) error
	AppendLobbyChat(context.Context, string, string, time.Time) (chatMessageRow, error)
	CancelChallenge(context.Context, string, string, time.Time) (challengeRow, bool, error)
	DeclineChallenge(context.Context, string, string, time.Time) (challengeRow, bool, error)
	CancelStartingMatch(context.Context, string, string, time.Time) (cancelMatchRow, cancelMatchResult, error)
	ReadyMatch(context.Context, string, string, time.Time, virtualPlayerConfig) (cancelMatchRow, readyMatchResult, error)
	GetHandoffMatch(context.Context, string) (cancelMatchRow, bool, error)
	AppendLobbySystem(context.Context, string, time.Time) error
	UpsertSyntheticRoster(context.Context, string, int64, time.Time) error
	ChallengeSnapshot(context.Context, string) (challengeRow, bool, error)
}

type HandlerConfig struct {
	Store                     Store
	LobbyReadStore            lobbyReadStore
	JWTSecret                 string
	AllowedOrigins            []string
	PollAfter                 time.Duration
	EnableRoster              bool
	EnableChat                bool
	EnableChallengeResolution bool
	EnableMatchHandoffCancel  bool
	EnableMatchReady          bool
	ChallengeAccept           challengeAcceptService
	ChallengeCreate           challengeCreateService
	MatchResign               matchResignService
	MatchReadStore            matchReadStore
	MatchMoveStore            matchMoveStore
	MatchTimeout              matchTimeoutService
	MatchDisconnect           matchDisconnectService
	RatingSettlement          ratingSettlementService
	ResidentMoveOracle        residentMoveOracle
	VirtualPlayersEnabled     bool
	VirtualOwner              string
	SparringUsername          string
	Now                       func() time.Time
}

type Handler struct {
	store                     Store
	lobbyReadStore            lobbyReadStore
	secret                    []byte
	allowedOrigins            map[string]struct{}
	allowAnyOrigin            bool
	pollAfterMS               int64
	enableRoster              bool
	enableChat                bool
	enableChallengeResolution bool
	enableMatchHandoffCancel  bool
	enableMatchReady          bool
	challengeAccept           challengeAcceptService
	challengeCreate           challengeCreateService
	matchResign               matchResignService
	matchReadStore            matchReadStore
	matchMoveStore            matchMoveStore
	matchTimeout              matchTimeoutService
	matchDisconnect           matchDisconnectService
	ratingSettlement          ratingSettlementService
	residentMoveOracle        residentMoveOracle
	virtualPlayersEnabled     bool
	virtualOwner              string
	sparringUsername          string
	rosterMu                  sync.Mutex
	rosterWindows             map[string]rateWindow
	chatMu                    sync.Mutex
	chatWindows               map[string]rateWindow
	matchReadMu               sync.Mutex
	matchReadWindows          map[string]rateWindow
	matchMoveMu               sync.Mutex
	matchMoveWindows          map[string]rateWindow
	lobbyReadMu               sync.Mutex
	lobbyReadWindows          map[string]rateWindow
	now                       func() time.Time
}

type rateWindow struct {
	start time.Time
	count int
}

type virtualPlayerConfig struct {
	Enabled          bool
	Owner            string
	SparringUsername string
}

type cancelMatchRow struct {
	ID                          string    `bson:"_id"`
	White                       string    `bson:"white"`
	Black                       string    `bson:"black"`
	WhiteRating                 *int64    `bson:"white_rating"`
	BlackRating                 *int64    `bson:"black_rating"`
	FEN                         string    `bson:"fen"`
	Turn                        string    `bson:"turn"`
	Status                      string    `bson:"status"`
	Result                      *string   `bson:"result"`
	EndReason                   *string   `bson:"end_reason"`
	StartAt                     time.Time `bson:"start_at"`
	ReadyDeadline               time.Time `bson:"ready_deadline"`
	WhiteReady                  bool      `bson:"white_ready"`
	BlackReady                  bool      `bson:"black_ready"`
	WhiteClockMS                *int64    `bson:"white_clock_ms"`
	BlackClockMS                *int64    `bson:"black_clock_ms"`
	WhiteSeenAt                 time.Time `bson:"white_seen_at"`
	BlackSeenAt                 time.Time `bson:"black_seen_at"`
	WhiteDisconnectGraceStarted time.Time `bson:"white_disconnect_grace_started_at"`
	BlackDisconnectGraceStarted time.Time `bson:"black_disconnect_grace_started_at"`
	TurnStartedAt               time.Time `bson:"turn_started_at"`
	Rated                       *bool     `bson:"rated"`
	History                     []bson.M  `bson:"history"`
	Revision                    int64     `bson:"revision"`
	CreatedAt                   time.Time `bson:"created_at"`
	UpdatedAt                   time.Time `bson:"updated_at"`
}

type challengeRow struct {
	ID               string    `bson:"_id"`
	Challenger       string    `bson:"challenger"`
	Opponent         string    `bson:"opponent"`
	ChallengerRating int64     `bson:"challenger_rating"`
	OpponentRating   int64     `bson:"opponent_rating"`
	Status           string    `bson:"status"`
	MatchID          string    `bson:"match_id"`
	CreatedAt        time.Time `bson:"created_at"`
	ResolvedAt       time.Time `bson:"resolved_at"`
	CooldownUntil    time.Time `bson:"cooldown_until"`
}

func NewHandler(cfg HandlerConfig) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("pulse store is required")
	}
	secret := strings.TrimSpace(cfg.JWTSecret)
	if secret == "" {
		return nil, errors.New("JWT secret is required")
	}
	pollAfter := cfg.PollAfter
	if pollAfter <= 0 {
		pollAfter = defaultPollAfter
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	allowed := make(map[string]struct{})
	allowAny := false
	origins := append(corspolicy.CanonicalBrowserOrigins(), cfg.AllowedOrigins...)
	for _, raw := range origins {
		origin := strings.TrimSpace(raw)
		if origin == "" {
			continue
		}
		if origin == "*" {
			allowAny = true
			continue
		}
		allowed[origin] = struct{}{}
	}
	return &Handler{
		store:                     cfg.Store,
		lobbyReadStore:            present(cfg.LobbyReadStore),
		secret:                    []byte(secret),
		allowedOrigins:            allowed,
		allowAnyOrigin:            allowAny,
		pollAfterMS:               pollAfter.Milliseconds(),
		enableRoster:              cfg.EnableRoster,
		enableChat:                cfg.EnableChat,
		enableChallengeResolution: cfg.EnableChallengeResolution,
		enableMatchHandoffCancel:  cfg.EnableMatchHandoffCancel,
		enableMatchReady:          cfg.EnableMatchReady,
		challengeAccept:           present(cfg.ChallengeAccept),
		challengeCreate:           present(cfg.ChallengeCreate),
		matchResign:               present(cfg.MatchResign),
		matchReadStore:            present(cfg.MatchReadStore),
		matchMoveStore:            present(cfg.MatchMoveStore),
		matchTimeout:              present(cfg.MatchTimeout),
		matchDisconnect:           present(cfg.MatchDisconnect),
		ratingSettlement:          present(cfg.RatingSettlement),
		residentMoveOracle:        present(cfg.ResidentMoveOracle),
		virtualPlayersEnabled:     cfg.VirtualPlayersEnabled,
		virtualOwner:              strings.ToLower(strings.TrimSpace(cfg.VirtualOwner)),
		sparringUsername:          strings.ToLower(strings.TrimSpace(cfg.SparringUsername)),
		rosterWindows:             make(map[string]rateWindow),
		chatWindows:               make(map[string]rateWindow),
		matchReadWindows:          make(map[string]rateWindow),
		matchMoveWindows:          make(map[string]rateWindow),
		lobbyReadWindows:          make(map[string]rateWindow),
		now:                       now,
	}, nil
}

// present turns a typed nil (a nil *T stored in an interface) into a real
// nil interface. cmd/pvp-edge passes nil service pointers for disabled
// routes; without this every "== nil" guard on an optional dependency is
// false and a disabled route would reach a nil pointer instead of a 404.
func present[T any](value T) T {
	v := reflect.ValueOf(&value).Elem()
	if v.Kind() != reflect.Interface || v.IsNil() {
		return value
	}
	switch inner := v.Elem(); inner.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface:
		if inner.IsNil() {
			var zero T
			return zero
		}
	}
	return value
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.decorateResponse(w, r)
	route := pvproute.Match(r.URL.Path)
	if h.routeEnabled(route.Kind) {
		switch route.Kind {
		case pvproute.LobbyRead, pvproute.Roster, pvproute.ChallengeCreate:
			// Set before auth (and on OPTIONS) so deployment probes can prove the
			// exact native route answered: lobby-read is not the generic pulse,
			// roster failures are not the Python fallback or a tunnel error, and
			// challenge creation is preflighted because it carries a JSON body.
			w.Header().Set("X-Chess-Pvp-Native", route.Kind.String())
		}
	}
	if r.Method == http.MethodOptions {
		if !h.originAllowed(r.Header.Get("Origin")) {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Origen no permitido."})
			return
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, X-Client-Release, X-Presence-Session")
		w.Header().Set("Access-Control-Max-Age", "600")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	claims, err := h.authenticate(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Sesión inválida o expirada. Inicia sesión de nuevo."})
		return
	}
	exists, accountVersion, err := h.store.AuthState(r.Context(), claims.Subject)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se puede verificar la sesión temporalmente."})
		return
	}
	claimVersion := int64(0)
	if claims.SessionVersion != nil {
		claimVersion = *claims.SessionVersion
	}
	if !exists || claimVersion != accountVersion {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Sesión inválida o expirada. Inicia sesión de nuevo."})
		return
	}
	now := h.now().UTC()

	if !h.routeEnabled(route.Kind) {
		// The edge only sends enabled native routes here; anything else is not ours.
		http.NotFound(w, r)
		return
	}
	switch route.Kind {
	case pvproute.LobbyRead:
		h.serveLobbyRead(w, r, claims.Subject, now)

	case pvproute.MatchRead:
		h.serveMatchRead(w, r, claims.Subject, route.ID, now)

	case pvproute.MatchMove:
		h.serveMatchMove(w, r, claims.Subject, route.ID, now)

	case pvproute.ChallengeCreate:
		h.serveChallengeCreate(w, r, claims.Subject, now)

	case pvproute.ChallengeAccept:
		h.serveChallengeAccept(w, r, claims.Subject, route.ID, now)

	case pvproute.ChallengeCancel, pvproute.ChallengeDecline:
		h.serveChallengeResolution(w, r, claims.Subject, route.ID, challengeAction(route.Kind), now)

	case pvproute.MatchResign:
		h.serveMatchResign(w, r, claims.Subject, route.ID, now)

	case pvproute.MatchHandoffCancel:
		h.serveMatchHandoffCancel(w, r, claims.Subject, route.ID, now)

	case pvproute.MatchReady:
		h.serveMatchReady(w, r, claims.Subject, route.ID, now)

	case pvproute.LobbyChat:
		h.serveLobbyChat(w, r, claims.Subject, now)

	case pvproute.Roster:
		h.serveRoster(w, r, claims.Subject, now)

	case pvproute.MatchPulse, pvproute.LobbyPulse:
		h.servePulse(w, r, claims.Subject, route, now)
	}
}

func stamp(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func writeJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func nullableStamp(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return stamp(value)
}

func pointerString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func pointerInt64(value *int64, fallback int64) int64 {
	if value == nil {
		return fallback
	}
	return *value
}

// routeEnabled reports whether this handler serves a route. Each route's
// kill-switch or optional dependencies decide; pulses are always served.
func (h *Handler) routeEnabled(kind pvproute.Kind) bool {
	switch kind {
	case pvproute.LobbyPulse, pvproute.MatchPulse:
		return true
	case pvproute.LobbyRead:
		return h.lobbyReadStore != nil
	case pvproute.LobbyChat:
		return h.enableChat
	case pvproute.Roster:
		return h.enableRoster
	case pvproute.ChallengeCreate:
		return h.challengeCreate != nil
	case pvproute.ChallengeAccept:
		return h.challengeAccept != nil
	case pvproute.ChallengeCancel, pvproute.ChallengeDecline:
		return h.enableChallengeResolution
	case pvproute.MatchHandoffCancel:
		return h.enableMatchHandoffCancel
	case pvproute.MatchReady:
		return h.enableMatchReady
	case pvproute.MatchResign:
		return h.matchResign != nil
	case pvproute.MatchRead:
		return h.matchReadStore != nil && h.matchTimeout != nil && h.matchDisconnect != nil
	case pvproute.MatchMove:
		return h.matchMoveStore != nil && h.matchReadStore != nil && h.matchTimeout != nil && h.matchDisconnect != nil
	}
	return false
}
