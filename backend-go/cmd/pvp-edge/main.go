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

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/edge"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pulse"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentmove"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentoracle"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

func main() {
	port := env("PORT", "8080")
	upstream := env("PVP_PYTHON_UPSTREAM", "http://127.0.0.1:4000")

	pulseEnabled := envBool("PVP_NATIVE_PULSE_ENABLED", false)
	lobbyReadEnabled := envBool("PVP_NATIVE_LOBBY_READ_ENABLED", false)
	rosterEnabled := envBool("PVP_NATIVE_ROSTER_ENABLED", false)
	chatEnabled := envBool("PVP_NATIVE_CHAT_ENABLED", false)
	challengeResolutionEnabled := envBool("PVP_NATIVE_CHALLENGE_RESOLUTION_ENABLED", false)
	challengeAcceptEnabled := envBool("PVP_NATIVE_CHALLENGE_ACCEPT_ENABLED", false)
	challengeCreateEnabled := envBool("PVP_NATIVE_CHALLENGE_CREATE_ENABLED", false)
	matchHandoffCancelEnabled := envBool("PVP_NATIVE_MATCH_HANDOFF_CANCEL_ENABLED", false)
	matchReadyEnabled := envBool("PVP_NATIVE_MATCH_READY_ENABLED", false)
	matchResignEnabled := envBool("PVP_NATIVE_MATCH_RESIGN_ENABLED", false)
	matchReadEnabled := envBool("PVP_NATIVE_MATCH_READ_ENABLED", false)
	matchMoveEnabled := envBool("PVP_NATIVE_MATCH_MOVE_ENABLED", false)
	nativeResidentMoveEnabled := envBool("PVP_NATIVE_RESIDENT_MOVE_ENABLED", false)
	virtualPlayersEnabled := envBool("CHESS_PVP_SPARRING_ENABLED", false)
	// The staging owner whose private sparring rivals exist is deployment
	// configuration, never a value baked into the binary.
	virtualOwner := strings.TrimSpace(os.Getenv("CHESS_PVP_SPARRING_OWNER"))
	if virtualPlayersEnabled && virtualOwner == "" {
		log.Fatal("CHESS_PVP_SPARRING_ENABLED requires CHESS_PVP_SPARRING_OWNER")
	}
	var nativePulse http.Handler
	var nativeLobbyRead http.Handler
	var nativeRoster http.Handler
	var nativeChat http.Handler
	var nativeChallengeResolution http.Handler
	var nativeChallengeAccept http.Handler
	var nativeChallengeCreate http.Handler
	var nativeMatchHandoffCancel http.Handler
	var nativeMatchReady http.Handler
	var nativeMatchResign http.Handler
	var nativeMatchRead http.Handler
	var nativeMatchMove http.Handler
	var mongoStore *pulse.MongoStore
	if pulseEnabled || lobbyReadEnabled || rosterEnabled || chatEnabled || challengeResolutionEnabled || challengeAcceptEnabled || challengeCreateEnabled || matchHandoffCancelEnabled || matchReadyEnabled || matchResignEnabled || matchReadEnabled || matchMoveEnabled {
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
		// Python declares the same indexes while both runtimes coexist, so a
		// failure here is logged, not fatal. It means the specs drifted.
		indexCtx, cancelIndexes := context.WithTimeout(context.Background(), 10*time.Second)
		if err := store.EnsureIndexes(indexCtx); err != nil {
			log.Printf("native PvP storage: %v", err)
		}
		cancelIndexes()
		var acceptService *challengeaccept.Service
		if challengeAcceptEnabled || challengeCreateEnabled {
			acceptService, err = challengeaccept.New(challengeaccept.Config{Store: store})
			if err != nil {
				log.Fatalf("native PvP challenge accept service: %v", err)
			}
		}
		var createService *challengecreate.Service
		if challengeCreateEnabled {
			createService, err = challengecreate.New(challengecreate.Config{Store: store})
			if err != nil {
				log.Fatalf("native PvP challenge create service: %v", err)
			}
		}
		var resignService *matchresign.Service
		var timeoutService *matchtimeout.Service
		var disconnectService *matchdisconnect.Service
		var ratingService *pvprating.Service
		if matchResignEnabled {
			resignService, err = matchresign.New(matchresign.Config{Store: pulse.NewResignStore(store)})
			if err != nil {
				log.Fatalf("native PvP resign service: %v", err)
			}
		}
		if matchReadEnabled || matchMoveEnabled {
			timeoutService, err = matchtimeout.New(matchtimeout.Config{Store: pulse.NewTimeoutStore(store)})
			if err != nil {
				log.Fatalf("native PvP timeout service: %v", err)
			}
			disconnectService, err = matchdisconnect.New(matchdisconnect.Config{Store: pulse.NewDisconnectStore(store)})
			if err != nil {
				log.Fatalf("native PvP disconnect service: %v", err)
			}
		}
		if matchResignEnabled || matchReadEnabled || matchMoveEnabled {
			ratingService, err = pvprating.New(store)
			if err != nil {
				log.Fatalf("native PvP rating settlement service: %v", err)
			}
		}
		var moveStore *pulse.MoveStore
		var residentMoves residentMoveProvider
		if matchMoveEnabled {
			moveStore = pulse.NewMoveStore(store)
			residentMoves, err = newResidentMoveProvider(nativeResidentMoveEnabled, upstream, jwtSecret)
			if err != nil {
				log.Fatalf("native PvP resident move provider: %v", err)
			}
		}
		var lobbyReadStore *pulse.MongoStore
		if lobbyReadEnabled {
			lobbyReadStore = store
		}
		pulseHandler, err := pulse.NewHandler(pulse.HandlerConfig{
			Store:                     store,
			LobbyReadStore:            lobbyReadStore,
			JWTSecret:                 jwtSecret,
			AllowedOrigins:            splitCSV(os.Getenv("CORS_ORIGINS")),
			EnableRoster:              rosterEnabled,
			EnableChat:                chatEnabled,
			EnableChallengeResolution: challengeResolutionEnabled,
			ChallengeAccept:           acceptService,
			ChallengeCreate:           createService,
			MatchResign:               resignService,
			MatchReadStore:            store,
			MatchMoveStore:            moveStore,
			MatchTimeout:              timeoutService,
			MatchDisconnect:           disconnectService,
			RatingSettlement:          ratingService,
			ResidentMoveOracle:        residentMoves,
			EnableMatchHandoffCancel:  matchHandoffCancelEnabled,
			EnableMatchReady:          matchReadyEnabled,
			VirtualPlayersEnabled:     virtualPlayersEnabled,
			VirtualOwner:              virtualOwner,
			SparringUsername:          env("CHESS_PVP_SPARRING_USERNAME", "sparringmeister"),
		})
		if err != nil {
			log.Fatalf("native PvP pulse handler: %v", err)
		}
		if pulseEnabled {
			nativePulse = pulseHandler
		}
		if lobbyReadEnabled {
			nativeLobbyRead = pulseHandler
		}
		if rosterEnabled {
			nativeRoster = pulseHandler
		}
		if chatEnabled {
			nativeChat = pulseHandler
		}
		if challengeResolutionEnabled {
			nativeChallengeResolution = pulseHandler
		}
		if challengeAcceptEnabled {
			nativeChallengeAccept = pulseHandler
		}
		if challengeCreateEnabled {
			nativeChallengeCreate = pulseHandler
		}
		if matchHandoffCancelEnabled {
			nativeMatchHandoffCancel = pulseHandler
		}
		if matchReadyEnabled {
			nativeMatchReady = pulseHandler
		}
		if matchResignEnabled {
			nativeMatchResign = pulseHandler
		}
		if matchReadEnabled {
			nativeMatchRead = pulseHandler
		}
		if matchMoveEnabled {
			nativeMatchMove = pulseHandler
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

	var readyChecks map[string]func(context.Context) error
	if mongoStore != nil {
		readyChecks = map[string]func(context.Context) error{"mongodb": mongoStore.Ping}
	}

	requestTelemetry := newRequestTelemetry()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := requestTelemetry.Shutdown(ctx); err != nil {
			log.Printf("request telemetry flush: %v", err)
		}
	}()

	handler, err := edge.New(edge.Config{
		UpstreamURL:               upstream,
		Release:                   os.Getenv("GIT_COMMIT_SHA"),
		ReadyTimeout:              2 * time.Second,
		NativePulse:               nativePulse,
		NativeLobbyRead:           nativeLobbyRead,
		NativeRoster:              nativeRoster,
		NativeChat:                nativeChat,
		NativeChallengeResolution: nativeChallengeResolution,
		NativeChallengeAccept:     nativeChallengeAccept,
		NativeChallengeCreate:     nativeChallengeCreate,
		NativeMatchHandoffCancel:  nativeMatchHandoffCancel,
		NativeMatchReady:          nativeMatchReady,
		NativeMatchResign:         nativeMatchResign,
		NativeMatchRead:           nativeMatchRead,
		NativeMatchMove:           nativeMatchMove,
		VirtualPlayersEnabled:     virtualPlayersEnabled,
		NativeResidentMove:        matchMoveEnabled && nativeResidentMoveEnabled,
		ReadyChecks:               readyChecks,
		Telemetry:                 requestTelemetry,
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

	log.Printf("pvp-go listening on :%s -> %s native_pulse=%t native_lobby_read=%t native_roster=%t native_chat=%t native_challenge_resolution=%t native_challenge_accept=%t native_challenge_create=%t native_match_handoff_cancel=%t native_match_ready=%t native_match_resign=%t native_match_read=%t native_match_move=%t native_resident_move=%t", port, upstream, nativePulse != nil, nativeLobbyRead != nil, nativeRoster != nil, nativeChat != nil, nativeChallengeResolution != nil, nativeChallengeAccept != nil, nativeChallengeCreate != nil, nativeMatchHandoffCancel != nil, nativeMatchReady != nil, nativeMatchResign != nil, nativeMatchRead != nil, nativeMatchMove != nil, nativeResidentMoveEnabled)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("pvp edge serve: %v", err)
	}
}

// newRequestTelemetry gives the routes Go serves natively the metrics and
// access log Python gives every request. It is fail-open: a bad exporter
// configuration only loses that signal. GO_REQUEST_TELEMETRY_ENABLED=false
// turns it off entirely.
func newRequestTelemetry() *telemetry.Recorder {
	if !envBool("GO_REQUEST_TELEMETRY_ENABLED", true) {
		return nil
	}
	cfg := telemetry.ConfigFromEnv(os.LookupEnv)
	secret := []byte(strings.TrimSpace(os.Getenv("JWT_SECRET")))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	recorder, err := telemetry.New(ctx, cfg, telemetry.Options{
		Username: func(r *http.Request) string {
			return pulse.VerifiedSubject(r.Header.Get("Authorization"), secret, time.Now())
		},
	})
	if err != nil {
		log.Printf("request telemetry degraded: %v", err)
	}
	log.Printf("request telemetry service=%s metrics=%t logs=%t", cfg.ServiceName, cfg.MetricsEnabled, cfg.LogsEnabled)
	return recorder
}

type residentMoveProvider interface {
	Move(context.Context, string, string) (string, error)
}

func newResidentMoveProvider(native bool, upstream, jwtSecret string) (residentMoveProvider, error) {
	if native {
		return residentmove.New(), nil
	}
	return residentoracle.New(residentoracle.Config{
		UpstreamURL: upstream,
		JWTSecret:   jwtSecret,
	})
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
