package gamesapi

// Shared Pydantic-compatible validation helpers for active Chess Studio
// Admin APIs. Their original home was the now-extracted Chronicles run HTTP
// handler; preserve their exact behavior as that obsolete handler is deleted.
import (
	"fmt"
	"math"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func problemDoc(kind string, loc bson.A, msg string, input any, ctx bson.D) bson.D {
	d := bson.D{{Key: "type", Value: kind}, {Key: "loc", Value: loc}, {Key: "msg", Value: msg}, {Key: "input", Value: input}}
	if ctx != nil {
		d = append(d, bson.E{Key: "ctx", Value: ctx})
	}
	return d
}

func pydanticInt(value any, loc bson.A) (int64, bson.D) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	case int32:
		return int64(v), nil
	case int64:
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, problemDoc("finite_number", loc, "Input should be a finite number", v, nil)
		}
		if v != math.Trunc(v) {
			return 0, problemDoc("int_from_float", loc, "Input should be a valid integer, got a number with a fractional part", v, nil)
		}
		if math.Abs(v) >= 1<<63 {
			return 0, problemDoc("int_parsing_size", loc, "Unable to parse input string as an integer, exceeded maximum size", v, nil)
		}
		return int64(v), nil
	case string:
		n := queryInt(v)
		if n == nil {
			return 0, problemDoc("int_parsing", loc, "Input should be a valid integer, unable to parse string as an integer", v, nil)
		}
		if !n.IsInt64() {
			return math.MaxInt64, nil // beyond every bound we check
		}
		return n.Int64(), nil
	}
	return 0, problemDoc("int_type", loc, "Input should be a valid integer", value, nil)
}

func modelObject(body any) (bson.D, bson.A) {
	if body == nil {
		return nil, bson.A{problemDoc("missing", bson.A{"body"}, "Field required", nil, nil)}
	}
	object, ok := body.(bson.D)
	if !ok {
		return nil, bson.A{problemDoc("model_attributes_type", bson.A{"body"}, "Input should be a valid dictionary or object to extract fields from", body, nil)}
	}
	return object, nil
}

func strField(loc bson.A, value any, minLen, maxLen int) (string, bson.D) {
	s, ok := value.(string)
	if !ok {
		return "", problemDoc("string_type", loc, "Input should be a valid string", value, nil)
	}
	n := utf8.RuneCountInString(s)
	if n < minLen {
		return "", problemDoc("string_too_short", loc, fmt.Sprintf("String should have at least %s", characters(minLen)), s, bson.D{{Key: "min_length", Value: int64(minLen)}})
	}
	if n > maxLen {
		return "", problemDoc("string_too_long", loc, fmt.Sprintf("String should have at most %s", characters(maxLen)), s, bson.D{{Key: "max_length", Value: int64(maxLen)}})
	}
	return s, nil
}

func lookupOr(d bson.D, key string, fallback any) any {
	if v, ok := pydoc.Get(d, key); ok {
		return v
	}
	return fallback
}
