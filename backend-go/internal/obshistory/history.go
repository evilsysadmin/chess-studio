// Package obshistory writes the Admin observability history Python keeps in
// observability_history.py: anonymous 5-minute buckets in
// observability_5min_v2, accumulated in memory and flushed off the request
// path as $inc/$max deltas. Python and Go add to the same documents, so the
// two runtimes' samples merge instead of overwriting each other.
//
// Nothing here stores identity: no usernames, IPs, URLs beyond the route
// pattern, bodies or headers.
package obshistory

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	// BucketSeconds mirrors BUCKET_SECONDS.
	BucketSeconds = 5 * 60
	// CollectionName mirrors COLLECTION_NAME.
	CollectionName = "observability_5min_v2"
	// FlushInterval mirrors FLUSH_INTERVAL_SECONDS.
	FlushInterval = 30 * time.Second
	// RetentionSeconds mirrors RETENTION_SECONDS (the TTL index).
	RetentionSeconds = 100 * 24 * 60 * 60
	retentionIndex   = "observability_bucket_ttl_v2"
)

var (
	latencyBounds     = []int{25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000}
	frontendMSBounds  = []int{50, 100, 200, 500, 800, 1000, 1500, 2000, 2500, 4000, 6000, 10000, 20000}
	frontendCLSBounds = []int{10, 50, 100, 150, 250, 500, 1000, 2000, 5000}
)

// Store persists one bucket's deltas (UpsertBucket mirrors flush_pending's
// update_one).
type Store interface {
	EnsureRetention(ctx context.Context) error
	UpsertBucket(ctx context.Context, bucket int64, incs map[string]int64, maxima map[string]float64) error
}

type delta struct {
	incs   map[string]int64
	maxima map[string]float64
}

func newDelta() *delta {
	return &delta{incs: map[string]int64{}, maxima: map[string]float64{}}
}

func (d *delta) inc(path string, amount int64) {
	if amount != 0 {
		d.incs[path] += amount
	}
}

// max keeps the largest positive value: _mongo_update only sends maxima > 0.
func (d *delta) max(path string, value float64) {
	if value > 0 && value > d.maxima[path] {
		d.maxima[path] = value
	}
}

func (d *delta) merge(other *delta) {
	for path, amount := range other.incs {
		d.inc(path, amount)
	}
	for path, value := range other.maxima {
		d.max(path, value)
	}
}

func (d *delta) empty() bool { return len(d.incs) == 0 && len(d.maxima) == 0 }

// Recorder accumulates samples and flushes them. A nil *Recorder records
// nothing.
type Recorder struct {
	store Store
	now   func() time.Time

	mu      sync.Mutex
	pending map[int64]*delta

	flushMu    sync.Mutex
	indexReady bool
}

func New(store Store) *Recorder {
	return &Recorder{store: store, now: time.Now, pending: map[int64]*delta{}}
}

func bucketStart(at time.Time) int64 {
	value := max(0, at.Unix())
	return value - value%BucketSeconds
}

// safeKey mirrors _safe_key: urlsafe base64 (unpadded) of the first 160
// characters, so arbitrary labels are valid Mongo field names.
func safeKey(value string) string {
	if value == "" {
		value = "unknown"
	}
	encoded := base64.RawURLEncoding.EncodeToString([]byte(truncate(value, 160)))
	if encoded == "" {
		return "dW5rbm93bg"
	}
	return encoded
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func histKey(value float64, bounds []int) string {
	for _, boundary := range bounds {
		if value <= float64(boundary) {
			return fmt.Sprintf("le_%d", boundary)
		}
	}
	return "inf"
}

func (r *Recorder) bucket(at time.Time) *delta {
	key := bucketStart(at)
	d := r.pending[key]
	if d == nil {
		d = newDelta()
		r.pending[key] = d
	}
	return d
}

// RecordHTTP mirrors record_http_event for one request served natively.
func (r *Recorder) RecordHTTP(method, route string, status int, latencyMS float64, release string) {
	if r == nil {
		return
	}
	method = truncate(strings.ToUpper(method), 8)
	if method == "" {
		method = "?"
	}
	if route == "" {
		route = "unknown"
	}
	encodedRoute := safeKey(method + " " + truncate(route, 120))
	latency := math.Max(0, latencyMS)
	if math.IsNaN(latency) {
		latency = 0
	}
	family := 0
	if status > 0 {
		family = status / 100
	}
	hist := histKey(latency, latencyBounds)
	release = truncate(strings.TrimSpace(release), 40)

	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.bucket(r.now())
	d.inc("http.samples", 1)
	if family == 2 || family == 4 || family == 5 {
		d.inc(fmt.Sprintf("http.status_%dxx", family), 1)
	}
	d.inc("http.latency_hist."+hist, 1)
	d.max("http.latency_max_ms", latency)
	rows := []string{"http.routes." + encodedRoute}
	if release != "" {
		rows = append(rows, "http.releases."+safeKey(release))
	}
	for _, row := range rows {
		d.inc(row+".requests", 1)
		if family == 5 {
			d.inc(row+".errors_5xx", 1)
		}
		d.inc(row+".latency_hist."+hist, 1)
		d.max(row+".latency_max_ms", latency)
	}
}

// RecordPresence mirrors record_presence_snapshot: one anonymous count.
func (r *Recorder) RecordPresence(online int) {
	if r == nil {
		return
	}
	online = max(0, online)
	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.bucket(r.now())
	d.inc("presence.samples", 1)
	d.inc("presence.online_sum", int64(online))
	d.max("presence.online_max", float64(online))
}

// FrontendEvent is one sanitized client telemetry event (record_client_event).
type FrontendEvent struct {
	EventType  string
	MetricName string
	Value      *float64
	ErrorName  string
	Context    string
	Release    string
}

// RecordFrontend mirrors record_frontend_event.
func (r *Recorder) RecordFrontend(event FrontendEvent) {
	if r == nil {
		return
	}
	eventType := truncate(event.EventType, 32)
	if eventType == "" {
		eventType = "unknown"
	}
	metric := strings.ToUpper(truncate(event.MetricName, 16))
	errorName := truncate(event.ErrorName, 80)
	context := truncate(event.Context, 48)
	if context == "" {
		context = "unknown"
	}
	release := truncate(event.Release, 40)
	if release == "" {
		release = "unknown"
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.bucket(r.now())
	d.inc("frontend.samples", 1)
	d.inc("frontend.event_types."+safeKey(eventType), 1)
	d.inc("frontend.contexts."+safeKey(context), 1)
	d.inc("frontend.releases."+safeKey(release), 1)
	if eventType != "web_vital" {
		d.inc("frontend.errors", 1)
		if errorName != "" {
			d.inc("frontend.error_names."+safeKey(errorName), 1)
		}
	}
	if eventType == "web_vital" && metric != "" && event.Value != nil {
		scaled, bounds := math.Max(0, *event.Value), frontendMSBounds
		if metric == "CLS" {
			scaled, bounds = scaled*1000, frontendCLSBounds
		}
		row := "frontend.metrics." + safeKey(metric)
		d.inc(row+".samples", 1)
		d.inc(row+".hist."+histKey(scaled, bounds), 1)
		d.max(row+".value_max", scaled)
	}
}

// Flush mirrors flush_pending: every pending bucket, oldest first, is sent
// once; what fails to send stays pending for the next flush.
func (r *Recorder) Flush(ctx context.Context) error {
	if r == nil || r.store == nil {
		return nil
	}
	r.flushMu.Lock()
	defer r.flushMu.Unlock()

	r.mu.Lock()
	snapshot := r.pending
	r.pending = map[int64]*delta{}
	r.mu.Unlock()

	keys := make([]int64, 0, len(snapshot))
	for key, d := range snapshot {
		if !d.empty() {
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	if !r.indexReady {
		// One TTL index per process; failure never blocks the writes.
		r.indexReady = r.store.EnsureRetention(ctx) == nil
	}
	for i, key := range keys {
		if err := r.store.UpsertBucket(ctx, key, snapshot[key].incs, snapshot[key].maxima); err != nil {
			r.requeue(snapshot, keys[i:])
			return err
		}
	}
	return nil
}

func (r *Recorder) requeue(snapshot map[int64]*delta, keys []int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, key := range keys {
		current := r.pending[key]
		if current == nil {
			r.pending[key] = snapshot[key]
			continue
		}
		current.merge(snapshot[key])
	}
}

// Run flushes every FlushInterval until ctx ends, then once more with a
// short grace period so a clean shutdown keeps its last samples.
func (r *Recorder) Run(ctx context.Context) {
	if r == nil {
		return
	}
	ticker := time.NewTicker(FlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			final, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			_ = r.Flush(final)
			cancel()
			return
		case <-ticker.C:
			flushCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			_ = r.Flush(flushCtx)
			cancel()
		}
	}
}

// MongoStore is the production Store.
type MongoStore struct {
	collection *mongo.Collection
}

func NewMongoStore(database *mongo.Database) (*MongoStore, error) {
	if database == nil {
		return nil, errors.New("observability history needs a database")
	}
	return &MongoStore{collection: database.Collection(CollectionName)}, nil
}

func (s *MongoStore) EnsureRetention(ctx context.Context) error {
	_, err := s.collection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "bucket_start", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(RetentionSeconds).SetName(retentionIndex),
	})
	return err
}

// pyInt is how pymongo encodes a Python int: int32 when it fits.
func pyInt(value int64) any {
	if value >= math.MinInt32 && value <= math.MaxInt32 {
		return int32(value)
	}
	return value
}

func (s *MongoStore) UpsertBucket(ctx context.Context, bucket int64, incs map[string]int64, maxima map[string]float64) error {
	update := bson.D{{Key: "$setOnInsert", Value: bson.D{
		{Key: "bucket_start", Value: time.Unix(bucket, 0).UTC()},
		{Key: "schema", Value: int32(1)},
	}}}
	if len(incs) > 0 {
		values := bson.D{}
		for _, path := range sortedKeys(incs) {
			values = append(values, bson.E{Key: path, Value: pyInt(incs[path])})
		}
		update = append(update, bson.E{Key: "$inc", Value: values})
	}
	if len(maxima) > 0 {
		values := bson.D{}
		for _, path := range sortedKeys(maxima) {
			values = append(values, bson.E{Key: path, Value: maxima[path]})
		}
		update = append(update, bson.E{Key: "$max", Value: values})
	}
	_, err := s.collection.UpdateOne(ctx, bson.D{{Key: "_id", Value: pyInt(bucket)}}, update, options.UpdateOne().SetUpsert(true))
	return err
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
