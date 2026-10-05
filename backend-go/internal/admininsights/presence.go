package admininsights

import (
	"math/big"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// DecodeJSON is json.loads (NaN and ±Infinity included).
func DecodeJSON(raw string) (any, error) { return decodePython(raw) }

// PyInt is int(value) inside try/except (TypeError, ValueError): ok=false
// when caught, ErrRaised for what escapes (int(inf)).
func PyInt(value any) (int64, bool, error) { return pyInt(value) }

// RoundFloatInt is int(round(float(value))) with the same contract.
func RoundFloatInt(value any) (int64, bool, error) { return roundFloatInt(value) }

// ageSeconds is max(0, int((now - parsed).total_seconds())).
func ageSeconds(now, parsed time.Time) int64 {
	micros := (now.Unix()-parsed.Unix())*1_000_000 + int64(now.Nanosecond()/1000-parsed.Nanosecond()/1000)
	seconds, _ := new(big.Rat).SetFrac64(micros, 1_000_000).Float64()
	return max(0, int64(seconds))
}

// parseStamp is datetime.fromisoformat(str(value).replace("Z", "+00:00")),
// naive values read as UTC.
func parseStamp(value any) (time.Time, bool) {
	t, _, ok := pyval.FromISOFormat(strings.ReplaceAll(pyval.Str(value), "Z", "+00:00"))
	return t, ok
}

// PresenceSummary is _presence_summary.
func PresenceSummary(lastActivity, presenceOnline any, now time.Time) bson.D {
	if !pyval.Truthy(lastActivity) {
		return bson.D{{Key: "lastActivity", Value: nil}, {Key: "presence", Value: "never"}, {Key: "presenceAgeSeconds", Value: nil}}
	}
	parsed, ok := parseStamp(lastActivity)
	if !ok {
		return bson.D{{Key: "lastActivity", Value: pyval.Str(lastActivity)}, {Key: "presence", Value: "offline"}, {Key: "presenceAgeSeconds", Value: nil}}
	}
	age := ageSeconds(now, parsed)
	presence := "offline"
	switch {
	case presenceOnline == false:
	case age <= 150:
		presence = "online"
	case age <= 5*60:
		presence = "idle"
	case age <= 15*60:
		presence = "recent"
	}
	return bson.D{{Key: "lastActivity", Value: pyval.ISOFormatUTC(parsed)}, {Key: "presence", Value: presence}, {Key: "presenceAgeSeconds", Value: age}}
}

// ForegroundSummary is _foreground_summary with its 150-second freshness.
func ForegroundSummary(user bson.D, now time.Time) bson.D {
	unknown := bson.D{{Key: "foreground", Value: nil}, {Key: "foregroundAgeSeconds", Value: nil}}
	raw := get(user, "foreground_updated_at")
	reported, isBool := get(user, "is_foreground").(bool)
	if raw == nil || !isBool {
		return unknown
	}
	parsed, ok := parseStamp(raw)
	if !ok {
		return unknown
	}
	age := ageSeconds(now, parsed)
	if age > 150 {
		return bson.D{{Key: "foreground", Value: nil}, {Key: "foregroundAgeSeconds", Value: age}}
	}
	return bson.D{{Key: "foreground", Value: reported}, {Key: "foregroundAgeSeconds", Value: age}}
}
