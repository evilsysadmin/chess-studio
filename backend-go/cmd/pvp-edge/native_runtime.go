package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/authguard"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesrun"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/edge"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/feedbackstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamesapi"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/ipgeo"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/mongoruntime"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/narrative"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pulse"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/resetmail"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentmove"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentoracle"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/userdata"
)

type nativeRuntime struct {
	pulse               http.Handler
	lobbyRead           http.Handler
	roster              http.Handler
	chat                http.Handler
	challengeResolution http.Handler
	challengeAccept     http.Handler
	challengeCreate     http.Handler
	matchHandoffCancel  http.Handler
	matchReady          http.Handler
	matchResign         http.Handler
	matchRead           http.Handler
	matchMove           http.Handler
	gamesRead           http.Handler
	gamesWrite          http.Handler
	gamesHint           http.Handler
	gamesAnalyze        http.Handler
	profile             http.Handler
	authSession         http.Handler
	// login is built in edgeConfig, once request telemetry exists.
	login    *gamesapi.LoginConfig
	account  http.Handler
	recovery http.Handler
	feedback http.Handler
	matthias http.Handler
	// narrative is built in edgeConfig, once the log recorder exists.
	narrative      *gamesapi.NarrativeConfig
	pawnSlug       http.Handler
	chronicles     http.Handler
	chroniclesRuns http.Handler
	adminFeedback  http.Handler
	adminUsers     http.Handler
	// system is built in edgeConfig, once request telemetry exists.
	system *gamesapi.SystemConfig
	// history is Admin's observability history (nil when disabled).
	history        *obshistory.Recorder
	mongo          *mongoruntime.Runtime
	virtualPlayers bool
	residentMove   bool
}

func buildNativeRuntime(features nativeFeatureFlags, upstream string) (runtime nativeRuntime, err error) {
	runtime.virtualPlayers = envBool("CHESS_PVP_SPARRING_ENABLED", false)
	virtualOwner := strings.TrimSpace(os.Getenv("CHESS_PVP_SPARRING_OWNER"))
	if runtime.virtualPlayers && virtualOwner == "" {
		return runtime, fmt.Errorf("CHESS_PVP_SPARRING_ENABLED requires CHESS_PVP_SPARRING_OWNER")
	}
	runtime.residentMove = features.matchMove && features.residentMove

	if !features.needsMongo() {
		return runtime, nil
	}

	mongoURL := strings.TrimSpace(os.Getenv("MONGO_URL"))
	mongoDatabase := strings.TrimSpace(os.Getenv("MONGO_DB_NAME"))
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if mongoURL == "" || mongoDatabase == "" || jwtSecret == "" {
		return runtime, fmt.Errorf("native Go features require MONGO_URL, MONGO_DB_NAME and JWT_SECRET")
	}

	pvpMongoTimeout := envDurationMS("PVP_MONGO_TIMEOUT_MS", 2000*time.Millisecond)
	startupCtx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	mongoRuntime, err := mongoruntime.New(startupCtx, mongoruntime.Config{
		URL:             mongoURL,
		Database:        mongoDatabase,
		QueryTimeout:    pvpMongoTimeout,
		ApplicationName: mongoruntime.DefaultApplicationName,
	})
	cancel()
	if err != nil {
		return runtime, fmt.Errorf("native Go Mongo runtime: %w", err)
	}
	runtime.mongo = mongoRuntime
	defer func() {
		if err == nil || runtime.mongo == nil {
			return
		}
		closeCtx, closeCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer closeCancel()
		_ = runtime.mongo.Close(closeCtx)
		runtime.mongo = nil
	}()

	// Admin's observability history: native requests land in the same
	// 5-minute buckets as Python's (GO_OBSERVABILITY_HISTORY_ENABLED).
	if envBool("GO_OBSERVABILITY_HISTORY_ENABLED", true) {
		historyStore, historyErr := obshistory.NewMongoStore(mongoRuntime.Database())
		if historyErr != nil {
			log.Printf("observability history disabled: %v", historyErr)
		} else {
			runtime.history = obshistory.New(historyStore)
		}
	}

	store, err := pulse.NewMongoStoreFromDatabase(mongoRuntime.Database(), pvpMongoTimeout)
	if err != nil {
		return runtime, fmt.Errorf("native PvP storage: %w", err)
	}

	// Python declares the same indexes while both runtimes coexist, so drift is
	// logged but does not make startup fatal during the strangler window.
	indexCtx, cancelIndexes := context.WithTimeout(context.Background(), 10*time.Second)
	if indexErr := store.EnsureIndexes(indexCtx); indexErr != nil {
		log.Printf("native PvP storage: %v", indexErr)
	}
	cancelIndexes()

	var acceptService *challengeaccept.Service
	if features.challengeAccept || features.challengeCreate {
		acceptService, err = challengeaccept.New(challengeaccept.Config{Store: store})
		if err != nil {
			return runtime, fmt.Errorf("native PvP challenge accept service: %w", err)
		}
	}

	var createService *challengecreate.Service
	if features.challengeCreate {
		createService, err = challengecreate.New(challengecreate.Config{Store: store})
		if err != nil {
			return runtime, fmt.Errorf("native PvP challenge create service: %w", err)
		}
	}

	var resignService *matchresign.Service
	var timeoutService *matchtimeout.Service
	var disconnectService *matchdisconnect.Service
	var ratingService *pvprating.Service
	if features.matchResign {
		resignService, err = matchresign.New(matchresign.Config{Store: pulse.NewResignStore(store)})
		if err != nil {
			return runtime, fmt.Errorf("native PvP resign service: %w", err)
		}
	}
	if features.matchRead || features.matchMove {
		timeoutService, err = matchtimeout.New(matchtimeout.Config{Store: pulse.NewTimeoutStore(store)})
		if err != nil {
			return runtime, fmt.Errorf("native PvP timeout service: %w", err)
		}
		disconnectService, err = matchdisconnect.New(matchdisconnect.Config{Store: pulse.NewDisconnectStore(store)})
		if err != nil {
			return runtime, fmt.Errorf("native PvP disconnect service: %w", err)
		}
	}
	if features.matchResign || features.matchRead || features.matchMove {
		ratingService, err = pvprating.New(store)
		if err != nil {
			return runtime, fmt.Errorf("native PvP rating settlement service: %w", err)
		}
	}

	var moveStore *pulse.MoveStore
	var residentMoves residentMoveProvider
	if features.matchMove {
		moveStore = pulse.NewMoveStore(store)
		residentMoves, err = newResidentMoveProvider(features.residentMove, upstream, jwtSecret)
		if err != nil {
			return runtime, fmt.Errorf("native PvP resident move provider: %w", err)
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
		VirtualPlayersEnabled:     runtime.virtualPlayers,
		VirtualOwner:              virtualOwner,
		SparringUsername:          env("CHESS_PVP_SPARRING_USERNAME", "sparringmeister"),
	})
	if err != nil {
		return runtime, fmt.Errorf("native PvP pulse handler: %w", err)
	}

	if features.pulse {
		runtime.pulse = pulseHandler
	}
	if features.lobbyRead {
		runtime.lobbyRead = pulseHandler
	}
	if features.roster {
		runtime.roster = pulseHandler
	}
	if features.chat {
		runtime.chat = pulseHandler
	}
	if features.challengeResolution {
		runtime.challengeResolution = pulseHandler
	}
	if features.challengeAccept {
		runtime.challengeAccept = pulseHandler
	}
	if features.challengeCreate {
		runtime.challengeCreate = pulseHandler
	}
	if features.matchHandoffCancel {
		runtime.matchHandoffCancel = pulseHandler
	}
	if features.matchReady {
		runtime.matchReady = pulseHandler
	}
	if features.matchResign {
		runtime.matchResign = pulseHandler
	}
	if features.matchRead {
		runtime.matchRead = pulseHandler
	}
	if features.matchMove {
		runtime.matchMove = pulseHandler
	}

	if features.gamesRead {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		gamesHandler, gamesErr := gamesapi.New(gamesapi.Config{
			Store:           gamestore.New(mongoRuntime.Database(), envDurationMS("GAMES_MONGO_TIMEOUT_MS", 2000*time.Millisecond)),
			Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
			JWTSecret:       jwtSecret,
			AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
			TrustCloudflare: telemetryCfg.TrustCloudflare,
		})
		if gamesErr != nil {
			return runtime, fmt.Errorf("native games API: %w", gamesErr)
		}
		runtime.gamesRead = gamesHandler
	}
	// One engine pool per process, like engine_runtime: gameplay (CPU reply,
	// hints) waits its turn, optional analysis is shed when busy.
	enginePool := gamesapi.EnginePoolFromEnv(os.Getenv("CHESS_ENGINE_WORKERS"), os.Getenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT"))
	if features.gamesWrite {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		writesHandler, writesErr := gamesapi.NewWrites(gamesapi.WriteConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Store: gamestore.New(mongoRuntime.Database(), envDurationMS("GAMES_MONGO_TIMEOUT_MS", 2000*time.Millisecond)),
			CPU:   residentmove.New(),
			Pool:  enginePool,
		})
		if writesErr != nil {
			return runtime, fmt.Errorf("native games write API: %w", writesErr)
		}
		runtime.gamesWrite = writesHandler
	}
	if features.gamesHint {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		hintHandler, hintErr := gamesapi.NewHint(gamesapi.HintConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Store:  gamestore.New(mongoRuntime.Database(), envDurationMS("GAMES_MONGO_TIMEOUT_MS", 2000*time.Millisecond)),
			Engine: residentsearch.New(),
			Pool:   enginePool,
		})
		if hintErr != nil {
			return runtime, fmt.Errorf("native games hint API: %w", hintErr)
		}
		runtime.gamesHint = hintHandler
	}
	if features.system {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		runtime.system = &gamesapi.SystemConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Counter:          accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			AdminUsernames:   splitCSV(os.Getenv("ADMIN_USERNAMES")),
			DisabledFeatures: os.Getenv("CHESS_DISABLED_FEATURES"),
			BillingSecret:    os.Getenv("CHESS_AI_SHARED_SECRET"),
		}
		if runtime.history != nil {
			runtime.system.History = runtime.history
		}
	}
	if features.profile {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		profileHandler, profileErr := gamesapi.NewProfile(gamesapi.ProfileConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Profiles: profilestore.New(profilestore.NewMongo(mongoRuntime.Database(), envDurationMS("PROFILE_MONGO_TIMEOUT_MS", 2000*time.Millisecond))),
		})
		if profileErr != nil {
			return runtime, fmt.Errorf("native profile API: %w", profileErr)
		}
		runtime.profile = profileHandler
	}
	if features.authSession {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		// One toucher for the request touch and the heartbeat: a forced
		// write coalesces the next touches, as Python's single map does.
		toucher := presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second)
		sessionHandler, sessionErr := gamesapi.NewSession(gamesapi.SessionConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        toucher,
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Emails:               accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Sessions:             presence.NewSessions(presence.NewMongoSessions(mongoRuntime.Database()), toucher, 2*time.Second),
			AdminUsernames:       splitCSV(os.Getenv("ADMIN_USERNAMES")),
			EmailRecoveryEnabled: pythonFlag("ENABLE_EMAIL_RECOVERY", "false"),
		})
		if sessionErr != nil {
			return runtime, fmt.Errorf("native session API: %w", sessionErr)
		}
		runtime.authSession = sessionHandler
	}
	if features.login {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		toucher := presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second)
		guardTimeout := envDurationMS("AUTH_GUARD_MONGO_TIMEOUT_MS", 2000*time.Millisecond)
		runtime.login = &gamesapi.LoginConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        toucher,
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			LoginAccounts:   accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			IdentityGuard:   authguard.New(authguard.LoginIdentity, authguard.NewMongo(mongoRuntime.Database(), authguard.LoginIdentity, guardTimeout)),
			IPGuard:         authguard.New(authguard.ClientIP, authguard.NewMongo(mongoRuntime.Database(), authguard.ClientIP, guardTimeout)),
			Touch:           presence.NewSessions(presence.NewMongoSessions(mongoRuntime.Database()), toucher, 2*time.Second),
			Environment:     os.Getenv("ENVIRONMENT"),
			SyntheticSecret: os.Getenv("CHESS_AI_SHARED_SECRET"),
		}
	}
	if features.account {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		toucher := presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second)
		purgeStore := userdata.NewMongo(mongoRuntime.Database(), envDurationMS("USER_PURGE_MONGO_TIMEOUT_MS", 5000*time.Millisecond))
		accountHandler, accountErr := gamesapi.NewAccount(gamesapi.AccountConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        toucher,
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Store: accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Purge: func(ctx context.Context, username string) (userdata.Purged, error) {
				return userdata.Purge(ctx, purgeStore, username)
			},
			IPGuard:              authguard.New(authguard.ClientIP, authguard.NewMongo(mongoRuntime.Database(), authguard.ClientIP, envDurationMS("AUTH_GUARD_MONGO_TIMEOUT_MS", 2000*time.Millisecond))),
			Touch:                presence.NewSessions(presence.NewMongoSessions(mongoRuntime.Database()), toucher, 2*time.Second),
			AllowRegistration:    pythonFlag("ALLOW_REGISTRATION", "true"),
			InviteCode:           os.Getenv("INVITE_CODE"),
			EmailRecoveryEnabled: pythonFlag("ENABLE_EMAIL_RECOVERY", "false"),
			Environment:          os.Getenv("ENVIRONMENT"),
			SyntheticSecret:      os.Getenv("CHESS_AI_SHARED_SECRET"),
		})
		if accountErr != nil {
			return runtime, fmt.Errorf("native account API: %w", accountErr)
		}
		runtime.account = accountHandler
	}
	if features.recovery {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		toucher := presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second)
		recoveryHandler, recoveryErr := gamesapi.NewRecovery(gamesapi.RecoveryConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        toucher,
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			LoginAccounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Store:                accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Mailer:               resetmail.New(os.Getenv("RESEND_API_KEY"), os.Getenv("PASSWORD_RESET_FROM"), os.Getenv("ENVIRONMENT")),
			Touch:                presence.NewSessions(presence.NewMongoSessions(mongoRuntime.Database()), toucher, 2*time.Second),
			EmailRecoveryEnabled: pythonFlag("ENABLE_EMAIL_RECOVERY", "false"),
			ResetURL:             os.Getenv("PASSWORD_RESET_URL"),
			Environment:          os.Getenv("ENVIRONMENT"),
			SyntheticSecret:      os.Getenv("CHESS_AI_SHARED_SECRET"),
		})
		if recoveryErr != nil {
			return runtime, fmt.Errorf("native recovery API: %w", recoveryErr)
		}
		runtime.recovery = recoveryHandler
	}
	if features.feedback {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		feedbackHandler, feedbackErr := gamesapi.NewFeedback(gamesapi.FeedbackConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Feedback: feedbackstore.New(mongoRuntime.Database(), pvpMongoTimeout),
		})
		if feedbackErr != nil {
			return runtime, fmt.Errorf("native feedback API: %w", feedbackErr)
		}
		runtime.feedback = feedbackHandler
	}
	if features.matthiasRead {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		matthiasHandler, matthiasErr := gamesapi.NewMatthias(gamesapi.MatthiasConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Matthias:       matthiasmem.New(mongoRuntime.Database(), pvpMongoTimeout),
			AdminUsernames: splitCSV(os.Getenv("ADMIN_USERNAMES")),
		})
		if matthiasErr != nil {
			return runtime, fmt.Errorf("native matthias API: %w", matthiasErr)
		}
		runtime.matthias = matthiasHandler
	}
	if features.pawnSlug {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		pawnSlugHandler, pawnSlugErr := gamesapi.NewPawnSlug(gamesapi.Config{
			Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
			JWTSecret:       jwtSecret,
			AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
			TrustCloudflare: telemetryCfg.TrustCloudflare,
		})
		if pawnSlugErr != nil {
			return runtime, fmt.Errorf("native pawn slug API: %w", pawnSlugErr)
		}
		runtime.pawnSlug = pawnSlugHandler
	}
	if features.chronicles {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		chroniclesHandler, chroniclesErr := gamesapi.NewChronicles(gamesapi.Config{
			Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
			JWTSecret:       jwtSecret,
			AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
			TrustCloudflare: telemetryCfg.TrustCloudflare,
		})
		if chroniclesErr != nil {
			return runtime, fmt.Errorf("native chronicles API: %w", chroniclesErr)
		}
		runtime.chronicles = chroniclesHandler
	}
	if features.chroniclesRuns {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		runsHandler, runsErr := gamesapi.NewChroniclesRuns(gamesapi.ChroniclesRunsConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Runs: chroniclesrun.NewMongo(mongoRuntime.Database(), pvpMongoTimeout),
		})
		if runsErr != nil {
			return runtime, fmt.Errorf("native chronicles runs API: %w", runsErr)
		}
		runtime.chroniclesRuns = runsHandler
	}
	if features.adminFeedback {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		adminFeedbackHandler, adminFeedbackErr := gamesapi.NewAdminFeedback(gamesapi.AdminFeedbackConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Feedback:       feedbackstore.New(mongoRuntime.Database(), pvpMongoTimeout),
			AdminUsernames: splitCSV(os.Getenv("ADMIN_USERNAMES")),
		})
		if adminFeedbackErr != nil {
			return runtime, fmt.Errorf("native admin feedback API: %w", adminFeedbackErr)
		}
		runtime.adminFeedback = adminFeedbackHandler
	}
	if features.adminUsers {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		purgeStore := userdata.NewMongo(mongoRuntime.Database(), envDurationMS("USER_PURGE_MONGO_TIMEOUT_MS", 5000*time.Millisecond))
		adminUsersHandler, adminUsersErr := gamesapi.NewAdminUsers(gamesapi.AdminUsersConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Users:    accountstore.New(mongoRuntime.Database(), envDurationMS("ADMIN_USERS_MONGO_TIMEOUT_MS", 5000*time.Millisecond)),
			Profiles: profilestore.New(profilestore.NewMongo(mongoRuntime.Database(), envDurationMS("ADMIN_USERS_MONGO_TIMEOUT_MS", 5000*time.Millisecond))),
			Matthias: matthiasmem.New(mongoRuntime.Database(), pvpMongoTimeout),
			Purge: func(ctx context.Context, username string) (userdata.Purged, error) {
				return userdata.Purge(ctx, purgeStore, username)
			},
			Countries:      ipgeo.New(nil),
			NetworkStatus:  ipgeo.Status,
			AdminUsernames: splitCSV(os.Getenv("ADMIN_USERNAMES")),
		})
		if adminUsersErr != nil {
			return runtime, fmt.Errorf("native admin users API: %w", adminUsersErr)
		}
		runtime.adminUsers = adminUsersHandler
	}
	if features.narrative {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		runtime.narrative = &gamesapi.NarrativeConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Memory:         matthiasmem.New(mongoRuntime.Database(), pvpMongoTimeout),
			AdminUsernames: splitCSV(os.Getenv("ADMIN_USERNAMES")),
		}
	}
	if features.gamesAnalyze {
		telemetryCfg := telemetry.ConfigFromEnv(os.LookupEnv)
		analyzeHandler, analyzeErr := gamesapi.NewAnalyze(gamesapi.AnalyzeConfig{
			Config: gamesapi.Config{
				Accounts:        accountstore.New(mongoRuntime.Database(), pvpMongoTimeout),
				Presence:        presence.New(mongoRuntime.Database(), telemetryCfg.TrustCloudflare, 2*time.Second),
				JWTSecret:       jwtSecret,
				AllowedOrigins:  splitCSV(os.Getenv("CORS_ORIGINS")),
				TrustCloudflare: telemetryCfg.TrustCloudflare,
			},
			Mover:    residentmove.NewEngineMover(),
			Analyzer: residentsearch.New(),
			Pool:     enginePool,
			APIKeys:  splitCSV(os.Getenv("M2M_API_KEYS")),
		})
		if analyzeErr != nil {
			return runtime, fmt.Errorf("native analysis API: %w", analyzeErr)
		}
		runtime.gamesAnalyze = analyzeHandler
	}

	return runtime, nil
}

func (r nativeRuntime) close(ctx context.Context) error {
	if r.mongo == nil {
		return nil
	}
	return r.mongo.Close(ctx)
}

func (r nativeRuntime) edgeConfig(upstream, release string, requestTelemetry *telemetry.Recorder) edge.Config {
	var system http.Handler
	if r.system != nil {
		cfg := *r.system
		if requestTelemetry != nil {
			cfg.Metrics = requestTelemetry
			cfg.BillingMetrics = requestTelemetry
		}
		if handler, err := gamesapi.NewSystem(cfg); err != nil {
			log.Printf("native system routes disabled: %v", err)
		} else {
			system = handler
		}
	}
	var login http.Handler
	if r.login != nil {
		cfg := *r.login
		if requestTelemetry != nil {
			cfg.FailureLog = requestTelemetry
		}
		if handler, err := gamesapi.NewLogin(cfg); err != nil {
			log.Printf("native login disabled: %v", err)
		} else {
			login = handler
		}
	}
	var narrativeHandler http.Handler
	if r.narrative != nil {
		cfg := *r.narrative
		logLine := func(string) {}
		if requestTelemetry != nil {
			logLine = requestTelemetry.LogLine
		}
		cfg.Gateway = narrative.New(narrative.Config{History: r.history, Log: logLine})
		cfg.Log = logLine
		if handler, err := gamesapi.NewNarrative(cfg); err != nil {
			log.Printf("native narrative disabled: %v", err)
		} else {
			narrativeHandler = handler
		}
	}
	var readyChecks map[string]func(context.Context) error
	if r.mongo != nil {
		readyChecks = map[string]func(context.Context) error{"mongodb": r.mongo.Ping}
	}
	return edge.Config{
		UpstreamURL:               upstream,
		Release:                   release,
		ReadyTimeout:              2 * time.Second,
		NativePulse:               r.pulse,
		NativeLobbyRead:           r.lobbyRead,
		NativeRoster:              r.roster,
		NativeChat:                r.chat,
		NativeChallengeResolution: r.challengeResolution,
		NativeChallengeAccept:     r.challengeAccept,
		NativeChallengeCreate:     r.challengeCreate,
		NativeMatchHandoffCancel:  r.matchHandoffCancel,
		NativeMatchReady:          r.matchReady,
		NativeMatchResign:         r.matchResign,
		NativeMatchRead:           r.matchRead,
		NativeMatchMove:           r.matchMove,
		NativeGamesRead:           r.gamesRead,
		NativeGamesWrite:          r.gamesWrite,
		NativeGamesHint:           r.gamesHint,
		NativeGamesAnalyze:        r.gamesAnalyze,
		NativeSystem:              system,
		NativeProfile:             r.profile,
		NativeSession:             r.authSession,
		NativeLogin:               login,
		NativeAccount:             r.account,
		NativeRecovery:            r.recovery,
		NativeFeedback:            r.feedback,
		NativeMatthias:            r.matthias,
		NativeNarrative:           narrativeHandler,
		NativePawnSlug:            r.pawnSlug,
		NativeChronicles:          r.chronicles,
		NativeChroniclesRuns:      r.chroniclesRuns,
		NativeAdminFeedback:       r.adminFeedback,
		NativeAdminUsers:          r.adminUsers,
		VirtualPlayersEnabled:     r.virtualPlayers,
		NativeResidentMove:        r.residentMove,
		ReadyChecks:               readyChecks,
		Telemetry:                 requestTelemetry,
	}
}

func (r nativeRuntime) logStartup(port, upstream string) {
	log.Printf(
		"go-api listening on :%s -> %s native_pulse=%t native_lobby_read=%t native_roster=%t native_chat=%t native_challenge_resolution=%t native_challenge_accept=%t native_challenge_create=%t native_match_handoff_cancel=%t native_match_ready=%t native_match_resign=%t native_match_read=%t native_match_move=%t native_resident_move=%t native_games_read=%t native_games_write=%t native_games_hint=%t native_games_analyze=%t native_system=%t native_profile=%t native_auth_session=%t native_login=%t native_account=%t native_recovery=%t native_feedback=%t native_matthias_read=%t native_narrative=%t native_pawn_slug=%t native_chronicles=%t native_chronicles_runs=%t native_admin_feedback=%t native_admin_users=%t",
		port,
		upstream,
		r.pulse != nil,
		r.lobbyRead != nil,
		r.roster != nil,
		r.chat != nil,
		r.challengeResolution != nil,
		r.challengeAccept != nil,
		r.challengeCreate != nil,
		r.matchHandoffCancel != nil,
		r.matchReady != nil,
		r.matchResign != nil,
		r.matchRead != nil,
		r.matchMove != nil,
		r.residentMove,
		r.gamesRead != nil,
		r.gamesWrite != nil,
		r.gamesHint != nil,
		r.gamesAnalyze != nil,
		r.system != nil,
		r.profile != nil,
		r.authSession != nil,
		r.login != nil,
		r.account != nil,
		r.recovery != nil,
		r.feedback != nil,
		r.matthias != nil,
		r.narrative != nil,
		r.pawnSlug != nil,
		r.chronicles != nil,
		r.chroniclesRuns != nil,
		r.adminFeedback != nil,
		r.adminUsers != nil,
	)
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

// pythonFlag mirrors main.py's flags: os.environ.get(key, fallback) in
// {"1", "true", "yes", "on"}; anything else (garbage included) is false.
func pythonFlag(key, fallback string) bool {
	raw, ok := os.LookupEnv(key)
	if !ok {
		raw = fallback
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
