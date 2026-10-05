package obshistory

// The read side of observability_history.py: get_history merges the legacy
// hourly buckets and the 5-minute ones in [from, to] (plus what could not be
// flushed) and summarizes them for Admin's observability panel.
//
// Bucket documents are written by both runtimes and read back loosely, so
// the merge and the summaries reproduce Python's arithmetic on whatever
// shapes they hold: ints stay ints until a float joins them, *_max keys keep
// the largest float, counters ignore bools and strings, and the shapes that
// make Python raise (a number where a dict was, a non-empty dict where a
// number was) raise here too.

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	// LegacyCollectionName mirrors LEGACY_COLLECTION_NAME (hourly, read only).
	LegacyCollectionName = "observability_hourly_v1"
	defaultRangeSeconds  = 24 * 60 * 60
	maxRangeSeconds      = 90 * 24 * 60 * 60
)

// RangeError is the ValueError get_history raises for a bad range; the
// route answers it as a 400 with this message.
type RangeError struct{ Message string }

func (e *RangeError) Error() string { return e.Message }

// ErrRaised stands for any other exception Python would raise (TypeError,
// AttributeError, OverflowError...): the route's generic 500.
var ErrRaised = errors.New("observability history: python would raise")

// BucketReader streams one collection's bucket documents with _id in
// [lower, upper], in natural order.
type BucketReader interface {
	Buckets(ctx context.Context, collection string, lower, upper int64, each func(bson.D) error) error
}

// MongoReader is the production BucketReader.
type MongoReader struct{ database *mongo.Database }

func NewMongoReader(database *mongo.Database) *MongoReader { return &MongoReader{database: database} }

func (m *MongoReader) Buckets(ctx context.Context, collection string, lower, upper int64, each func(bson.D) error) error {
	cursor, err := m.database.Collection(collection).Find(ctx, bson.D{{Key: "_id", Value: bson.D{
		{Key: "$gte", Value: pyInt(lower)}, {Key: "$lte", Value: pyInt(upper)},
	}}})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return err
		}
		if err := each(pydoc.Normalize(doc).(bson.D)); err != nil {
			return err
		}
	}
	return cursor.Err()
}

// dict is a Python dict of merged counters: values are *dict, int64 or
// float64, keys in insertion order.
type dict struct {
	keys []string
	vals map[string]any
}

func newDict() *dict { return &dict{vals: map[string]any{}} }

func (d *dict) get(key string) (any, bool) {
	v, ok := d.vals[key]
	return v, ok
}

func (d *dict) set(key string, value any) {
	if _, ok := d.vals[key]; !ok {
		d.keys = append(d.keys, key)
	}
	d.vals[key] = value
}

func dictOf(pairs ...any) *dict {
	d := newDict()
	for i := 0; i < len(pairs); i += 2 {
		d.set(pairs[i].(string), pairs[i+1])
	}
	return d
}

// freshBucket is _fresh_bucket().
func freshBucket() *dict {
	return dictOf(
		"http", dictOf("samples", int64(0), "status_2xx", int64(0), "status_4xx", int64(0), "status_5xx", int64(0),
			"latency_hist", newDict(), "latency_max_ms", 0.0, "routes", newDict(), "releases", newDict()),
		"ai", dictOf("samples", int64(0), "cloudflare", int64(0), "local", int64(0), "latency_hist", newDict(),
			"latency_max_ms", 0.0, "input_tokens", int64(0), "output_tokens", int64(0), "reasons", newDict(),
			"event_types", newDict(), "request_kinds", newDict(), "models", newDict(), "worker_errors", newDict(),
			"channels", newDict()),
		"presence", dictOf("samples", int64(0), "online_sum", int64(0), "online_max", int64(0)),
		"frontend", dictOf("samples", int64(0), "errors", int64(0), "event_types", newDict(), "error_names", newDict(),
			"contexts", newDict(), "releases", newDict(), "metrics", newDict()),
	)
}

func isMaxKey(key string) bool {
	return strings.HasSuffix(key, "_max_ms") || strings.HasSuffix(key, "_max")
}

// sourceNumber is isinstance(value, (int, float)) and not bool.
func sourceNumber(value any) (any, bool) {
	switch v := value.(type) {
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	case float64:
		return v, true
	}
	return nil, false
}

func asFloat(value any) float64 {
	if f, ok := value.(float64); ok {
		return f
	}
	return float64(value.(int64))
}

// add is target.get(key, 0) + value.
func add(current, value any) (any, error) {
	if current == nil {
		current = int64(0)
	}
	if _, isDict := current.(*dict); isDict {
		return nil, ErrRaised
	}
	a, aInt := current.(int64)
	b, bInt := value.(int64)
	if aInt && bInt {
		return a + b, nil
	}
	return asFloat(current) + asFloat(value), nil
}

// floatOr0 is float(value or 0.0).
func floatOr0(value any) (float64, error) {
	switch v := value.(type) {
	case nil:
		return 0, nil
	case *dict:
		if len(v.keys) == 0 {
			return 0, nil
		}
		return 0, ErrRaised
	case int64:
		return float64(v), nil
	case float64:
		return v, nil
	}
	return 0, ErrRaised
}

// intOr0 is int(value or 0).
func intOr0(value any) (int64, error) {
	switch v := value.(type) {
	case nil:
		return 0, nil
	case *dict:
		if len(v.keys) == 0 {
			return 0, nil
		}
		return 0, ErrRaised
	case int64:
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Abs(v) >= 9.2e18 {
			return 0, ErrRaised
		}
		return int64(v), nil
	}
	return 0, ErrRaised
}

func nonNeg(value any) (int64, error) {
	n, err := intOr0(value)
	return max(0, n), err
}

// mergeNumeric is _merge_numeric: in place, so a raise leaves the keys
// before it merged, as in Python.
func mergeNumeric(target *dict, source bson.D) error {
	for _, e := range source {
		if nested, ok := e.Value.(bson.D); ok {
			row, present := target.get(e.Key)
			if !present {
				row = newDict()
				target.set(e.Key, row)
			}
			if rowDict, isDict := row.(*dict); isDict {
				if err := mergeNumeric(rowDict, nested); err != nil {
					return err
				}
			}
			continue
		}
		value, ok := sourceNumber(e.Value)
		if !ok {
			continue
		}
		current, _ := target.get(e.Key)
		if isMaxKey(e.Key) {
			f, err := floatOr0(current)
			if err != nil {
				return err
			}
			if v := asFloat(value); v > f {
				f = v
			}
			target.set(e.Key, f)
			continue
		}
		sum, err := add(current, value)
		if err != nil {
			return err
		}
		target.set(e.Key, sum)
	}
	return nil
}

// toSource turns a merged dict back into a merge source.
func toSource(d *dict) bson.D {
	out := make(bson.D, 0, len(d.keys))
	for _, key := range d.keys {
		value := d.vals[key]
		if nested, ok := value.(*dict); ok {
			value = toSource(nested)
		}
		out = append(out, bson.E{Key: key, Value: value})
	}
	return out
}

// mapping is `value or {}` used as a dict: a falsy value is {}, a truthy
// non-dict raises AttributeError on .get/.items.
func mapping(value any) (*dict, error) {
	switch v := value.(type) {
	case nil:
		return newDict(), nil
	case *dict:
		return v, nil
	case int64:
		if v == 0 {
			return newDict(), nil
		}
	case float64:
		if v == 0 {
			return newDict(), nil
		}
	}
	return nil, ErrRaised
}

func field(d *dict, key string) any {
	v, _ := d.get(key)
	return v
}

func subMapping(d *dict, key string) (*dict, error) { return mapping(field(d, key)) }

// unsafeKey is _unsafe_key: urlsafe_b64decode as CPython 3.13 runs it
// (characters outside the alphabet skipped, '=' never ends the input, a
// trailing partial quad needs enough pads), then strict UTF-8; anything that
// raises is "unknown".
func unsafeKey(value string) string {
	for _, r := range value {
		if r >= utf8.RuneSelf {
			return "unknown"
		}
	}
	padded := value + strings.Repeat("=", (4-len(value)%4)%4)
	var out []byte
	quad, pads := 0, 0
	var left byte
	for i := 0; i < len(padded); i++ {
		c := padded[i]
		if c == '=' {
			if quad >= 2 {
				pads++
			}
			continue
		}
		v, ok := b64Value(c)
		if !ok {
			continue
		}
		pads = 0
		switch quad {
		case 0:
			quad, left = 1, v
		case 1:
			out = append(out, left<<2|v>>4)
			quad, left = 2, v&0x0f
		case 2:
			out = append(out, left<<4|v>>2)
			quad, left = 3, v&0x03
		case 3:
			out = append(out, left<<6|v)
			quad, left = 0, 0
		}
	}
	if quad == 1 || (quad != 0 && quad+pads < 4) {
		return "unknown"
	}
	if !utf8.Valid(out) {
		return "unknown"
	}
	return string(out)
}

// b64Value maps urlsafe_b64decode's alphabet ('-' and '_' translated to '+'
// and '/', which stay valid too).
func b64Value(c byte) (byte, bool) {
	switch {
	case c >= 'A' && c <= 'Z':
		return c - 'A', true
	case c >= 'a' && c <= 'z':
		return c - 'a' + 26, true
	case c >= '0' && c <= '9':
		return c - '0' + 52, true
	case c == '+' || c == '-':
		return 62, true
	case c == '/' || c == '_':
		return 63, true
	}
	return 0, false
}

// pyRound is Python's round(x, digits) for floats.
func pyRound(x float64, digits int) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

// histPercentile is _hist_percentile_for_bounds (digits 2 for latencies,
// 3 for frontend vitals).
func histPercentile(hist *dict, bounds []int, percentile, maxValue float64, digits int) (any, error) {
	type bin struct {
		boundary float64
		count    int64
	}
	var counts []bin
	var total int64
	for _, boundary := range bounds {
		count, err := nonNeg(field(hist, fmt.Sprintf("le_%d", boundary)))
		if err != nil {
			return nil, err
		}
		if count != 0 {
			counts = append(counts, bin{float64(boundary), count})
			total += count
		}
	}
	inf, err := nonNeg(field(hist, "inf"))
	if err != nil {
		return nil, err
	}
	if inf != 0 {
		counts = append(counts, bin{math.Max(maxValue, float64(bounds[len(bounds)-1])), inf})
		total += inf
	}
	if total == 0 {
		return nil, nil
	}
	target := max(1, int64(math.Ceil(float64(total)*percentile)))
	var seen int64
	for _, b := range counts {
		seen += b.count
		if seen >= target {
			return pyRound(b.boundary, digits), nil
		}
	}
	return pyRound(counts[len(counts)-1].boundary, digits), nil
}

// latency is _hist_percentile(row.get(hist) or {}, p, float(row.get(max) or 0.0)).
func latency(row *dict, histKey, maxKey string, percentile float64) (any, error) {
	hist, err := subMapping(row, histKey)
	if err != nil {
		return nil, err
	}
	maxValue, err := floatOr0(field(row, maxKey))
	if err != nil {
		return nil, err
	}
	return histPercentile(hist, latencyBounds, percentile, maxValue, 2)
}

func latencies(row *dict, percentiles ...float64) ([]any, error) {
	out := make([]any, len(percentiles))
	for i, p := range percentiles {
		v, err := latency(row, "latency_hist", "latency_max_ms", p)
		if err != nil {
			return nil, err
		}
		out[i] = v
	}
	return out, nil
}

// decodedCounter is _decoded_counter: Counter.most_common(limit), ties in
// insertion order.
func decodedCounter(m *dict, limit int) (bson.D, error) {
	counts := newDict()
	for _, key := range m.keys {
		n, err := nonNeg(m.vals[key])
		if err != nil {
			return nil, err
		}
		name := unsafeKey(key)
		current, _ := counts.get(name)
		c, _ := current.(int64)
		counts.set(name, c+n)
	}
	keys := append([]string(nil), counts.keys...)
	sort.SliceStable(keys, func(i, j int) bool { return counts.vals[keys[i]].(int64) > counts.vals[keys[j]].(int64) })
	if len(keys) > limit {
		keys = keys[:limit]
	}
	out := bson.D{}
	for _, key := range keys {
		out = append(out, bson.E{Key: key, Value: counts.vals[key]})
	}
	return out, nil
}

func counter(d *dict, key string, limit int) (bson.D, error) {
	m, err := subMapping(d, key)
	if err != nil {
		return nil, err
	}
	return decodedCounter(m, limit)
}

func percent(part, total int64, digits int) any {
	if total == 0 {
		return nil
	}
	return pyRound(float64(part*100)/float64(total), digits)
}

type routeRow struct {
	doc      bson.D
	requests int64
}

func summarizeRows(rows *dict, release bool) ([]routeRow, error) {
	var out []routeRow
	for _, encoded := range rows.keys {
		row, ok := rows.vals[encoded].(*dict)
		if !ok {
			continue
		}
		requests, err := nonNeg(field(row, "requests"))
		if err != nil {
			return nil, err
		}
		errors5xx, err := nonNeg(field(row, "errors_5xx"))
		if err != nil {
			return nil, err
		}
		p95, err := latency(row, "latency_hist", "latency_max_ms", 0.95)
		if err != nil {
			return nil, err
		}
		var doc bson.D
		if release {
			pct := any(0.0)
			if requests != 0 {
				pct = pyRound(float64(errors5xx*100)/float64(requests), 2)
			}
			doc = bson.D{{Key: "release", Value: unsafeKey(encoded)}, {Key: "requests", Value: requests},
				{Key: "errors_5xx", Value: errors5xx}, {Key: "error_5xx_percent", Value: pct}, {Key: "p95_ms", Value: p95}}
		} else {
			doc = bson.D{{Key: "route", Value: unsafeKey(encoded)}, {Key: "requests", Value: requests},
				{Key: "errors_5xx", Value: errors5xx}, {Key: "p95_ms", Value: p95}}
		}
		out = append(out, routeRow{doc, requests})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].requests > out[j].requests })
	return out, nil
}

func topRows(rows []routeRow, limit int) bson.A {
	out := bson.A{}
	for i, row := range rows {
		if i == limit {
			break
		}
		out = append(out, row.doc)
	}
	return out
}

// summarizeHTTP is _summarize_http.
func summarizeHTTP(http *dict, rangeSeconds float64) (bson.D, error) {
	total, err := nonNeg(field(http, "samples"))
	if err != nil {
		return nil, err
	}
	status5xx, err := nonNeg(field(http, "status_5xx"))
	if err != nil {
		return nil, err
	}
	routesMap, err := subMapping(http, "routes")
	if err != nil {
		return nil, err
	}
	routes, err := summarizeRows(routesMap, false)
	if err != nil {
		return nil, err
	}
	releasesMap, err := subMapping(http, "releases")
	if err != nil {
		return nil, err
	}
	releases, err := summarizeRows(releasesMap, true)
	if err != nil {
		return nil, err
	}
	status2xx, err := nonNeg(field(http, "status_2xx"))
	if err != nil {
		return nil, err
	}
	status4xx, err := nonNeg(field(http, "status_4xx"))
	if err != nil {
		return nil, err
	}
	pcts, err := latencies(http, 0.50, 0.95, 0.99)
	if err != nil {
		return nil, err
	}
	errorPct := any(0.0)
	if total != 0 {
		errorPct = pyRound(float64(status5xx*100)/float64(total), 2)
	}
	return bson.D{
		{Key: "samples", Value: total},
		{Key: "requests_per_minute", Value: pyRound(float64(total)/math.Max(1.0/60, rangeSeconds/60), 2)},
		{Key: "status_2xx", Value: status2xx},
		{Key: "status_4xx", Value: status4xx},
		{Key: "status_5xx", Value: status5xx},
		{Key: "error_5xx_percent", Value: errorPct},
		{Key: "p50_ms", Value: pcts[0]},
		{Key: "p95_ms", Value: pcts[1]},
		{Key: "p99_ms", Value: pcts[2]},
		{Key: "top_routes", Value: topRows(routes, 8)},
		{Key: "releases", Value: topRows(releases, 8)},
	}, nil
}

// summarizePresence is _summarize_presence.
func summarizePresence(presence *dict) (bson.D, error) {
	samples, err := nonNeg(field(presence, "samples"))
	if err != nil {
		return nil, err
	}
	total, err := nonNeg(field(presence, "online_sum"))
	if err != nil {
		return nil, err
	}
	var average, peak any
	if samples != 0 {
		average = pyRound(float64(total)/float64(samples), 1)
		p, err := nonNeg(field(presence, "online_max"))
		if err != nil {
			return nil, err
		}
		peak = p
	}
	return bson.D{{Key: "samples", Value: samples}, {Key: "average_online", Value: average}, {Key: "peak_online", Value: peak}}, nil
}

func aiShares(row *dict) (total, cloud, local int64, err error) {
	if total, err = nonNeg(field(row, "samples")); err != nil {
		return
	}
	if cloud, err = nonNeg(field(row, "cloudflare")); err != nil {
		return
	}
	local, err = nonNeg(field(row, "local"))
	return
}

// summarizeAIChannel is _summarize_ai_channel.
func summarizeAIChannel(row *dict) (bson.D, error) {
	total, cloud, local, err := aiShares(row)
	if err != nil {
		return nil, err
	}
	pcts, err := latencies(row, 0.50, 0.95, 0.99)
	if err != nil {
		return nil, err
	}
	reasons, err := counter(row, "reasons", 6)
	if err != nil {
		return nil, err
	}
	return bson.D{
		{Key: "samples", Value: total},
		{Key: "cloudflare_percent", Value: percent(cloud, total, 1)},
		{Key: "fallback_percent", Value: percent(local, total, 1)},
		{Key: "p50_ms", Value: pcts[0]}, {Key: "p95_ms", Value: pcts[1]}, {Key: "p99_ms", Value: pcts[2]},
		{Key: "reasons", Value: reasons},
	}, nil
}

// summarizeAI is _summarize_ai.
func summarizeAI(ai *dict) (bson.D, error) {
	total, cloud, local, err := aiShares(ai)
	if err != nil {
		return nil, err
	}
	input, err := nonNeg(field(ai, "input_tokens"))
	if err != nil {
		return nil, err
	}
	output, err := nonNeg(field(ai, "output_tokens"))
	if err != nil {
		return nil, err
	}
	pcts, err := latencies(ai, 0.50, 0.95, 0.99)
	if err != nil {
		return nil, err
	}
	doc := bson.D{
		{Key: "samples", Value: total},
		{Key: "cloudflare", Value: cloud},
		{Key: "local_fallback", Value: local},
		{Key: "cloudflare_percent", Value: percent(cloud, total, 1)},
		{Key: "fallback_percent", Value: percent(local, total, 1)},
		{Key: "p50_ms", Value: pcts[0]}, {Key: "p95_ms", Value: pcts[1]}, {Key: "p99_ms", Value: pcts[2]},
	}
	for _, c := range []struct {
		key   string
		limit int
	}{{"reasons", 10}, {"event_types", 12}, {"request_kinds", 8}, {"models", 6}, {"worker_errors", 8}} {
		counted, err := counter(ai, c.key, c.limit)
		if err != nil {
			return nil, err
		}
		doc = append(doc, bson.E{Key: c.key, Value: counted})
	}
	channelsMap, err := subMapping(ai, "channels")
	if err != nil {
		return nil, err
	}
	channels := bson.D{}
	for _, encoded := range channelsMap.keys {
		row, ok := channelsMap.vals[encoded].(*dict)
		if !ok {
			continue
		}
		summary, err := summarizeAIChannel(row)
		if err != nil {
			return nil, err
		}
		channels = pydoc.Set(channels, unsafeKey(encoded), summary)
	}
	neurons := new(big.Rat).SetFrac(big.NewInt(input*4625+output*30475), big.NewInt(1_000_000))
	neuronsF, _ := neurons.Float64()
	cost := (float64(input)*0.051 + float64(output)*0.34) / 1_000_000
	return append(doc,
		bson.E{Key: "channels", Value: channels},
		bson.E{Key: "usage", Value: bson.D{
			{Key: "input_tokens", Value: input},
			{Key: "output_tokens", Value: output},
			{Key: "total_tokens", Value: input + output},
			{Key: "estimated_neurons", Value: pyRound(neuronsF, 3)},
			{Key: "estimated_cost_usd", Value: pyRound(cost, 6)},
		}},
	), nil
}

var upper = cases.Upper(language.Und)

// summarizeFrontend is _summarize_frontend.
func summarizeFrontend(frontend *dict) (bson.D, error) {
	vitals, samples := bson.D{}, bson.D{}
	metrics, err := subMapping(frontend, "metrics")
	if err != nil {
		return nil, err
	}
	for _, encoded := range metrics.keys {
		row, ok := metrics.vals[encoded].(*dict)
		if !ok {
			continue
		}
		metric := upper.String(unsafeKey(encoded))
		bounds := frontendMSBounds
		if metric == "CLS" {
			bounds = frontendCLSBounds
		}
		hist, err := subMapping(row, "hist")
		if err != nil {
			return nil, err
		}
		maxValue, err := floatOr0(field(row, "value_max"))
		if err != nil {
			return nil, err
		}
		p75, err := histPercentile(hist, bounds, 0.75, maxValue, 3)
		if err != nil {
			return nil, err
		}
		if p75 != nil {
			if metric == "CLS" {
				p75 = pyRound(p75.(float64)/1000.0, 3)
			}
			vitals = pydoc.Set(vitals, metric, p75)
		}
		n, err := nonNeg(field(row, "samples"))
		if err != nil {
			return nil, err
		}
		samples = pydoc.Set(samples, metric, n)
	}
	total, err := nonNeg(field(frontend, "samples"))
	if err != nil {
		return nil, err
	}
	errorsN, err := nonNeg(field(frontend, "errors"))
	if err != nil {
		return nil, err
	}
	doc := bson.D{{Key: "samples", Value: total}, {Key: "errors", Value: errorsN}}
	for _, key := range []string{"error_names", "event_types", "contexts", "releases"} {
		counted, err := counter(frontend, key, 8)
		if err != nil {
			return nil, err
		}
		doc = append(doc, bson.E{Key: key, Value: counted})
	}
	return append(doc,
		bson.E{Key: "vitals_p75", Value: vitals},
		bson.E{Key: "vital_samples", Value: samples},
		bson.E{Key: "scope", Value: "persistent_identity_free"},
	), nil
}

// timestamp is datetime.timestamp() of a UTC instant, correctly rounded.
func timestamp(t time.Time) float64 {
	f, _ := new(big.Rat).SetFrac(big.NewInt(t.UnixMicro()), big.NewInt(1_000_000)).Float64()
	return f
}

// parseISO is _parse_iso: nil for a blank value.
func parseISO(value string) (*float64, error) {
	raw := pyval.Strip(value)
	if raw == "" {
		return nil, nil
	}
	if strings.HasSuffix(raw, "Z") {
		raw = raw[:len(raw)-1] + "+00:00"
	}
	t, aware, err := pyval.ParseISOFormat(raw)
	if err != nil {
		return nil, &RangeError{Message: err.Error()}
	}
	if aware && (t.Year() < 1 || t.Year() > 9999) {
		return nil, ErrRaised // astimezone's OverflowError
	}
	ts := timestamp(t)
	return &ts, nil
}

// NormalizeRange is normalize_range (from/to nil when absent).
func NormalizeRange(from, to *string, now time.Time) (int64, int64, error) {
	current := timestamp(now)
	var end, start *float64
	if to != nil && *to != "" {
		parsed, err := parseISO(*to)
		if err != nil {
			return 0, 0, err
		}
		end = parsed
	} else {
		end = &current
	}
	if from != nil && *from != "" {
		parsed, err := parseISO(*from)
		if err != nil {
			return 0, 0, err
		}
		start = parsed
	} else {
		if end == nil {
			return 0, 0, ErrRaised // None - 86400
		}
		s := *end - defaultRangeSeconds
		start = &s
	}
	if end == nil || start == nil {
		return 0, 0, ErrRaised // a comparison with None
	}
	if *end <= *start {
		return 0, 0, &RangeError{Message: "El final del rango debe ser posterior al inicio."}
	}
	if *end-*start > maxRangeSeconds {
		return 0, 0, &RangeError{Message: "El rango máximo de observabilidad es de 90 días."}
	}
	e := math.Min(*end, current+300)
	if e <= *start {
		return 0, 0, &RangeError{Message: "El rango solicitado está fuera del histórico disponible."}
	}
	return int64(*start), int64(e), nil
}

func floorMod(a, b int64) int64 {
	m := a % b
	if m < 0 {
		m += b
	}
	return m
}

func isoUTC(seconds int64) string {
	return time.Unix(seconds, 0).UTC().Format("2006-01-02T15:04:05") + "+00:00"
}

// Pending is the not yet flushed deltas as nested bucket documents (paths
// in sorted order; Python keeps event order, which only shows while Mongo
// is down).
func (r *Recorder) Pending() map[int64]bson.D {
	out := map[int64]bson.D{}
	if r == nil {
		return out
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for key, d := range r.pending {
		if d.empty() {
			continue
		}
		root := newDict()
		for _, path := range sortedKeys(d.incs) {
			setPath(root, path, d.incs[path])
		}
		for _, path := range sortedKeys(d.maxima) {
			setPath(root, path, d.maxima[path])
		}
		out[key] = toSource(root)
	}
	return out
}

func setPath(root *dict, path string, value any) {
	parts := strings.Split(path, ".")
	node := root
	for _, part := range parts[:len(parts)-1] {
		next, ok := node.get(part)
		child, isDict := next.(*dict)
		if !ok || !isDict {
			child = newDict()
			node.set(part, child)
		}
		node = child
	}
	node.set(parts[len(parts)-1], value)
}

// History is get_history over reader (nil: no database) and pending.
func History(ctx context.Context, reader BucketReader, recorder *Recorder, from, to *string, now time.Time) (bson.D, error) {
	start, end, err := NormalizeRange(from, to, now)
	if err != nil {
		return nil, err
	}
	_ = recorder.Flush(ctx)

	rows := map[int64]*dict{}
	spans := map[int64]int64{}
	target := func(key int64, span int64) *dict {
		row := rows[key]
		if row == nil {
			row = freshBucket()
			rows[key] = row
		}
		spans[key] = max(spans[key], span)
		return row
	}
	persistent := false
	if reader != nil {
		persistent = true
		for _, c := range []struct {
			name string
			size int64
		}{{LegacyCollectionName, 60 * 60}, {CollectionName, BucketSeconds}} {
			lower, upperBound := start-floorMod(start, c.size), end-floorMod(end, c.size)
			err := reader.Buckets(ctx, c.name, lower, upperBound, func(doc bson.D) error {
				id, _ := pydoc.Get(doc, "_id")
				key, err := intOr0(normalizeID(id))
				if err != nil {
					return err
				}
				source := bson.D{}
				for _, section := range []string{"http", "ai", "presence", "frontend"} {
					value, _ := pydoc.Get(doc, section)
					if !pyval.Truthy(value) {
						value = bson.D{}
					}
					source = append(source, bson.E{Key: section, Value: value})
				}
				return mergeNumeric(target(key, c.size), source)
			})
			if err != nil {
				persistent = false
				break
			}
		}
	}
	pendingStart, pendingEnd := pyBucketStart(start), pyBucketStart(end)
	for key, payload := range recorder.Pending() {
		if key < pendingStart || key > pendingEnd {
			continue
		}
		if err := mergeNumeric(target(key, BucketSeconds), payload); err != nil {
			return nil, err
		}
	}

	keys := make([]int64, 0, len(rows))
	for key := range rows {
		span := spans[key]
		if key <= end && key+span >= start {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	total := freshBucket()
	for _, key := range keys {
		if err := mergeNumeric(total, toSource(rows[key])); err != nil {
			return nil, err
		}
	}
	rangeSeconds := max(1, end-start)
	sections, err := summarize(total, float64(rangeSeconds))
	if err != nil {
		return nil, err
	}
	series, err := groupSeries(keys, rows, start, end)
	if err != nil {
		return nil, err
	}
	resolution := "day"
	switch {
	case rangeSeconds <= 2*60*60:
		resolution = "5min"
	case rangeSeconds <= 12*60*60:
		resolution = "15min"
	case rangeSeconds <= 48*60*60:
		resolution = "hour"
	}
	return append(bson.D{{Key: "range", Value: bson.D{
		{Key: "from", Value: isoUTC(start)},
		{Key: "to", Value: isoUTC(end)},
		{Key: "seconds", Value: rangeSeconds},
		{Key: "persistent", Value: persistent},
		{Key: "resolution", Value: resolution},
	}}}, append(sections, bson.E{Key: "series", Value: series})...), nil
}

// normalizeID is document.get("_id") or 0 as a number.
func normalizeID(id any) any {
	if n, ok := sourceNumber(id); ok {
		return n
	}
	if id == nil {
		return int64(0)
	}
	return id
}

// pyBucketStart is _bucket_start: negative timestamps clamp to 0.
func pyBucketStart(ts int64) int64 {
	value := max(0, ts)
	return value - value%BucketSeconds
}

func sectionOf(bucket *dict, key string) (*dict, error) { return subMapping(bucket, key) }

func summarize(bucket *dict, rangeSeconds float64) (bson.D, error) {
	out := bson.D{}
	for _, s := range []struct {
		key string
		fn  func(*dict) (bson.D, error)
	}{
		{"http", func(d *dict) (bson.D, error) { return summarizeHTTP(d, rangeSeconds) }},
		{"ai", summarizeAI},
		{"presence", summarizePresence},
		{"frontend", summarizeFrontend},
	} {
		section, err := sectionOf(bucket, s.key)
		if err != nil {
			return nil, err
		}
		summary, err := s.fn(section)
		if err != nil {
			return nil, err
		}
		out = append(out, bson.E{Key: s.key, Value: summary})
	}
	return out, nil
}

// groupSeries is _group_series.
func groupSeries(keys []int64, rows map[int64]*dict, start, end int64) (bson.A, error) {
	span := max(1, end-start)
	group := int64(24 * 60 * 60)
	switch {
	case span <= 2*60*60:
		group = 5 * 60
	case span <= 12*60*60:
		group = 15 * 60
	case span <= 48*60*60:
		group = 60 * 60
	}
	groups := map[int64]*dict{}
	var order []int64
	for _, key := range keys {
		g := key - floorMod(key, group)
		target := groups[g]
		if target == nil {
			target = freshBucket()
			groups[g] = target
			order = append(order, g)
		}
		if err := mergeNumeric(target, toSource(rows[key])); err != nil {
			return nil, err
		}
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	series := bson.A{}
	for _, g := range order {
		s, err := summarize(groups[g], float64(group))
		if err != nil {
			return nil, err
		}
		http, _ := pydoc.Get(s, "http")
		ai, _ := pydoc.Get(s, "ai")
		presence, _ := pydoc.Get(s, "presence")
		frontend, _ := pydoc.Get(s, "frontend")
		h, a, p, f := http.(bson.D), ai.(bson.D), presence.(bson.D), frontend.(bson.D)
		get := func(d bson.D, key string) any { v, _ := pydoc.Get(d, key); return v }
		vitals := get(f, "vitals_p75").(bson.D)
		series = append(series, bson.D{
			{Key: "at", Value: isoUTC(g)},
			{Key: "http_requests", Value: get(h, "samples")},
			{Key: "http_4xx", Value: get(h, "status_4xx")},
			{Key: "http_5xx", Value: get(h, "status_5xx")},
			{Key: "http_p50_ms", Value: get(h, "p50_ms")},
			{Key: "http_p95_ms", Value: get(h, "p95_ms")},
			{Key: "http_p99_ms", Value: get(h, "p99_ms")},
			{Key: "ai_samples", Value: get(a, "samples")},
			{Key: "ai_cloudflare_percent", Value: get(a, "cloudflare_percent")},
			{Key: "ai_fallback_percent", Value: get(a, "fallback_percent")},
			{Key: "ai_p50_ms", Value: get(a, "p50_ms")},
			{Key: "ai_p95_ms", Value: get(a, "p95_ms")},
			{Key: "ai_p99_ms", Value: get(a, "p99_ms")},
			{Key: "online_average", Value: get(p, "average_online")},
			{Key: "online_peak", Value: get(p, "peak_online")},
			{Key: "frontend_samples", Value: get(f, "samples")},
			{Key: "frontend_errors", Value: get(f, "errors")},
			{Key: "frontend_lcp_p75_ms", Value: get(vitals, "LCP")},
			{Key: "frontend_cls_p75", Value: get(vitals, "CLS")},
			{Key: "frontend_inp_p75_ms", Value: get(vitals, "INP")},
		})
	}
	return series, nil
}
