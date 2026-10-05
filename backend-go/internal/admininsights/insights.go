// Package admininsights is backend-python/admin_insights.py: the pure
// aggregation behind Admin's user list, the per-user "Así juegas" payload
// and the anonymous matchmaking telemetry. Profile snapshots are written by
// browsers, so every value may have any JSON shape; where Python raises
// (an unhashable key, int(inf), .get on a list) the functions return
// ErrRaised, which the routes answer as Python's unhandled 500. Pinned by
// scripts/admin_insights_parity_corpus.py.
package admininsights

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// ErrRaised is any exception admin_insights lets escape.
var ErrRaised = errors.New("admin insights raised")

// SummaryProfileKeys is ADMIN_SUMMARY_PROFILE_KEYS.
var SummaryProfileKeys = []string{
	"chess-study-achievements", "chess-study-analysis-archive", "chess-study-career", "chess-study-career-meta",
	"chess-study-combat-history", "chess-study-cpu-rivalry", "chess-study-daily-challenge", "chess-study-game-activity",
	"chess-study-game-history", "chess-study-personal-puzzles", "chess-study-player-rating", "chess-study-puzzle-best-streak",
	"chess-study-puzzles-solved", "chess-study-rating-history", "chess-study-series-history", "chess-study-tournament",
	"chess-study-worst-move-cache", "chess-study-matchmaking-telemetry-v1",
}

func get(d bson.D, key string) any {
	v, _ := pydoc.Get(d, key)
	return v
}

// getOr is d.get(key, fallback).
func getOr(d bson.D, key string, fallback any) any {
	if v, ok := pydoc.Get(d, key); ok {
		return v
	}
	return fallback
}

func isDict(v any) bool {
	_, ok := v.(bson.D)
	return ok
}

func isList(v any) bool {
	_, ok := v.(bson.A)
	return ok
}

// unhashable reports values `x in {set}` or `{dict}.get(x)` raise on.
func unhashable(v any) bool {
	switch v.(type) {
	case bson.D, bson.A:
		return true
	}
	return false
}

func isNumber(v any) bool {
	switch v.(type) {
	case bool, int32, int64, float64:
		return true
	}
	return false
}

// profileJSON is _profile_json: json.loads of a string value, else default.
// Integers beyond 64 bits, which Python would parse, count as unreadable.
func profileJSON(data bson.D, key string, fallback any) any {
	raw, ok := get(data, key).(string)
	if !ok {
		return fallback
	}
	value, err := decodePython(raw)
	if err != nil {
		return fallback
	}
	return value
}

func profileDict(data bson.D, key string) bson.D {
	if d, ok := profileJSON(data, key, bson.D{}).(bson.D); ok {
		return d
	}
	return bson.D{}
}

func profileList(data bson.D, key string) bson.A {
	if a, ok := profileJSON(data, key, bson.A{}).(bson.A); ok {
		return a
	}
	return bson.A{}
}

// profileData is (profile or {}).get("data") or {}.
func profileData(profile bson.D) (bson.D, error) {
	data := get(profile, "data")
	if !pyval.Truthy(data) {
		return bson.D{}, nil
	}
	d, ok := data.(bson.D)
	if !ok {
		return nil, ErrRaised
	}
	return d, nil
}

// pyFloat is float(value): ok=false where Python raises TypeError/ValueError.
func pyFloat(value any) (float64, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float64:
		return v, true
	case string:
		s := strings.TrimFunc(v, func(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) })
		if s == "" || strings.ContainsAny(s, "xXpP") {
			return 0, false
		}
		if unsigned := strings.TrimLeft(s, "+-"); len(s)-len(unsigned) <= 1 && strings.EqualFold(unsigned, "nan") {
			return math.NaN(), true
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil && !errors.Is(err, strconv.ErrRange) {
			return 0, false
		}
		return f, true
	}
	return 0, false
}

// roundInt is int(round(x)) for a float: ok=false for NaN (ValueError),
// ErrRaised for ±inf (OverflowError) and, as a deviation, beyond int64.
func roundInt(f float64) (int64, bool, error) {
	if math.IsNaN(f) {
		return 0, false, nil
	}
	if math.IsInf(f, 0) || math.Abs(f) >= 1<<63 {
		return 0, false, ErrRaised
	}
	return int64(math.RoundToEven(f)), true, nil
}

// roundFloatInt is int(round(float(value))) inside try/except (TypeError, ValueError).
func roundFloatInt(value any) (int64, bool, error) {
	f, ok := pyFloat(value)
	if !ok {
		return 0, false, nil
	}
	return roundInt(f)
}

// pyInt is int(value) inside try/except (TypeError, ValueError).
func pyInt(value any) (int64, bool, error) {
	if f, isFloat := value.(float64); isFloat {
		if math.IsNaN(f) {
			return 0, false, nil
		}
		if math.IsInf(f, 0) || math.Abs(f) >= 1<<63 {
			return 0, false, ErrRaised
		}
		return int64(f), true, nil
	}
	n, err := pyval.Int(value)
	return n, err == nil, nil
}

// pyRound is round(x) of a float to an int (banker's rounding).
func pyRound(f float64) int64 { return int64(math.RoundToEven(f)) }

func strKey(v any) string { return pyval.Str(pyval.Or(v, "")) }

func historyMoverColor(record bson.D, index int) string {
	start := "w"
	if fen, ok := get(record, "initialFen").(string); ok {
		parts := pyval.Split(fen)
		if len(parts) >= 2 && (parts[1] == "w" || parts[1] == "b") {
			start = parts[1]
		}
	}
	if index%2 == 0 {
		return start
	}
	if start == "w" {
		return "b"
	}
	return "w"
}

func normalizeCareerText(text any) any {
	s, ok := text.(string)
	if !ok {
		return nil
	}
	value := pyval.Strip(s)
	lower := strings.ToLower(value)
	for _, r := range [][2]string{
		{"Contrato cumplido:", "Reto superado ·"},
		{"Contrato fallido:", "Reto fallido ·"},
		{"Reto cumplido:", "Reto superado ·"},
		{"Reto cumplido ·", "Reto superado ·"},
		{"Reto fallido:", "Reto fallido ·"},
	} {
		if strings.HasPrefix(lower, strings.ToLower(r[0])) {
			return r[1] + " " + pyval.Strip(string([]rune(value)[len([]rune(r[0])):]))
		}
	}
	return value
}

func difficultyLabel(value any) (any, error) {
	n, ok, err := roundFloatInt(value)
	if err != nil || !ok {
		return nil, err
	}
	return fmt.Sprintf("CPU · nivel %d", n), nil
}

func dicts(list bson.A) []bson.D {
	var out []bson.D
	for _, item := range list {
		if d, ok := item.(bson.D); ok {
			out = append(out, d)
		}
	}
	return out
}

// sortedByDate is sorted(rows, key=str(r.get("date") or ""), reverse=desc).
func sortedByDate(rows []bson.D, desc bool) []bson.D {
	out := append([]bson.D(nil), rows...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := strKey(get(out[i], "date")), strKey(get(out[j], "date"))
		if desc {
			return a > b
		}
		return a < b
	})
	return out
}

func longestWinStreak(records []bson.D) int64 {
	var best, current int64
	for _, record := range sortedByDate(records, false) {
		if get(record, "outcome") == "win" {
			current++
			best = max(best, current)
		} else {
			current = 0
		}
	}
	return best
}

// iterate is `for item in value` over a JSON value: lists, string
// characters and dict keys; other truthy values raise TypeError.
func iterate(value any) ([]any, error) {
	switch v := value.(type) {
	case nil:
		return nil, nil
	case bson.A:
		return v, nil
	case string:
		var out []any
		for _, r := range v {
			out = append(out, string(r))
		}
		return out, nil
	case bson.D:
		var out []any
		for _, e := range v {
			out = append(out, e.Key)
		}
		return out, nil
	}
	if !pyval.Truthy(value) {
		return nil, nil // `value or []`
	}
	return nil, ErrRaised
}

// pyLen is len(value or []) for JSON values.
func pyLen(value any) (int, error) {
	switch v := value.(type) {
	case bson.A:
		return len(v), nil
	case bson.D:
		return len(v), nil
	case string:
		return len([]rune(v)), nil
	}
	if !pyval.Truthy(value) {
		return 0, nil
	}
	return 0, ErrRaised
}

func capitalize(s string) string {
	runes := []rune(strings.ToLower(s))
	if len(runes) > 0 {
		runes[0] = unicode.ToUpper(runes[0])
	}
	return string(runes)
}

func ratio(n, d int) float64 { return float64(n) / float64(d) }
