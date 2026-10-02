package pulse

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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
	disconnectGrace      = 60 * time.Second
	handoffDelay         = 5 * time.Second
	nativeHeaderValue    = "lobby-pulse"
	mongoApplicationName = "chess-studio-pvp-go"
)

var canonicalBrowserOrigins = [...]string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"https://evilsysadmin.github.io",
	"https://chess-studio.shadowops.dpdns.org",
	"https://staging.chess-studio.shadowops.dpdns.org",
}

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
	Store          Store
	JWTSecret      string
	AllowedOrigins []string
	PollAfter      time.Duration
	EnableRoster   bool
	EnableChat     bool
	EnableChallengeResolution bool
	EnableMatchHandoffCancel bool
	EnableMatchReady bool
	ChallengeAccept challengeAcceptService
	ChallengeCreate challengeCreateService
	VirtualPlayersEnabled bool
	VirtualOwner string
	SparringUsername string
	Now            func() time.Time
}

type Handler struct {
	store          Store
	secret         []byte
	allowedOrigins map[string]struct{}
	allowAnyOrigin bool
	pollAfterMS    int64
	enableRoster   bool
	enableChat     bool
	enableChallengeResolution bool
	enableMatchHandoffCancel bool
	enableMatchReady bool
	challengeAccept challengeAcceptService
	challengeCreate challengeCreateService
	virtualPlayersEnabled bool
	virtualOwner string
	sparringUsername string
	rosterMu       sync.Mutex
	rosterWindows  map[string]rateWindow
	chatMu         sync.Mutex
	chatWindows    map[string]rateWindow
	now            func() time.Time
}

type rateWindow struct {
	start time.Time
	count int
}

type MongoConfig struct {
	URL          string
	Database     string
	QueryTimeout time.Duration
}

type MongoStore struct {
	client  *mongo.Client
	db      *mongo.Database
	timeout time.Duration
}

type tokenHeader struct {
	Algorithm string `json:"alg"`
}

type tokenClaims struct {
	Subject        string `json:"sub"`
	Purpose        string `json:"purpose"`
	SessionVersion *int64 `json:"sv"`
	ExpiresAt      int64  `json:"exp"`
}

type rosterRow struct {
	Username string    `bson:"username"`
	Rating   int64     `bson:"rating"`
	Tier     string    `bson:"tier"`
	JoinedAt time.Time `bson:"joined_at"`
}

type cancelMatchResult string

const (
	cancelMatchOK               cancelMatchResult = "ok"
	cancelMatchNotFound         cancelMatchResult = "not_found"
	cancelMatchWrongState       cancelMatchResult = "wrong_state"
	cancelMatchRevisionConflict cancelMatchResult = "revision_conflict"
)

type readyMatchResult string

const (
	readyMatchOK               readyMatchResult = "ok"
	readyMatchNotFound         readyMatchResult = "not_found"
	readyMatchWrongState       readyMatchResult = "wrong_state"
	readyMatchRevisionConflict readyMatchResult = "revision_conflict"
)

type virtualPlayerConfig struct {
	Enabled          bool
	Owner            string
	SparringUsername string
}

type cancelMatchRow struct {
	ID            string     `bson:"_id"`
	White         string     `bson:"white"`
	Black         string     `bson:"black"`
	WhiteRating   *int64     `bson:"white_rating"`
	BlackRating   *int64     `bson:"black_rating"`
	FEN           string     `bson:"fen"`
	Turn          string     `bson:"turn"`
	Status        string     `bson:"status"`
	Result        *string    `bson:"result"`
	EndReason     *string    `bson:"end_reason"`
	StartAt       time.Time  `bson:"start_at"`
	ReadyDeadline time.Time  `bson:"ready_deadline"`
	WhiteReady    bool       `bson:"white_ready"`
	BlackReady    bool       `bson:"black_ready"`
	WhiteClockMS  *int64     `bson:"white_clock_ms"`
	BlackClockMS  *int64     `bson:"black_clock_ms"`
	WhiteSeenAt   time.Time  `bson:"white_seen_at"`
	BlackSeenAt   time.Time  `bson:"black_seen_at"`
	WhiteDisconnectGraceStarted time.Time `bson:"white_disconnect_grace_started_at"`
	BlackDisconnectGraceStarted time.Time `bson:"black_disconnect_grace_started_at"`
	TurnStartedAt time.Time `bson:"turn_started_at"`
	Rated         *bool      `bson:"rated"`
	History       []bson.M   `bson:"history"`
	Revision      int64      `bson:"revision"`
	CreatedAt     time.Time  `bson:"created_at"`
	UpdatedAt     time.Time  `bson:"updated_at"`
}

type challengeRow struct {
	ID            string    `bson:"_id"`
	Challenger    string    `bson:"challenger"`
	Opponent      string    `bson:"opponent"`
	ChallengerRating int64   `bson:"challenger_rating"`
	OpponentRating   int64   `bson:"opponent_rating"`
	Status        string    `bson:"status"`
	MatchID       string    `bson:"match_id"`
	CreatedAt     time.Time `bson:"created_at"`
	ResolvedAt    time.Time `bson:"resolved_at"`
	CooldownUntil time.Time `bson:"cooldown_until"`
}

type matchRow struct {
	ID                          string    `bson:"_id"`
	White                       string    `bson:"white"`
	Black                       string    `bson:"black"`
	Status                      string    `bson:"status"`
	Turn                        string    `bson:"turn"`
	Revision                    int64     `bson:"revision"`
	WhiteReady                  bool      `bson:"white_ready"`
	BlackReady                  bool      `bson:"black_ready"`
	WhiteClockMS                int64     `bson:"white_clock_ms"`
	BlackClockMS                int64     `bson:"black_clock_ms"`
	StartAt                     time.Time `bson:"start_at"`
	ReadyDeadline               time.Time `bson:"ready_deadline"`
	TurnStartedAt               time.Time `bson:"turn_started_at"`
	UpdatedAt                   time.Time `bson:"updated_at"`
	WhiteSeenAt                 time.Time `bson:"white_seen_at"`
	BlackSeenAt                 time.Time `bson:"black_seen_at"`
	WhiteDisconnectGraceStarted time.Time `bson:"white_disconnect_grace_started_at"`
	BlackDisconnectGraceStarted time.Time `bson:"black_disconnect_grace_started_at"`
	Rated                       *bool     `bson:"rated"`
}

type matchPulseState struct {
	Found            bool
	Revision         int64
	Status           string
	LifecycleDue     bool
	OpponentPresence string
}

type chatRow struct {
	ID        string    `bson:"_id"`
	CreatedAt time.Time `bson:"created_at"`
}

type chatMessageRow struct {
	ID        string
	Username  string
	Text      string
	Kind      string
	CreatedAt time.Time
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
	origins := make([]string, 0, len(canonicalBrowserOrigins)+len(cfg.AllowedOrigins))
	origins = append(origins, canonicalBrowserOrigins[:]...)
	origins = append(origins, cfg.AllowedOrigins...)
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
		store:          cfg.Store,
		secret:         []byte(secret),
		allowedOrigins: allowed,
		allowAnyOrigin: allowAny,
		pollAfterMS:    pollAfter.Milliseconds(),
		enableRoster:   cfg.EnableRoster,
		enableChat:     cfg.EnableChat,
		enableChallengeResolution: cfg.EnableChallengeResolution,
		enableMatchHandoffCancel: cfg.EnableMatchHandoffCancel,
		enableMatchReady: cfg.EnableMatchReady,
		challengeAccept: cfg.ChallengeAccept,
		challengeCreate: cfg.ChallengeCreate,
		virtualPlayersEnabled: cfg.VirtualPlayersEnabled,
		virtualOwner: strings.ToLower(strings.TrimSpace(cfg.VirtualOwner)),
		sparringUsername: strings.ToLower(strings.TrimSpace(cfg.SparringUsername)),
		rosterWindows:  make(map[string]rateWindow),
		chatWindows:    make(map[string]rateWindow),
		now:            now,
	}, nil
}

func NewMongoStore(ctx context.Context, cfg MongoConfig) (*MongoStore, error) {
	uri := strings.TrimSpace(cfg.URL)
	if uri == "" {
		return nil, errors.New("Mongo URL is required")
	}
	database := strings.TrimSpace(cfg.Database)
	if database == "" {
		return nil, errors.New("Mongo database is required")
	}
	timeout := cfg.QueryTimeout
	if timeout <= 0 {
		timeout = defaultQueryTimeout
	}
	client, err := mongo.Connect(
		options.Client().
			ApplyURI(uri).
			SetAppName(mongoApplicationName).
			SetMaxPoolSize(8).
			SetMaxConnecting(2).
			SetServerSelectionTimeout(timeout),
	)
	if err != nil {
		return nil, fmt.Errorf("connect MongoDB: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if err := client.Database("admin").RunCommand(pingCtx, bson.D{{Key: "ping", Value: 1}}).Err(); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}
	return &MongoStore{client: client, db: client.Database(database), timeout: timeout}, nil
}

func (s *MongoStore) Close(ctx context.Context) error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Disconnect(ctx)
}

func (s *MongoStore) AuthState(ctx context.Context, username string) (bool, int64, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row bson.M
	err := s.db.Collection("users").FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"_id": 1, "session_version": 1}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, 0, nil
	}
	if err != nil {
		return false, 0, err
	}
	version, ok := bsonInteger(row["session_version"])
	if !ok {
		version = 0
	}
	return true, version, nil
}

func (s *MongoStore) JoinRoster(ctx context.Context, username string, now time.Time) (rosterRow, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var user bson.M
	err := s.db.Collection("users").FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"pvp_rating": 1}),
	).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return rosterRow{}, mongo.ErrNoDocuments
	}
	if err != nil {
		return rosterRow{}, err
	}
	rating := normalizedRating(user["pvp_rating"])
	tier := ratingTier(rating)
	payload := bson.M{
		"username":  username,
		"rating":    rating,
		"tier":      tier,
		"last_seen": now,
	}
	_, err = s.db.Collection("pvp_roster").UpdateOne(
		queryCtx,
		bson.M{"_id": username},
		bson.M{"$set": payload, "$setOnInsert": bson.M{"joined_at": now}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return rosterRow{}, err
	}
	var row rosterRow
	if err := s.db.Collection("pvp_roster").FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"username": 1, "rating": 1, "tier": 1, "joined_at": 1}),
	).Decode(&row); err != nil {
		return rosterRow{}, err
	}
	return row, nil
}

func (s *MongoStore) LeaveRoster(ctx context.Context, username string, now time.Time) error {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	if _, err := s.db.Collection("pvp_roster").DeleteOne(queryCtx, bson.M{"_id": username}); err != nil {
		return err
	}
	_, err := s.db.Collection("pvp_challenges").UpdateMany(
		queryCtx,
		bson.M{
			"status": "pending",
			"$or": bson.A{
				bson.M{"challenger": username},
				bson.M{"opponent": username},
			},
		},
		bson.M{"$set": bson.M{"status": "cancelled", "resolved_at": now}},
	)
	return err
}

func (s *MongoStore) AppendLobbyChat(ctx context.Context, username, text string, now time.Time) (chatMessageRow, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	stampValue := now.UTC()
	sum := sha256.Sum256([]byte(username + "\x00" + stampValue.Format(time.RFC3339Nano) + "\x00" + text))
	id := hex.EncodeToString(sum[:])[:24]
	row := chatMessageRow{ID: id, Username: username, Text: text, Kind: "message", CreatedAt: stampValue}
	_, err := s.db.Collection("pvp_lobby_chat").InsertOne(queryCtx, bson.M{
		"_id": id,
		"username": username,
		"text": text,
		"kind": "message",
		"created_at": stampValue,
	})
	if err != nil {
		return chatMessageRow{}, err
	}
	return row, nil
}

func (s *MongoStore) CancelChallenge(ctx context.Context, challengeID, username string, now time.Time) (challengeRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row challengeRow
	err := s.db.Collection("pvp_challenges").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id": challengeID,
			"status": "pending",
			"challenger": username,
			"created_at": bson.M{"$gte": now.Add(-challengeTTL)},
		},
		bson.M{"$set": bson.M{
			"status": "cancelled",
			"resolved_at": now,
			"cooldown_until": now.Add(challengeCooldown),
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if err == nil {
		return row, true, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, err
	}
	err = s.db.Collection("pvp_challenges").FindOne(
		queryCtx,
		bson.M{"_id": challengeID, "status": "cancelled", "challenger": username},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, nil
	}
	if err != nil {
		return challengeRow{}, false, err
	}
	return row, true, nil
}

func (s *MongoStore) DeclineChallenge(ctx context.Context, challengeID, username string, now time.Time) (challengeRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row challengeRow
	err := s.db.Collection("pvp_challenges").FindOneAndUpdate(
		queryCtx,
		bson.M{"_id": challengeID, "status": "pending", "opponent": username},
		bson.M{"$set": bson.M{
			"status": "declined",
			"resolved_at": now,
			"cooldown_until": now.Add(challengeCooldown),
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, nil
	}
	if err != nil {
		return challengeRow{}, false, err
	}
	return row, true, nil
}


func (s *MongoStore) CancelStartingMatch(ctx context.Context, matchID, username string, now time.Time) (cancelMatchRow, cancelMatchResult, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	participant := bson.M{
		"_id": matchID,
		"$or": bson.A{bson.M{"white": username}, bson.M{"black": username}},
	}
	var current cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOne(queryCtx, participant).Decode(&current)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, cancelMatchNotFound, nil
	}
	if err != nil {
		return cancelMatchRow{}, "", err
	}
	if current.Status == "cancelled" {
		return current, cancelMatchOK, nil
	}
	if current.Status != "starting" {
		return current, cancelMatchWrongState, nil
	}

	endReason := "handoff_cancelled"
	var updated cancelMatchRow
	err = s.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id": matchID,
			"revision": current.Revision,
			"status": "starting",
			"$or": bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		bson.M{
			"$set": bson.M{
				"status": "cancelled",
				"result": nil,
				"end_reason": endReason,
				"turn_started_at": nil,
				"updated_at": now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err == nil {
		return updated, cancelMatchOK, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, "", err
	}

	err = s.db.Collection("pvp_matches").FindOne(queryCtx, participant).Decode(&current)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, cancelMatchNotFound, nil
	}
	if err != nil {
		return cancelMatchRow{}, "", err
	}
	if current.Status == "cancelled" {
		return current, cancelMatchOK, nil
	}
	return current, cancelMatchRevisionConflict, nil
}


func (s *MongoStore) ReadyMatch(ctx context.Context, matchID, username string, now time.Time, virtual virtualPlayerConfig) (cancelMatchRow, readyMatchResult, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	matches := s.db.Collection("pvp_matches")
	participant := bson.M{
		"_id": matchID,
		"acceptance_state": bson.M{"$ne": "staged"},
		"$or": bson.A{bson.M{"white": username}, bson.M{"black": username}},
	}

	for attempt := 0; attempt < 4; attempt++ {
		var row cancelMatchRow
		if err := matches.FindOne(queryCtx, participant).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
			return cancelMatchRow{}, readyMatchNotFound, nil
		} else if err != nil {
			return cancelMatchRow{}, "", err
		}

		playerField, seenField, graceField := "white", "white_seen_at", "white_disconnect_grace_started_at"
		if row.Black == username {
			playerField, seenField, graceField = "black", "black_seen_at", "black_disconnect_grace_started_at"
		}
		if err := matches.FindOneAndUpdate(
			queryCtx,
			bson.M{"_id": matchID, playerField: username, "acceptance_state": bson.M{"$ne": "staged"}},
			bson.M{"$set": bson.M{seenField: now}, "$unset": bson.M{graceField: ""}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
			continue
		} else if err != nil {
			return cancelMatchRow{}, "", err
		}

		if virtualUsername := virtualOpponentUsername(row, username, virtual); virtualUsername != "" && row.Status == "starting" {
			virtualField, virtualSeen, virtualGrace, virtualReady := "white", "white_seen_at", "white_disconnect_grace_started_at", "white_ready"
			alreadyReady := row.WhiteReady
			if row.Black == virtualUsername {
				virtualField, virtualSeen, virtualGrace, virtualReady = "black", "black_seen_at", "black_disconnect_grace_started_at", "black_ready"
				alreadyReady = row.BlackReady
			}
			if !alreadyReady {
				if err := matches.FindOneAndUpdate(
					queryCtx,
					bson.M{"_id": matchID, "revision": row.Revision, "status": "starting", virtualField: virtualUsername},
					bson.M{
						"$set": bson.M{virtualReady: true, virtualSeen: now, "updated_at": now},
						"$unset": bson.M{virtualGrace: ""},
						"$inc": bson.M{"revision": 1},
					},
					options.FindOneAndUpdate().SetReturnDocument(options.After),
				).Decode(&row); errors.Is(err, mongo.ErrNoDocuments) {
					continue
				} else if err != nil {
					return cancelMatchRow{}, "", err
				}
			}
		}

		if row.Status == "starting" && !row.ReadyDeadline.IsZero() && !now.Before(row.ReadyDeadline) {
			endReason := "handoff_timeout"
			var timedOut cancelMatchRow
			if err := matches.FindOneAndUpdate(
				queryCtx,
				bson.M{"_id": matchID, "revision": row.Revision, "status": "starting"},
				bson.M{
					"$set": bson.M{
						"status": "cancelled", "result": nil, "end_reason": endReason,
						"turn_started_at": nil, "updated_at": now,
					},
					"$inc": bson.M{"revision": 1},
				},
				options.FindOneAndUpdate().SetReturnDocument(options.After),
			).Decode(&timedOut); err == nil {
				return timedOut, readyMatchOK, nil
			} else if !errors.Is(err, mongo.ErrNoDocuments) {
				return cancelMatchRow{}, "", err
			}
			continue
		}

		switch row.Status {
		case "cancelled", "active":
			return row, readyMatchOK, nil
		case "starting":
			// continue below
		default:
			return row, readyMatchWrongState, nil
		}

		isWhite := row.White == username
		ownReady, otherReady := row.BlackReady, row.WhiteReady
		ownReadyField := "black_ready"
		if isWhite {
			ownReady, otherReady = row.WhiteReady, row.BlackReady
			ownReadyField = "white_ready"
		}
		if ownReady && !otherReady {
			return row, readyMatchOK, nil
		}

		set := bson.M{ownReadyField: true, "updated_at": now}
		if otherReady {
			startAt := now.Add(handoffDelay)
			set["status"] = "active"
			set["start_at"] = startAt
			set["turn_started_at"] = startAt
		}
		var updated cancelMatchRow
		if err := matches.FindOneAndUpdate(
			queryCtx,
			bson.M{"_id": matchID, "revision": row.Revision, "status": "starting", playerField: username},
			bson.M{"$set": set, "$inc": bson.M{"revision": 1}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated); err == nil {
			return updated, readyMatchOK, nil
		} else if !errors.Is(err, mongo.ErrNoDocuments) {
			return cancelMatchRow{}, "", err
		}
	}

	return cancelMatchRow{}, readyMatchRevisionConflict, nil
}

func normalizedRating(value any) int64 {
	rating, ok := bsonInteger(value)
	if !ok || rating == 0 {
		rating = 400
	}
	if rating < 100 {
		return 100
	}
	if rating > 10000 {
		return 10000
	}
	return rating
}

func ratingTier(rating int64) string {
	switch {
	case rating <= 699:
		return "Principiante"
	case rating <= 999:
		return "Aficionado"
	case rating <= 1299:
		return "Intermedio"
	case rating <= 1599:
		return "Avanzado"
	case rating <= 1899:
		return "Experto"
	default:
		return "Maestro"
	}
}

func (s *MongoStore) Revision(ctx context.Context, username string, now time.Time) (string, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	h := sha256.New()

	if err := s.hashRoster(queryCtx, h, now); err != nil {
		return "", err
	}
	if err := s.hashChallenges(queryCtx, h, username, now); err != nil {
		return "", err
	}
	if err := s.hashActiveMatch(queryCtx, h, username); err != nil {
		return "", err
	}
	if err := s.hashLatestChat(queryCtx, h, now); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil))[:24], nil
}

func (s *MongoStore) MatchState(ctx context.Context, username, matchID string, now time.Time) (matchPulseState, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row matchRow
	err := s.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{
			"_id":              matchID,
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().SetProjection(bson.M{
			"white": 1, "black": 1, "status": 1, "turn": 1, "revision": 1,
			"white_clock_ms": 1, "black_clock_ms": 1, "start_at": 1,
			"ready_deadline": 1, "turn_started_at": 1, "rated": 1,
			"white_seen_at": 1, "black_seen_at": 1,
			"white_disconnect_grace_started_at": 1, "black_disconnect_grace_started_at": 1,
		}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchPulseState{}, nil
	}
	if err != nil {
		return matchPulseState{}, err
	}

	playerField := "white"
	seenField := "white_seen_at"
	graceField := "white_disconnect_grace_started_at"
	callerSeen := row.WhiteSeenAt
	opponentSeen := row.BlackSeenAt
	opponentGrace := row.BlackDisconnectGraceStarted
	if row.Black == username {
		playerField = "black"
		seenField = "black_seen_at"
		graceField = "black_disconnect_grace_started_at"
		callerSeen = row.BlackSeenAt
		opponentSeen = row.WhiteSeenAt
		opponentGrace = row.WhiteDisconnectGraceStarted
	}
	result, err := s.db.Collection("pvp_matches").UpdateOne(
		queryCtx,
		bson.M{"_id": matchID, playerField: username, "acceptance_state": bson.M{"$ne": "staged"}},
		bson.M{"$set": bson.M{seenField: now}, "$unset": bson.M{graceField: ""}},
	)
	if err != nil {
		return matchPulseState{}, err
	}
	if result.MatchedCount == 0 {
		return matchPulseState{}, nil
	}

	opponentPresence := matchOpponentPresence(row, opponentSeen, now)
	return matchPulseState{
		Found:            true,
		Revision:         row.Revision,
		Status:           row.Status,
		LifecycleDue:     matchLifecycleDue(row, now) || disconnectLifecycleDue(row, callerSeen, opponentPresence, opponentGrace, now),
		OpponentPresence: opponentPresence,
	}, nil
}

func matchOpponentPresence(row matchRow, seenAt, now time.Time) string {
	// Current unrated PvP matches are the environment-gated synthetic residents
	// and sparring rival. Python pins those actors online as well.
	if row.Rated != nil && !*row.Rated {
		return "online"
	}
	if seenAt.IsZero() {
		return "disconnected"
	}
	age := now.Sub(seenAt)
	if age < 0 {
		age = 0
	}
	if age <= presenceOnline {
		return "online"
	}
	if age <= presenceReconnecting {
		return "reconnecting"
	}
	return "disconnected"
}

func recentlyPresent(seenAt, now time.Time) bool {
	if seenAt.IsZero() {
		return false
	}
	age := now.Sub(seenAt)
	return age >= 0 && age <= presenceReconnecting
}

func disconnectLifecycleDue(row matchRow, callerSeen time.Time, opponentPresence string, opponentGrace, now time.Time) bool {
	if row.Status != "active" || opponentPresence != "disconnected" {
		return false
	}
	// A returning observer asks Python to restart the rival grace window, matching
	// the existing authoritative reconnect contract.
	if !recentlyPresent(callerSeen, now) {
		return true
	}
	if opponentGrace.IsZero() {
		return true
	}
	return !now.Before(opponentGrace.Add(disconnectGrace))
}

func matchLifecycleDue(row matchRow, now time.Time) bool {
	if row.Status == "starting" {
		return !row.ReadyDeadline.IsZero() && !now.Before(row.ReadyDeadline)
	}
	if row.Status != "active" {
		return true
	}
	if row.TurnStartedAt.IsZero() || now.Before(row.TurnStartedAt) {
		return false
	}
	remainingMS := row.WhiteClockMS
	if row.Turn == "b" {
		remainingMS = row.BlackClockMS
	}
	if remainingMS <= 0 {
		return true
	}
	return now.Sub(row.TurnStartedAt) >= time.Duration(remainingMS)*time.Millisecond
}

func (s *MongoStore) hashRoster(ctx context.Context, h hash.Hash, now time.Time) error {
	cursor, err := s.db.Collection("pvp_roster").Find(
		ctx,
		bson.M{"last_seen": bson.M{"$gte": now.Add(-rosterTTL)}},
		options.Find().
			SetProjection(bson.M{"username": 1, "rating": 1, "tier": 1, "joined_at": 1}).
			SetSort(bson.D{{Key: "rating", Value: -1}, {Key: "username", Value: 1}}),
	)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var row rosterRow
		if err := cursor.Decode(&row); err != nil {
			return err
		}
		fmt.Fprintf(h, "r|%s|%d|%s|%s\n", row.Username, row.Rating, row.Tier, stamp(row.JoinedAt))
	}
	return cursor.Err()
}

func (s *MongoStore) hashChallenges(ctx context.Context, h hash.Hash, username string, now time.Time) error {
	participant := bson.M{"$or": bson.A{
		bson.M{"challenger": username},
		bson.M{"opponent": username},
	}}
	relevant := bson.M{"$or": bson.A{
		bson.M{"status": bson.M{"$in": bson.A{"pending", "accepted"}}},
		bson.M{"cooldown_until": bson.M{"$gt": now}},
	}}
	cursor, err := s.db.Collection("pvp_challenges").Find(
		ctx,
		bson.M{"$and": bson.A{participant, relevant}},
		options.Find().
			SetProjection(bson.M{
				"challenger": 1, "opponent": 1, "status": 1, "match_id": 1,
				"created_at": 1, "resolved_at": 1, "cooldown_until": 1,
			}).
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: 1}}),
	)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	cutoff := now.Add(-challengeTTL)
	for cursor.Next(ctx) {
		var row challengeRow
		if err := cursor.Decode(&row); err != nil {
			return err
		}
		if row.Status == "accepted" || (row.Status == "pending" && !row.CreatedAt.Before(cutoff)) {
			fmt.Fprintf(h, "q|%s|%s|%s|%s|%s|%s|%s\n",
				row.ID, row.Challenger, row.Opponent, row.Status, row.MatchID, stamp(row.CreatedAt), stamp(row.ResolvedAt))
		}
		if row.CooldownUntil.After(now) {
			fmt.Fprintf(h, "d|%s|%s|%s|%s\n", row.ID, row.Challenger, row.Opponent, stamp(row.CooldownUntil))
		}
	}
	return cursor.Err()
}

func (s *MongoStore) hashActiveMatch(ctx context.Context, h hash.Hash, username string) error {
	var row matchRow
	err := s.db.Collection("pvp_matches").FindOne(
		ctx,
		bson.M{
			"status":           bson.M{"$in": bson.A{"starting", "active"}},
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().
			SetProjection(bson.M{
				"white": 1, "black": 1, "status": 1, "turn": 1, "revision": 1,
				"white_ready": 1, "black_ready": 1, "start_at": 1, "updated_at": 1,
				"white_seen_at": 1, "black_seen_at": 1,
				"white_disconnect_grace_started_at": 1, "black_disconnect_grace_started_at": 1,
			}).
			SetSort(bson.D{{Key: "updated_at", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		fmt.Fprintln(h, "m|none")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Fprintf(h, "m|%s|%s|%s|%s|%s|%d|%t|%t|%s|%s|%s|%s|%s|%s\n",
		row.ID, row.White, row.Black, row.Status, row.Turn, row.Revision,
		row.WhiteReady, row.BlackReady, stamp(row.StartAt), stamp(row.UpdatedAt),
		stamp(row.WhiteSeenAt), stamp(row.BlackSeenAt),
		stamp(row.WhiteDisconnectGraceStarted), stamp(row.BlackDisconnectGraceStarted))
	return nil
}

func (s *MongoStore) hashLatestChat(ctx context.Context, h hash.Hash, now time.Time) error {
	var row chatRow
	err := s.db.Collection("pvp_lobby_chat").FindOne(
		ctx,
		bson.M{"created_at": bson.M{"$gte": now.Add(-lobbyChatTTL)}},
		options.FindOne().
			SetProjection(bson.M{"created_at": 1}).
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		fmt.Fprintln(h, "c|none")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Fprintf(h, "c|%s|%s\n", row.ID, stamp(row.CreatedAt))
	return nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.decorateResponse(w, r)
	if r.Method == http.MethodOptions {
		if !h.originAllowed(r.Header.Get("Origin")) {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Origen no permitido."})
			return
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, X-Client-Release")
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

	if r.URL.Path == "/api/pvp/challenges" {
		if h.challengeCreate == nil {
			http.NotFound(w, r)
			return
		}
		h.serveChallengeCreate(w, r, claims.Subject, now)
		return
	}

	if challengeID, ok := challengeAcceptID(r.URL.Path); ok {
		if h.challengeAccept == nil {
			http.NotFound(w, r)
			return
		}
		h.serveChallengeAccept(w, r, claims.Subject, challengeID, now)
		return
	}

	if challengeID, action, ok := challengeResolutionPath(r.URL.Path); ok {
		if !h.enableChallengeResolution {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Native", "challenge-resolution")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
			return
		}
		var row challengeRow
		var found bool
		var err error
		if action == "cancel" {
			row, found, err = h.store.CancelChallenge(r.Context(), challengeID, claims.Subject, now)
		} else {
			row, found, err = h.store.DeclineChallenge(r.Context(), challengeID, claims.Subject, now)
		}
		if err != nil {
			detail := "No se pudo cancelar el reto 1v1."
			if action == "decline" {
				detail = "No se pudo rechazar el reto 1v1."
			}
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": detail})
			return
		}
		if !found {
			detail := "Reto saliente pendiente no encontrado."
			if action == "decline" {
				detail = "Reto pendiente no encontrado."
			}
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": detail})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"challenge": publicChallenge(row, claims.Subject)})
		return
	}

	if matchID, ok := matchHandoffCancelID(r.URL.Path); ok {
		if !h.enableMatchHandoffCancel {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Native", "match-handoff-cancel")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
			return
		}
		row, result, err := h.store.CancelStartingMatch(r.Context(), matchID, claims.Subject, now)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
			return
		}
		switch result {
		case cancelMatchNotFound:
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		case cancelMatchWrongState:
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo ya ha empezado y no puede cancelarse como entrada."})
			return
		case cancelMatchRevisionConflict:
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo cambió mientras cancelábamos la entrada."})
			return
		case cancelMatchOK:
			writeJSON(w, http.StatusOK, map[string]any{"match": publicHandoffMatch(row, claims.Subject, now, virtualPlayerConfig{Enabled: h.virtualPlayersEnabled, Owner: h.virtualOwner, SparringUsername: h.sparringUsername})})
			return
		default:
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
			return
		}
	}

	if matchID, ok := matchReadyID(r.URL.Path); ok {
		if !h.enableMatchReady {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Native", "match-ready")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
			return
		}
		virtual := virtualPlayerConfig{
			Enabled: h.virtualPlayersEnabled,
			Owner: h.virtualOwner,
			SparringUsername: h.sparringUsername,
		}
		var row cancelMatchRow
		var result readyMatchResult
		var err error
		for attempt := 0; attempt < 3; attempt++ {
			row, result, err = h.store.ReadyMatch(r.Context(), matchID, claims.Subject, now, virtual)
			if err == nil {
				break
			}
			if attempt < 2 {
				time.Sleep(time.Duration(attempt+1) * 120 * time.Millisecond)
			}
		}
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
			return
		}
		switch result {
		case readyMatchNotFound:
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		case readyMatchWrongState:
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida ya no está preparando el arranque."})
			return
		case readyMatchRevisionConflict:
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo cambió mientras sincronizábamos a los jugadores."})
			return
		case readyMatchOK:
			if row.Status == "active" {
				_ = h.store.LeaveRoster(r.Context(), row.White, now)
				_ = h.store.LeaveRoster(r.Context(), row.Black, now)
			}
			writeJSON(w, http.StatusOK, map[string]any{"match": publicHandoffMatch(row, claims.Subject, now, virtual)})
			return
		default:
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
			return
		}
	}

	if r.URL.Path == "/api/pvp/lobby/chat" {
		if !h.enableChat {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Native", "lobby-chat")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
			return
		}
		if allowed, retryAfter := h.allowLobbyChat(claims.Subject, now); !allowed {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiados mensajes 1v1."})
			return
		}
		var payload struct { Text string `json:"text"` }
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
		if err := decoder.Decode(&payload); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Mensaje inválido."})
			return
		}
		rawLen := len([]rune(payload.Text))
		if rawLen < 1 || rawLen > 240 {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "El mensaje debe tener entre 1 y 240 caracteres."})
			return
		}
		text := strings.Join(strings.Fields(payload.Text), " ")
		if text == "" {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "El mensaje está vacío."})
			return
		}
		row, err := h.store.AppendLobbyChat(r.Context(), claims.Subject, text, now)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo publicar el mensaje 1v1."})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"message": map[string]any{
			"id": row.ID, "username": row.Username, "text": row.Text, "kind": row.Kind,
			"createdAt": stamp(row.CreatedAt), "isSelf": true,
		}})
		return
	}

	if r.URL.Path == "/api/pvp/roster" {
		if !h.enableRoster {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Native", "roster")
		switch r.Method {
		case http.MethodPost:
			if allowed, retryAfter := h.allowRosterJoin(claims.Subject, now); !allowed {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiadas actualizaciones de disponibilidad 1v1."})
				return
			}
			member, err := h.store.JoinRoster(r.Context(), claims.Subject, now)
			if errors.Is(err, mongo.ErrNoDocuments) {
				writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Sesión inválida o expirada. Inicia sesión de nuevo."})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar el roster 1v1."})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"member": map[string]any{
				"username": member.Username,
				"rating": member.Rating,
				"tier": member.Tier,
				"joinedAt": stamp(member.JoinedAt),
				"isSelf": true,
			}})
			return
		case http.MethodDelete:
			if err := h.store.LeaveRoster(r.Context(), claims.Subject, now); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo abandonar el roster 1v1."})
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		default:
			w.Header().Set("Allow", "POST, DELETE, OPTIONS")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
			return
		}
	}

	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}

	if matchID, ok := matchPulseID(r.URL.Path); ok {
		state, err := h.store.MatchState(r.Context(), claims.Subject, matchID, now)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo consultar el pulso de la partida 1v1."})
			return
		}
		if !state.Found {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"revision":         state.Revision,
			"status":           state.Status,
			"lifecycleDue":     state.LifecycleDue,
			"opponentPresence": state.OpponentPresence,
			"pollAfterMs":      1250,
			"source":       "go",
		})
		return
	}

	revision, err := h.store.Revision(r.Context(), claims.Subject, now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo consultar el pulso 1v1."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"revision":    revision,
		"pollAfterMs": h.pollAfterMS,
		"source":      "go",
	})
}

func (h *Handler) allowLobbyChat(username string, now time.Time) (bool, int) {
	h.chatMu.Lock()
	defer h.chatMu.Unlock()
	window := h.chatWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= lobbyChatWindow {
		h.chatWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= lobbyChatLimit {
		retry := int(lobbyChatWindow.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 { retry = 1 }
		return false, retry
	}
	window.count++
	h.chatWindows[username] = window
	return true, 0
}

func (h *Handler) allowRosterJoin(username string, now time.Time) (bool, int) {
	h.rosterMu.Lock()
	defer h.rosterMu.Unlock()
	window := h.rosterWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= rosterJoinWindow {
		h.rosterWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= rosterJoinLimit {
		retry := int(rosterJoinWindow.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.rosterWindows[username] = window
	return true, 0
}

func matchPulseID(path string) (string, bool) {
	const prefix = "/api/pvp/matches/"
	const suffix = "/pulse"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	if matchID == "" || strings.Contains(matchID, "/") {
		return "", false
	}
	return matchID, true
}

func (h *Handler) authenticate(r *http.Request) (tokenClaims, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return tokenClaims{}, errors.New("missing bearer token")
	}
	return verifySessionToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), h.secret, h.now())
}

func verifySessionToken(raw string, secret []byte, now time.Time) (tokenClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return tokenClaims{}, errors.New("invalid JWT")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return tokenClaims{}, err
	}
	var header tokenHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "HS256" {
		return tokenClaims{}, errors.New("invalid JWT algorithm")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return tokenClaims{}, err
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return tokenClaims{}, errors.New("invalid JWT signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return tokenClaims{}, err
	}
	var claims tokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return tokenClaims{}, err
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return tokenClaims{}, errors.New("missing subject")
	}
	if claims.Purpose != "" && claims.Purpose != "session" {
		return tokenClaims{}, errors.New("wrong token purpose")
	}
	if claims.SessionVersion != nil && *claims.SessionVersion < 0 {
		return tokenClaims{}, errors.New("invalid session version")
	}
	if claims.ExpiresAt > 0 && !now.Before(time.Unix(claims.ExpiresAt, 0)) {
		return tokenClaims{}, errors.New("expired token")
	}
	return claims, nil
}

func (h *Handler) decorateResponse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Chess-Pvp-Native", nativeHeaderValue)
	w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, X-Chess-Pvp-Native, X-Chess-Pvp-Edge")
	w.Header().Add("Vary", "Origin")
	if requestID := cleanRequestID(r.Header.Get("X-Request-ID")); requestID != "" {
		w.Header().Set("X-Request-ID", requestID)
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if h.originAllowed(origin) && origin != "" {
		if h.allowAnyOrigin {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
	}
}

func (h *Handler) originAllowed(origin string) bool {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return true
	}
	if h.allowAnyOrigin {
		return true
	}
	_, ok := h.allowedOrigins[origin]
	return ok
}

func cleanRequestID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 128 {
		value = value[:128]
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return ""
		}
	}
	return value
}

func bsonInteger(value any) (int64, bool) {
	switch v := value.(type) {
	case nil:
		return 0, true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	default:
		return 0, false
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

func matchHandoffCancelID(path string) (string, bool) {
	const prefix = "/api/pvp/matches/"
	const suffix = "/cancel-starting"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	if matchID == "" || strings.Contains(matchID, "/") {
		return "", false
	}
	return matchID, true
}

func matchReadyID(path string) (string, bool) {
	const prefix = "/api/pvp/matches/"
	const suffix = "/ready"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	if matchID == "" || strings.Contains(matchID, "/") {
		return "", false
	}
	return matchID, true
}

func challengeResolutionPath(path string) (string, string, bool) {
	const prefix = "/api/pvp/challenges/"
	if !strings.HasPrefix(path, prefix) {
		return "", "", false
	}
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || (parts[1] != "cancel" && parts[1] != "decline") {
		return "", "", false
	}
	return parts[0], parts[1], true
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

func residentIdentity(username string, enabled bool) (string, any, any) {
	if !enabled {
		return username, nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "otto_falk":
		return "Otto Falk", "resident", "RESIDENTE · IA"
	case "marta_stein":
		return "Marta Stein", "resident", "RESIDENTE · IA"
	case "viktor_kraus":
		return "Viktor Kraus", "resident", "RESIDENTE · IA"
	default:
		return username, nil, nil
	}
}

func isResidentUsername(username string) bool {
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "otto_falk", "marta_stein", "viktor_kraus":
		return true
	default:
		return false
	}
}

func virtualOpponentUsername(row cancelMatchRow, viewer string, cfg virtualPlayerConfig) string {
	if !cfg.Enabled || strings.ToLower(strings.TrimSpace(viewer)) != strings.ToLower(strings.TrimSpace(cfg.Owner)) {
		return ""
	}
	opponent := row.White
	if row.White == viewer {
		opponent = row.Black
	} else if row.Black != viewer {
		return ""
	}
	normalized := strings.ToLower(strings.TrimSpace(opponent))
	if normalized == strings.ToLower(strings.TrimSpace(cfg.SparringUsername)) || isResidentUsername(normalized) {
		return opponent
	}
	return ""
}

func publicHandoffMatch(row cancelMatchRow, username string, now time.Time, virtual virtualPlayerConfig) map[string]any {
	isWhite := row.White == username
	turn := row.Turn
	if turn == "" {
		turn = "w"
	}
	whiteDisplay, whiteKind, whiteLabel := residentIdentity(row.White, virtual.Enabled)
	blackDisplay, blackKind, blackLabel := residentIdentity(row.Black, virtual.Enabled)

	opponentSeen := row.WhiteSeenAt
	opponentGrace := row.WhiteDisconnectGraceStarted
	if isWhite {
		opponentSeen = row.BlackSeenAt
		opponentGrace = row.BlackDisconnectGraceStarted
	}
	opponentPresence := "disconnected"
	var opponentSeenAt any
	if virtualOpponentUsername(row, username, virtual) != "" {
		opponentPresence = "online"
		opponentSeenAt = stamp(now)
	} else if !opponentSeen.IsZero() {
		opponentSeenAt = stamp(opponentSeen)
		age := now.Sub(opponentSeen)
		if age < 0 {
			age = 0
		}
		if age <= presenceOnline {
			opponentPresence = "online"
		} else if age <= presenceReconnecting {
			opponentPresence = "reconnecting"
		}
	}

	whiteClock := pointerInt64(row.WhiteClockMS, 10*60*1000)
	blackClock := pointerInt64(row.BlackClockMS, 10*60*1000)
	if whiteClock < 0 { whiteClock = 0 }
	if blackClock < 0 { blackClock = 0 }

	var runningColor any
	if row.Status == "active" && !row.TurnStartedAt.IsZero() && !now.Before(row.TurnStartedAt) {
		runningColor = turn
		elapsed := now.Sub(row.TurnStartedAt).Milliseconds()
		if elapsed < 0 { elapsed = 0 }
		if turn == "w" {
			whiteClock -= elapsed
			if whiteClock < 0 { whiteClock = 0 }
		} else {
			blackClock -= elapsed
			if blackClock < 0 { blackClock = 0 }
		}
	}

	var opponentDisconnectDeadline any
	if row.Status == "active" && opponentPresence == "disconnected" && !opponentGrace.IsZero() {
		opponentDisconnectDeadline = stamp(opponentGrace.Add(disconnectGrace))
	}

	history := row.History
	if history == nil { history = []bson.M{} }

	youReady := row.BlackReady
	opponentReady := row.WhiteReady
	youAre := "b"
	if isWhite {
		youReady = row.WhiteReady
		opponentReady = row.BlackReady
		youAre = "w"
	}
	yourTurn := row.Status == "active" && ((turn == "w") == isWhite)

	return map[string]any{
		"id": row.ID,
		"white": row.White,
		"black": row.Black,
		"whiteDisplayName": whiteDisplay,
		"blackDisplayName": blackDisplay,
		"whiteActorKind": whiteKind,
		"blackActorKind": blackKind,
		"whiteActorLabel": whiteLabel,
		"blackActorLabel": blackLabel,
		"whiteRating": pointerInt64(row.WhiteRating, 400),
		"blackRating": pointerInt64(row.BlackRating, 400),
		"fen": row.FEN,
		"turn": turn,
		"status": row.Status,
		"result": pointerString(row.Result),
		"endReason": pointerString(row.EndReason),
		"startsAt": nullableStamp(row.StartAt),
		"readyDeadline": nullableStamp(row.ReadyDeadline),
		"youReady": youReady,
		"opponentReady": opponentReady,
		"opponentPresence": opponentPresence,
		"opponentSeenAt": opponentSeenAt,
		"opponentDisconnectDeadline": opponentDisconnectDeadline,
		"ratingChange": nil,
		"clock": map[string]any{
			"id": "10+0",
			"whiteMs": whiteClock,
			"blackMs": blackClock,
			"incrementMs": int64(0),
			"runningColor": runningColor,
		},
		"history": history,
		"revision": row.Revision,
		"youAre": youAre,
		"yourTurn": yourTurn,
		"createdAt": nullableStamp(row.CreatedAt),
		"updatedAt": nullableStamp(row.UpdatedAt),
	}
}

func publicChallenge(row challengeRow, username string) map[string]any {
	challengerRating := row.ChallengerRating
	if challengerRating == 0 {
		challengerRating = 400
	}
	opponentRating := row.OpponentRating
	if opponentRating == 0 {
		opponentRating = 400
	}
	direction := "outgoing"
	if row.Opponent == username {
		direction = "incoming"
	}
	var matchID any
	if strings.TrimSpace(row.MatchID) != "" {
		matchID = row.MatchID
	}
	return map[string]any{
		"id": row.ID,
		"challenger": row.Challenger,
		"opponent": row.Opponent,
		"challengerRating": challengerRating,
		"opponentRating": opponentRating,
		"status": row.Status,
		"direction": direction,
		"createdAt": stamp(row.CreatedAt),
		"expiresAt": stamp(row.CreatedAt.Add(challengeTTL)),
		"resolvedAt": nullableStamp(row.ResolvedAt),
		"matchId": matchID,
	}
}
