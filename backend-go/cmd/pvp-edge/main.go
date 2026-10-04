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

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/edge"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamesapi"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pulse"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentmove"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentoracle"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

func main() {
	port := env("PORT", "8080")
	upstream := env("PVP_PYTHON_UPSTREAM", "http://127.0.0.1:4000")

	features := loadNativeFeatureFlags()
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
	var nativeGamesRead http.Handler
	var mongoStore *pulse.MongoStore
	if features.needsMongo() {
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
		if features.challengeAccept || features.challengeCreate {
			acceptService, err = challengeaccept.New(challengeaccept.Config{Store: store})
			if err != nil {
				log.Fatalf("native PvP challenge accept service: %v", err)
			}
		}
		var createService *challengecreate.Service
		if features.challengeCreate {
			createService, err = challengecreate.New(challengecreate.Config{Store: store})
			if err != nil {
				log.Fatalf("native PvP challenge create service: %v", err)
			}
		}
		var resignService *matchresign.Service
		var timeoutService *matchtimeout.Service
		var disconnectService *matchdisconnect.Service
		var ratingService *pvprating.Service
		if features.matchResign {
			resignService, err = matchresign.New(matchresign.Config{Store: pulse.NewResignStore(store)})
			if err != nil {
				log.Fatalf("native PvP resign service: %v", err)
			}
		}
		if features.matchRead || features.matchMove {
			timeoutService, err = matchtimeout.New(matchtimeout.Config{Store: pulse.NewTimeoutStore(store)})
			if err != nil {
				log.Fatalf("native PvP timeout service: %v", err)
			}
			disconnectService, err = matchdisconnect.New(matchdisconnect.Config{Store: pulse.NewDisconnectStore(store)})
			if err != nil {
				log.Fatalf("native PvP disconnect service: %v", err)
			}
		}
		if features.matchResign || features.matchRead || features.matchMove {
			ratingService, err = pvprating.New(store)
			if err != nil {
				log.Fatalf("native PvP rating settlement service: %v", err)
			}
		}
		var moveStore *pulse.MoveStore
		var residentMoves residentMoveProvider
		if features.matchMove {
			moveStore = pulse.NewMoveStore(store)
			residentMoves, err = newResidentMoveProvider(features.residentMove, upstream, jwtSecret)
			if err != nil {
				log.Fatalf("native PvP resident move provider: %v", err)
			}
		}
		var lobbyReadStore *pulse.MongoStore
		if features.lobbyRead {
			lobbyReadStore = store
		}
		pulseHandler, err := pulse.NewHandler(pulse.HandlerConfig{
			Store:                     store,
			LobbyReadStore:            lobbyReadStore,
			JWTSecret:                 jwtSecret,
			AllowedOrigins:            splitCSV(os.Getenv("CORS_ORIGINS")),
			EnableRoster:              features.roster,
			EnableChat:                features.chat,
			EnableChallengeResolution: features.challengeResolution,
			ChallengeAccept:           acceptService,
			ChallengeCreate:           createService,
			MatchResign:               resignService,
			MatchReadStore:            store,
			MatchMoveStore:            moveStore,
			MatchTimeout:              timeoutService,
			MatchDisconnect:           disconnectService,
			RatingSettlement:          ratingService,
			ResidentMoveOracle:        residentMoves,
			EnableMatchHandoffCancel:  features.matchHandoffCancel,
			EnableMatchReady:          features.matchReady,
			VirtualPlayersEnabled:     virtualPlayersEnabled,
			VirtualOwner:              virtualOwner,
			SparringUsername:          env("CHESS_PVP_SPARRING_USERNAME", "sparringmeister"),
		})
		if err != nil {
			log.Fatalf("native PvP pulse handler: %v", err)
		}
		if features.pulse {
			nativePulse = pulseHandler
		}
		if features.gamesRead {
			gamesHandler, err := gamesapi.New(gamesapi.Config{
				Store:           gamestore.New(store.Database(), envDurationMS("GAMES_MONGO_TIMEOUT_MS", 2000*time.Millisecond)),
				Accounts:        store,
				Presence:        presence.New(store.Database(), telemetry.ConfigFromEnv(os.LookupEnv).TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetry.ConfigFromEnv(os.LookupEnv).TrustCloudflare,
			})
			if err != nil {
				log.Fatalf("native games API: %v", err)
			}
			nativeGamesRead = gamesHandler
		}
		if features.lobbyRead {
			nativeLobbyRead = pulseHandler
		}
		if features.roster {
			nativeRoster = pulseHandler
		}
		if features.chat {
			nativeChat = pulseHandler
		}
		if features.challengeResolution {
			nativeChallengeResolution = pulseHandler
		}
		if features.challengeAccept {
			nativeChallengeAccept = pulseHandler
		}
		if features.challengeCreate {
			nativeChallengeCreate = pulseHandler
		}
		if features.matchHandoffCancel {
			nativeMatchHandoffCancel = pulseHandler
		}
		if features.matchReady {
			nativeMatchReady = pulseHandler
		}
		if features.matchResign {
			nativeMatchResign = pulseHandler
		}
		if features.matchRead {
			nativeMatchRead = pulseHandler
		}
		if features.matchMove {
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
		NativeGamesRead:           nativeGamesRead,
		VirtualPlayersEnabled:     virtualPlayersEnabled,
		NativeResidentMove:        features.matchMove && features.residentMove,
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

	log.Printf("pvp-go listening on :%s -> %s native_pulse=%t native_lobby_read=%t native_roster=%t native_chat=%t native_challenge_resolution=%t native_challenge_accept=%t native_challenge_create=%t native_match_handoff_cancel=%t native_match_ready=%t native_match_resign=%t native_match_read=%t native_match_move=%t native_resident_move=%t native_games_read=%t", port, upstream, nativePulse != nil, nativeLobbyRead != nil, nativeRoster != nil, nativeChat != nil, nativeChallengeResolution != nil, nativeChallengeAccept != nil, nativeChallengeCreate != nil, nativeMatchHandoffCancel != nil, nativeMatchReady != nil, nativeMatchResign != nil, nativeMatchRead != nil, nativeMatchMove != nil, features.residentMove, nativeGamesRead != nil)
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
			return sessionauth.VerifiedSubject(r.Header.Get("Authorization"), secret, time.Now())
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
