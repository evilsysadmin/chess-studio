// Package narrative is the Workers AI narrative gateway of
// narrative_cloudflare.py: the sanitized, HMAC-signed dossier sent to the
// Worker, the contracts every model answer must meet before a player sees
// it (grounding, portrait and daily shapes, opening banter, the "usted"
// register), the deterministic local fallbacks, the per-channel circuit
// breaker and the text-free telemetry Admin reads. Pinned by
// scripts/narrative_parity_corpus.py.
package narrative

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"regexp"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	defaultMaxOutputChars       = 420
	PlayerPortraitMaxChars      = 900
	richAnalysisMaxOutputChars  = 900
	personalPuzzleBatchMaxChars = 3200
	maxFactDepth                = 3
	maxFactString               = 240
	maxFactArray                = 12
	maxFactKeys                 = 30
)

// RichAnalysisEvents is RICH_ANALYSIS_EVENT_TYPES.
var RichAnalysisEvents = map[string]bool{
	"post_game_autopsy": true, "combat_briefing": true, "combat_debrief": true, "observability_summary": true,
	"training_plan": true, "personal_puzzle_batch": true, "chronicles_planner": true, "matthias_daily": true,
	"matthias_position": true, "game_opening_banter": true,
}

var sensitiveKeyParts = []string{
	"password", "passwd", "secret", "token", "jwt", "authorization",
	"cookie", "session", "email", "api_key", "apikey", "bearer",
}

// Sanitize is _sanitize: data-only facts, bounded in depth, width and
// length, with credential-looking keys dropped.
func Sanitize(value any, depth int) any {
	if depth > maxFactDepth {
		return nil
	}
	switch v := value.(type) {
	case nil, bool, int32, int64, int:
		return v
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil
		}
		return v
	case string:
		var b strings.Builder
		for _, r := range v {
			if r >= ' ' || r == '\n' || r == '\t' {
				b.WriteRune(r)
			}
		}
		return pyval.Prefix(b.String(), maxFactString)
	case bson.A:
		out := bson.A{}
		for i, item := range v {
			if i == maxFactArray {
				break
			}
			out = append(out, Sanitize(item, depth+1))
		}
		return out
	case []any:
		return Sanitize(bson.A(v), depth)
	case bson.D:
		out := bson.D{}
		accepted := 0
		for _, e := range v {
			key := pyval.Prefix(e.Key, 60)
			lowered := strings.ReplaceAll(strings.ToLower(key), "-", "_")
			sensitive := false
			for _, part := range sensitiveKeyParts {
				if strings.Contains(lowered, part) {
					sensitive = true
					break
				}
			}
			if sensitive || key == "" {
				continue
			}
			out = pydoc.Set(out, key, Sanitize(e.Value, depth+1))
			accepted++
			if accepted >= maxFactKeys {
				break
			}
		}
		return out
	}
	return nil
}

func sanitizedFacts(facts bson.D) bson.D {
	if len(facts) == 0 {
		return bson.D{}
	}
	out, _ := Sanitize(facts, 0).(bson.D)
	return out
}

func orDefault(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

var requestIDJunk = regexp.MustCompile(`[^A-Za-z0-9._:-]`)

// BuildPayload is build_payload (nil tone/locale/requestID mean None).
func BuildPayload(eventType string, facts bson.D, tone, locale, requestID *string) bson.D {
	payload := bson.D{
		{Key: "event_type", Value: pyval.Prefix(orDefault(&eventType, "generic"), 48)},
		{Key: "facts", Value: sanitizedFacts(facts)},
		{Key: "tone", Value: pyval.Prefix(orDefault(tone, "sarcastic"), 32)},
		{Key: "locale", Value: pyval.Prefix(orDefault(locale, "es-ES"), 16)},
	}
	if requestID != nil && *requestID != "" {
		payload = append(payload, bson.E{Key: "request_id", Value: pyval.Prefix(requestIDJunk.ReplaceAllString(*requestID, ""), 80)})
	}
	return payload
}

// CanonicalJSON is canonical_json: the exact bytes the Worker verifies.
func CanonicalJSON(payload bson.D) ([]byte, error) { return pydoc.EncodeSorted(payload, false) }

// Sign is sign_request.
func Sign(secret, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Channel is _circuit_channel.
func Channel(eventType string) string {
	switch {
	case eventType == "player_portrait":
		return "player_portrait"
	case RichAnalysisEvents[eventType]:
		return "analysis"
	}
	return "comments"
}

// MaxOutputChars is _max_output_chars.
func MaxOutputChars(eventType string) int {
	switch {
	case eventType == "personal_puzzle_batch":
		return personalPuzzleBatchMaxChars
	case eventType == "player_portrait":
		return PlayerPortraitMaxChars
	case RichAnalysisEvents[eventType]:
		return richAnalysisMaxOutputChars
	}
	return defaultMaxOutputChars
}
