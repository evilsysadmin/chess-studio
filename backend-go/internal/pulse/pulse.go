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
	nativeHeaderValue    = "lobby-pulse"
	mongoApplicationName = "chess-studio-pvp-go"
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
}

type HandlerConfig struct {
	Store          Store
	JWTSecret      string
	AllowedOrigins []string
	PollAfter      time.Duration
	EnableRoster   bool
	EnableChat     bool
	EnableChallengeResolution bool
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
	for _, raw := range cfg.AllowedOrigins {
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
		"resolvedAt": stamp(row.ResolvedAt),
		"matchId": matchID,
	}
}
