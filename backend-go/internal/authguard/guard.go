// Package authguard mirrors backend-python/auth_login_guard.py and
// auth_ip_guard.py: shared, Mongo-backed brute-force guards for public
// authentication, keyed by non-reversible fingerprints. Python and Go read
// and write the same documents (same ids, fields, CAS on _guard_version).
package authguard

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ErrUnavailable is PersistentStorageUnavailable.
var ErrUnavailable = errors.New("auth guard storage unavailable")

// Policy is one guard's constants.
type Policy struct {
	Collection   string
	IndexName    string
	FailureLimit int64
	Window       time.Duration
	Block        time.Duration
	Retention    time.Duration
	// BlockEvent is the operational log event of a new block.
	BlockEvent string
	// IdentityInEvent adds identity_fingerprint to the event (login guard).
	IdentityInEvent bool
	// CacheBlocks keeps active blocks in process (IP guard).
	CacheBlocks bool
}

const casAttempts = 8

// blockCacheLimit mirrors BLOCK_CACHE_LIMIT.
const blockCacheLimit = 4096

var (
	// LoginIdentity mirrors auth_login_guard.
	LoginIdentity = Policy{
		Collection: "auth_login_guard", IndexName: "auth_login_guard_ttl",
		FailureLimit: 20, Window: 10 * time.Minute, Block: 5 * time.Minute, Retention: 24 * time.Hour,
		BlockEvent: "auth_login_identity_ban_activated", IdentityInEvent: true,
	}
	// ClientIP mirrors auth_ip_guard.
	ClientIP = Policy{
		Collection: "auth_ip_guard", IndexName: "auth_ip_guard_ttl",
		FailureLimit: 10, Window: 10 * time.Minute, Block: 15 * time.Minute, Retention: 24 * time.Hour,
		BlockEvent: "auth_ip_ban_activated", CacheBlocks: true,
	}
)

// IdentityKey mirrors auth_login_guard.identity_key.
func IdentityKey(username, secret string) string {
	normalized := strings.ToLower(strings.TrimSpace(username))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("chess-studio:auth-login-identity\x00"))
	mac.Write([]byte(normalized))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// IPKey mirrors auth_ip_guard.ip_key. Python's message ends in a literal
// backslash-x00 (an escaped string), not a NUL byte; the fingerprints in
// Mongo depend on it.
func IPKey(ip, secret string) (string, error) {
	addr, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(`chess-studio:auth-ip-guard\x00`))
	mac.Write([]byte(addr.String()))
	return hex.EncodeToString(mac.Sum(nil))[:32], nil
}

// State is a guard document's tracked fields.
type State struct {
	WindowStartedAt *time.Time
	Failures        int64
	BlockedUntil    *time.Time
	UpdatedAt       time.Time
}

func field(doc bson.D, key string) (any, bool) {
	for _, e := range doc {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

// asUTC mirrors _as_utc.
func asUTC(value any) (time.Time, bool) {
	switch v := value.(type) {
	case bson.DateTime:
		return v.Time().UTC(), true
	case time.Time:
		return v.UTC(), true
	case string:
		text := strings.Replace(v, "Z", "+00:00", 1)
		for _, layout := range []string{
			"2006-01-02T15:04:05.999999999-07:00", "2006-01-02 15:04:05.999999999-07:00",
			"2006-01-02T15:04:05.999999999", "2006-01-02 15:04:05.999999999",
			"2006-01-02T15:04-07:00", "2006-01-02T15:04", "2006-01-02",
		} {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed.UTC(), true
			}
		}
	}
	return time.Time{}, false
}

// pyIntLoose is int(value) for what a guard document may hold; ok false
// where Python raises TypeError/ValueError.
func pyIntLoose(value any) (int64, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, false
		}
		return int64(v), true
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return n, err == nil
	}
	return 0, false
}

// pyNow is datetime.now(timezone.utc): microsecond precision.
func pyNow(t time.Time) time.Time { return t.UTC().Truncate(time.Microsecond) }

// RetryAfterSeconds mirrors retry_after_seconds.
func RetryAfterSeconds(doc bson.D, now time.Time) int {
	raw, _ := field(doc, "blocked_until")
	blocked, ok := asUTC(raw)
	if !ok || !blocked.After(now) {
		return 0
	}
	micros := blocked.Sub(now).Microseconds()
	return int(max(1, (micros+999_999)/1_000_000))
}

// StateAfterFailure mirrors state_after_failure.
func (p Policy) StateAfterFailure(doc bson.D, now time.Time) State {
	rawWindow, _ := field(doc, "window_started_at")
	window, hasWindow := asUTC(rawWindow)
	rawBlocked, _ := field(doc, "blocked_until")
	blocked, hasBlocked := asUTC(rawBlocked)

	expiredBlock := hasBlocked && !blocked.After(now)
	expiredWindow := !hasWindow || now.Sub(window) >= p.Window
	reset := expiredBlock || expiredWindow

	previous := int64(0)
	if raw, present := field(doc, "failures"); present {
		if n, ok := pyIntLoose(raw); ok {
			previous = max(0, n)
		}
	}
	state := State{UpdatedAt: now}
	if reset {
		state.Failures = 1
		started := now
		state.WindowStartedAt = &started
	} else {
		state.Failures = previous + 1
		started := window
		state.WindowStartedAt = &started
	}
	if state.Failures >= p.FailureLimit {
		until := now.Add(p.Block)
		state.BlockedUntil = &until
	}
	return state
}

func (s State) doc() bson.D {
	var window, blocked any
	if s.WindowStartedAt != nil {
		window = *s.WindowStartedAt
	}
	if s.BlockedUntil != nil {
		blocked = *s.BlockedUntil
	}
	return bson.D{
		{Key: "window_started_at", Value: window},
		{Key: "failures", Value: int32(s.Failures)},
		{Key: "blocked_until", Value: blocked},
		{Key: "updated_at", Value: s.UpdatedAt},
	}
}

// Store is the slice of a guard collection the guard needs.
type Store interface {
	EnsureTTL(ctx context.Context, name string, after time.Duration) error
	Find(ctx context.Context, id string) (bson.D, bool, error)
	Insert(ctx context.Context, doc bson.D) (duplicate bool, err error)
	Update(ctx context.Context, filter, update bson.D) (matched bool, err error)
	Delete(ctx context.Context, id string) error
}

// Guard is one policy over its store.
type Guard struct {
	policy Policy
	store  Store
	now    func() time.Time
	logf   func(string)

	mu         sync.Mutex
	indexReady bool
	cache      map[string]time.Time
	cacheOrder []string
}

func New(policy Policy, store Store) *Guard {
	return &Guard{
		policy: policy, store: store, now: time.Now,
		logf:  func(line string) { log.Print(line) },
		cache: map[string]time.Time{},
	}
}

func (g *Guard) ensureIndex(ctx context.Context) error {
	g.mu.Lock()
	ready := g.indexReady
	g.mu.Unlock()
	if ready {
		return nil
	}
	if err := g.store.EnsureTTL(ctx, g.policy.IndexName, g.policy.Retention); err != nil {
		return ErrUnavailable
	}
	g.mu.Lock()
	g.indexReady = true
	g.mu.Unlock()
	return nil
}

// RetryAfter mirrors retry_after: seconds until the block ends, 0 if none.
func (g *Guard) RetryAfter(ctx context.Context, id string) (int, error) {
	now := pyNow(g.now())
	if g.policy.CacheBlocks {
		if retry := g.cachedRetry(id, now); retry > 0 {
			return retry, nil
		}
	}
	if err := g.ensureIndex(ctx); err != nil {
		return 0, err
	}
	doc, _, err := g.store.Find(ctx, id)
	if err != nil {
		return 0, ErrUnavailable
	}
	retry := RetryAfterSeconds(doc, now)
	if retry > 0 && g.policy.CacheBlocks {
		g.remember(id, doc, now)
	}
	return retry, nil
}

// RecordFailure mirrors record_failure: one more failure under CAS, and the
// Retry-After it leads to.
func (g *Guard) RecordFailure(ctx context.Context, id string) (int, error) {
	if err := g.ensureIndex(ctx); err != nil {
		return 0, err
	}
	for attempt := 0; attempt < casAttempts; attempt++ {
		current, found, err := g.store.Find(ctx, id)
		if err != nil {
			return 0, ErrUnavailable
		}
		now := pyNow(g.now())
		next := g.policy.StateAfterFailure(current, now)
		nextDoc := next.doc()
		retry := RetryAfterSeconds(nextDoc, now)
		if !found {
			doc := append(bson.D{{Key: "_id", Value: id}, {Key: "_guard_version", Value: int32(1)}}, nextDoc...)
			duplicate, err := g.store.Insert(ctx, doc)
			if duplicate {
				continue
			}
			if err != nil {
				return 0, ErrUnavailable
			}
			g.afterWrite(id, nil, nextDoc, now, retry)
			return retry, nil
		}
		var versionFilter any = bson.D{{Key: "$exists", Value: false}}
		if raw, present := field(current, "_guard_version"); present {
			version, ok := pyIntLoose(raw)
			if !ok {
				version = 0
			}
			versionFilter = pyInt(max(0, version))
		}
		matched, err := g.store.Update(ctx,
			bson.D{{Key: "_id", Value: id}, {Key: "_guard_version", Value: versionFilter}},
			bson.D{{Key: "$set", Value: nextDoc}, {Key: "$inc", Value: bson.D{{Key: "_guard_version", Value: int32(1)}}}},
		)
		if err != nil {
			return 0, ErrUnavailable
		}
		if matched {
			g.afterWrite(id, current, nextDoc, now, retry)
			return retry, nil
		}
	}
	return 0, ErrUnavailable
}

// afterWrite mirrors the block cache and the activation log of each guard
// (the IP guard logs only updates; both log a block that just started).
func (g *Guard) afterWrite(id string, previous, next bson.D, now time.Time, retry int) {
	if retry <= 0 {
		return
	}
	if g.policy.CacheBlocks {
		g.remember(id, next, now)
		if previous == nil {
			return // Python's IP guard does not log the inserting write
		}
	}
	if RetryAfterSeconds(previous, now) > 0 {
		return
	}
	event := map[string]any{
		"event":          g.policy.BlockEvent,
		"failure_limit":  g.policy.FailureLimit,
		"window_seconds": int64(g.policy.Window / time.Second),
		"block_seconds":  int64(g.policy.Block / time.Second),
	}
	if g.policy.IdentityInEvent {
		identity := id
		if len(identity) > 64 {
			identity = identity[:64]
		}
		event["identity_fingerprint"] = identity
	}
	line, _ := json.Marshal(event) // keys sorted, compact: Python's separators/sort_keys
	g.logf(string(line))
}

// Clear mirrors clear (after a successful login).
func (g *Guard) Clear(ctx context.Context, id string) error {
	if err := g.ensureIndex(ctx); err != nil {
		return err
	}
	if err := g.store.Delete(ctx, id); err != nil {
		return ErrUnavailable
	}
	return nil
}

func (g *Guard) cachedRetry(id string, now time.Time) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	until, ok := g.cache[id]
	if !ok {
		return 0
	}
	if !until.After(now) {
		delete(g.cache, id)
		return 0
	}
	micros := until.Sub(now).Microseconds()
	return int(max(1, (micros+999_999)/1_000_000))
}

// remember mirrors _remember_active_block: bounded, oldest evicted first.
func (g *Guard) remember(id string, doc bson.D, now time.Time) {
	raw, _ := field(doc, "blocked_until")
	until, ok := asUTC(raw)
	g.mu.Lock()
	defer g.mu.Unlock()
	if !ok || !until.After(now) {
		delete(g.cache, id)
		return
	}
	if _, exists := g.cache[id]; !exists {
		g.cacheOrder = append(g.cacheOrder, id)
	}
	g.cache[id] = until
	for len(g.cache) > blockCacheLimit && len(g.cacheOrder) > 0 {
		oldest := g.cacheOrder[0]
		g.cacheOrder = g.cacheOrder[1:]
		delete(g.cache, oldest)
	}
}

func pyInt(v int64) any {
	if v >= math.MinInt32 && v <= math.MaxInt32 {
		return int32(v)
	}
	return v
}

// MongoStore is the production Store.
type MongoStore struct {
	col     *mongo.Collection
	timeout time.Duration
}

func NewMongo(db *mongo.Database, policy Policy, timeout time.Duration) *MongoStore {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &MongoStore{col: db.Collection(policy.Collection), timeout: timeout}
}

func (m *MongoStore) EnsureTTL(ctx context.Context, name string, after time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "updated_at", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(int32(after / time.Second)).SetName(name),
	})
	return err
}

func (m *MongoStore) Find(ctx context.Context, id string) (bson.D, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	var doc bson.D
	err := m.col.FindOne(ctx, bson.D{{Key: "_id", Value: id}}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return doc, true, nil
}

func (m *MongoStore) Insert(ctx context.Context, doc bson.D) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.col.InsertOne(ctx, doc)
	if mongo.IsDuplicateKeyError(err) {
		return true, nil
	}
	return false, err
}

func (m *MongoStore) Update(ctx context.Context, filter, update bson.D) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	result, err := m.col.UpdateOne(ctx, filter, update)
	if err != nil {
		return false, err
	}
	return result.MatchedCount == 1, nil
}

func (m *MongoStore) Delete(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: id}})
	return err
}
