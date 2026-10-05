package presence

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	// sessionTTL mirrors _PRESENCE_SESSION_TTL_S: a tab counts as online.
	sessionTTL = 150 * time.Second
	// sessionRetention mirrors _PRESENCE_SESSION_RETENTION_S.
	sessionRetention = 15 * time.Minute
	// pruneInterval mirrors _PRESENCE_PRUNE_INTERVAL_S.
	pruneInterval = 10 * time.Minute
)

// ErrUnavailable is PersistentStorageUnavailable (the route answers 503).
var ErrUnavailable = errors.New("users storage unavailable")

// SessionStore is the slice of the users collection heartbeats and logouts
// need.
type SessionStore interface {
	// Update runs one update_one and reports whether it matched.
	Update(ctx context.Context, filter, update bson.D) (bool, error)
	// PresenceSessions is find_one(projection presence_sessions).
	PresenceSessions(ctx context.Context, username string) (bson.D, bool, error)
}

// Sessions mirrors users_store.touch_last_activity(force=True) for the
// activity heartbeat and users_store.mark_logged_out for logout.
type Sessions struct {
	store   SessionStore
	toucher *Toucher
	timeout time.Duration
	now     func() time.Time

	mu        sync.Mutex
	lastPrune map[string]time.Time
}

// NewSessions shares the coalescing state of toucher: a forced write counts
// as the account's last write, as in Python's single per-process map.
func NewSessions(store SessionStore, toucher *Toucher, timeout time.Duration) *Sessions {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &Sessions{store: store, toucher: toucher, timeout: timeout, now: time.Now, lastPrune: map[string]time.Time{}}
}

// Heartbeat is the sanitized body of POST /api/auth/activity.
type Heartbeat struct {
	Activity   string
	Foreground *bool
	Release    string
	// Detached is a touch made without the request's network or browser
	// session (Python's _touch_activity_best_effort(..., request=None)).
	Detached bool
}

// Beat writes one forced activity heartbeat.
func (s *Sessions) Beat(r *http.Request, username string, beat Heartbeat) error {
	now := s.now()
	value := PyUTCISOFormat(now)
	fields := bson.D{{Key: "last_activity", Value: value}, {Key: "presence_online", Value: true}}
	if beat.Activity != "" {
		fields = append(fields, bson.E{Key: "current_activity", Value: beat.Activity})
	}
	if beat.Foreground != nil {
		fields = append(fields, bson.E{Key: "is_foreground", Value: *beat.Foreground}, bson.E{Key: "foreground_updated_at", Value: value})
	}
	if beat.Release != "" {
		fields = append(fields, bson.E{Key: "client_release", Value: beat.Release})
	}
	var ip, country string
	if s.toucher != nil && !beat.Detached {
		ip, country = s.toucher.clientNetwork(r)
	}
	if ip != "" {
		fields = append(fields, bson.E{Key: "last_client_ip", Value: truncate(ip, 64)})
	}
	if country != "" {
		fields = append(fields, bson.E{Key: "last_client_country", Value: strings.ToUpper(truncate(country, 2))})
	}
	session := ""
	if !beat.Detached {
		session = sessionID(r)
	}
	if session != "" {
		prefix := "presence_sessions." + session
		fields = append(fields, bson.E{Key: prefix + ".last_activity", Value: value})
		if beat.Activity != "" {
			fields = append(fields, bson.E{Key: prefix + ".activity", Value: beat.Activity})
		}
		if beat.Foreground != nil {
			fields = append(fields, bson.E{Key: prefix + ".foreground", Value: *beat.Foreground}, bson.E{Key: prefix + ".foreground_updated_at", Value: value})
		}
		if beat.Release != "" {
			fields = append(fields, bson.E{Key: prefix + ".release", Value: beat.Release})
		}
	}
	// force=True also anchors last_login (Python writes it on every forced
	// touch, the heartbeat included).
	fields = append(fields, bson.E{Key: "last_login", Value: value})

	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), s.timeout)
	defer cancel()
	matched, err := s.store.Update(ctx, bson.D{{Key: "_id", Value: username}}, bson.D{{Key: "$set", Value: fields}})
	if err != nil {
		return ErrUnavailable
	}
	// A token of a deleted account must not recreate it, nor count as a
	// write (Python returns before recording it).
	if !matched {
		return nil
	}
	if s.toucher != nil {
		s.toucher.markWritten(username, now)
	}
	if session == "" {
		return nil
	}
	s.mu.Lock()
	previous, seen := s.lastPrune[username]
	due := !seen || now.Sub(previous) >= pruneInterval
	if due {
		s.lastPrune[username] = now
	}
	s.mu.Unlock()
	if due {
		s.prune(ctx, username, now)
	}
	return nil
}

// prune mirrors the best-effort cleanup of tabs that never logged out: each
// stale session is unset only if it still holds the timestamp that was read.
func (s *Sessions) prune(ctx context.Context, username string, now time.Time) {
	sessions, found, err := s.store.PresenceSessions(ctx, username)
	if err != nil || !found {
		return
	}
	cutoff := now.Add(-max(sessionTTL+time.Second, sessionRetention))
	for _, e := range sessions {
		path := "presence_sessions." + e.Key
		row, isDoc := e.Value.(bson.D)
		var guard bson.E
		if !isDoc {
			guard = bson.E{Key: path + ".last_activity", Value: bson.D{{Key: "$exists", Value: false}}}
		} else {
			raw := lookup(row, "last_activity")
			parsed, ok := parsePresenceTime(raw)
			if ok && !parsed.Before(cutoff) {
				continue
			}
			if raw == nil {
				guard = bson.E{Key: path + ".last_activity", Value: bson.D{{Key: "$exists", Value: false}}}
			} else {
				guard = bson.E{Key: path + ".last_activity", Value: raw}
			}
		}
		_, _ = s.store.Update(ctx, bson.D{{Key: "_id", Value: username}, guard}, bson.D{{Key: "$unset", Value: bson.D{{Key: path, Value: ""}}}})
	}
}

// Logout mirrors mark_logged_out: only this browser session leaves; the
// account stays online while another live session exists.
func (s *Sessions) Logout(r *http.Request, username string) error {
	now := s.now()
	value := PyUTCISOFormat(now)
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), s.timeout)
	defer cancel()
	filter := bson.D{{Key: "_id", Value: username}}
	offline := bson.D{{Key: "presence_online", Value: false}, {Key: "is_foreground", Value: false}, {Key: "foreground_updated_at", Value: value}}
	session := sessionID(r)
	if session == "" {
		if _, err := s.store.Update(ctx, filter, bson.D{{Key: "$set", Value: offline}}); err != nil {
			return ErrUnavailable
		}
		return nil
	}
	if _, err := s.store.Update(ctx, filter, bson.D{{Key: "$unset", Value: bson.D{{Key: "presence_sessions." + session, Value: ""}}}}); err != nil {
		return ErrUnavailable
	}
	sessions, _, err := s.store.PresenceSessions(ctx, username)
	if err != nil {
		return ErrUnavailable
	}
	fields := offline
	if parsed, row, ok := latestLiveSession(sessions, now); ok {
		iso := PyUTCISOFormat(parsed)
		fields = bson.D{
			{Key: "presence_online", Value: true},
			{Key: "last_activity", Value: iso},
			{Key: "is_foreground", Value: truthy(lookup(row, "foreground"))},
		}
		if updated := lookup(row, "foreground_updated_at"); truthy(updated) {
			fields = append(fields, bson.E{Key: "foreground_updated_at", Value: updated})
		} else {
			fields = append(fields, bson.E{Key: "foreground_updated_at", Value: iso})
		}
		if activity := lookup(row, "activity"); truthy(activity) {
			fields = append(fields, bson.E{Key: "current_activity", Value: activity})
		}
		if release := lookup(row, "release"); truthy(release) {
			fields = append(fields, bson.E{Key: "client_release", Value: release})
		}
	}
	if _, err := s.store.Update(ctx, filter, bson.D{{Key: "$set", Value: fields}}); err != nil {
		return ErrUnavailable
	}
	return nil
}

// latestLiveSession mirrors _latest_live_presence_session.
func latestLiveSession(sessions bson.D, now time.Time) (time.Time, bson.D, bool) {
	type candidate struct {
		at  time.Time
		id  string
		row bson.D
	}
	cutoff := now.Add(-sessionTTL)
	var live []candidate
	for _, e := range sessions {
		row, ok := e.Value.(bson.D)
		if !ok {
			continue
		}
		parsed, ok := parsePresenceTime(lookup(row, "last_activity"))
		if !ok || parsed.Before(cutoff) {
			continue
		}
		live = append(live, candidate{at: parsed, id: e.Key, row: row})
	}
	if len(live) == 0 {
		return time.Time{}, nil, false
	}
	sort.Slice(live, func(i, j int) bool {
		if !live[i].at.Equal(live[j].at) {
			return live[i].at.After(live[j].at)
		}
		return live[i].id > live[j].id
	})
	return live[0].at, live[0].row, true
}

// parsePresenceTime mirrors _parse_presence_time (datetime.fromisoformat
// with "Z" accepted and naive values taken as UTC).
func parsePresenceTime(raw any) (time.Time, bool) {
	switch v := raw.(type) {
	case nil:
		return time.Time{}, false
	case bson.DateTime:
		return v.Time().UTC(), true
	case time.Time:
		return v.UTC(), true
	case string:
		text := strings.Replace(strings.TrimSpace(v), "Z", "+00:00", 1)
		if text == "" {
			return time.Time{}, false
		}
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

func lookup(doc bson.D, key string) any {
	for _, e := range doc {
		if e.Key == key {
			return e.Value
		}
	}
	return nil
}

// truthy is Python's bool(value) for BSON values.
func truthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case string:
		return v != ""
	case int32:
		return v != 0
	case int64:
		return v != 0
	case float64:
		return v != 0
	case bson.D:
		return len(v) > 0
	case bson.A:
		return len(v) > 0
	}
	return true
}

func (t *Toucher) markWritten(username string, at time.Time) {
	t.mu.Lock()
	t.lastWrite[username] = at
	t.mu.Unlock()
}

// MongoSessions is the production SessionStore over "users".
type MongoSessions struct{ col *mongo.Collection }

func NewMongoSessions(db *mongo.Database) *MongoSessions {
	return &MongoSessions{col: db.Collection("users")}
}

func (m *MongoSessions) Update(ctx context.Context, filter, update bson.D) (bool, error) {
	result, err := m.col.UpdateOne(ctx, filter, update)
	if err != nil {
		return false, err
	}
	return result.MatchedCount > 0, nil
}

func (m *MongoSessions) PresenceSessions(ctx context.Context, username string) (bson.D, bool, error) {
	var doc bson.D
	err := m.col.FindOne(ctx, bson.D{{Key: "_id", Value: username}}, options.FindOne().SetProjection(bson.D{{Key: "presence_sessions", Value: 1}})).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	sessions, _ := lookup(doc, "presence_sessions").(bson.D)
	return sessions, true, nil
}
