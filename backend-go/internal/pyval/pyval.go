// Package pyval reproduces the handful of Python builtins the backend leans
// on when it cleans free-form Mongo documents: truthiness, str(), int(),
// str.split() and the int/float arithmetic of plain numbers. Values are the
// shapes pydoc produces (bson.D, bson.A, int32/int64, float64, string, bool,
// nil) plus the BSON scalars pymongo hands back.
package pyval

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// ErrValue and ErrType are Python's ValueError and TypeError.
var (
	ErrValue = errors.New("ValueError")
	ErrType  = errors.New("TypeError")
)

// Truthy is bool(value).
func Truthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case string:
		return v != ""
	case int:
		return v != 0
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
	case []any:
		return len(v) > 0
	case []byte:
		return len(v) > 0
	case bson.Binary:
		return len(v.Data) > 0
	}
	return true
}

// Or is Python's `value or fallback`.
func Or(value, fallback any) any {
	if Truthy(value) {
		return value
	}
	return fallback
}

// Str is str(value).
func Str(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case nil:
		return "None"
	case bool:
		if v {
			return "True"
		}
		return "False"
	case bson.DateTime:
		// pymongo hands back naive UTC datetimes.
		t := v.Time().UTC()
		s := t.Format("2006-01-02 15:04:05")
		if micro := t.Nanosecond() / 1000; micro != 0 {
			s += fmt.Sprintf(".%06d", micro)
		}
		return s
	case bson.ObjectID:
		return v.Hex()
	}
	return Repr(value)
}

// Repr is repr(value) for the shapes documents hold.
func Repr(value any) string {
	switch v := value.(type) {
	case string:
		return reprString(v)
	case nil, bool, bson.DateTime, bson.ObjectID:
		if dt, ok := v.(bson.DateTime); ok {
			t := dt.Time().UTC()
			return fmt.Sprintf("datetime.datetime(%d, %d, %d, %d, %d)", t.Year(), int(t.Month()), t.Day(), t.Hour(), t.Minute())
		}
		if oid, ok := v.(bson.ObjectID); ok {
			return "ObjectId('" + oid.Hex() + "')"
		}
		return Str(v)
	case int:
		return strconv.Itoa(v)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		switch {
		case math.IsNaN(v):
			return "nan"
		case math.IsInf(v, 1):
			return "inf"
		case math.IsInf(v, -1):
			return "-inf"
		}
		return pyjson.FloatRepr(v)
	case bson.D:
		parts := make([]string, 0, len(v))
		for _, e := range v {
			parts = append(parts, reprString(e.Key)+": "+Repr(e.Value))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case bson.A:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, Repr(item))
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case []any:
		return Repr(bson.A(v))
	}
	return fmt.Sprint(value)
}

func reprString(s string) string {
	quote := byte('\'')
	if strings.ContainsRune(s, '\'') && !strings.ContainsRune(s, '"') {
		quote = '"'
	}
	var b strings.Builder
	b.WriteByte(quote)
	for _, r := range s {
		switch {
		case r == rune(quote) || r == '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r < 0x20 || r == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, r)
		case r < 0x7f || printable(r):
			b.WriteRune(r)
		case r <= 0xff:
			fmt.Fprintf(&b, `\x%02x`, r)
		case r <= 0xffff:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			fmt.Fprintf(&b, `\U%08x`, r)
		}
	}
	b.WriteByte(quote)
	return b.String()
}

// printable is str.isprintable for one character: everything but the
// Other and Separator categories (the ASCII space aside).
func printable(r rune) bool {
	if r == ' ' {
		return true
	}
	return !unicode.In(r, unicode.C, unicode.Z)
}

// IsSpace is str.isspace for one character.
func IsSpace(r rune) bool {
	return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f)
}

// Split is str.split() with no separator.
func Split(s string) []string {
	return strings.FieldsFunc(s, IsSpace)
}

// Strip is str.strip() with no argument.
func Strip(s string) string {
	return strings.TrimFunc(s, IsSpace)
}

// Prefix is s[:limit] counted in characters.
func Prefix(s string, limit int) string {
	if limit <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= limit {
		return s
	}
	n := 0
	for i := range s {
		if n == limit {
			return s[:i]
		}
		n++
	}
	return s
}

// BoundedText is the backend's `" ".join(str(value or "").split())[:limit]`.
func BoundedText(value any, limit int) string {
	return Prefix(strings.Join(Split(Str(Or(value, ""))), " "), limit)
}

// Int is int(value).
func Int(value any) (int64, error) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	case int:
		return int64(v), nil
	case int32:
		return int64(v), nil
	case int64:
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Abs(v) >= 9.223372036854775807e18 {
			return 0, ErrValue
		}
		return int64(v), nil
	case string:
		return parseInt(v)
	}
	return 0, ErrType
}

// parseInt is int(str): surrounding whitespace, a sign, ASCII digits with
// single underscores between them.
func parseInt(s string) (int64, error) {
	s = Strip(s)
	negative := false
	if s != "" && (s[0] == '+' || s[0] == '-') {
		negative = s[0] == '-'
		s = s[1:]
	}
	if s == "" || s[0] == '_' || s[len(s)-1] == '_' || strings.Contains(s, "__") {
		return 0, ErrValue
	}
	digits := strings.ReplaceAll(s, "_", "")
	for i := 0; i < len(digits); i++ {
		if digits[i] < '0' || digits[i] > '9' {
			return 0, ErrValue
		}
	}
	n, err := strconv.ParseInt(digits, 10, 64)
	if err != nil {
		return 0, ErrValue
	}
	if negative {
		n = -n
	}
	return n, nil
}

// IntOr is int(value or 0).
func IntOr(value any) (int64, error) {
	if !Truthy(value) {
		return 0, nil
	}
	return Int(value)
}

// Num is a Python int or float (never a bool).
type Num struct {
	I     int64
	F     float64
	Float bool
}

// Number mirrors the backend's _number: ints and floats, not bools.
func Number(value any) (Num, bool) {
	switch v := value.(type) {
	case int:
		return Num{I: int64(v)}, true
	case int32:
		return Num{I: int64(v)}, true
	case int64:
		return Num{I: v}, true
	case float64:
		return Num{F: v, Float: true}, true
	}
	return Num{}, false
}

// Value is the number as a document value.
func (n Num) Value() any {
	if n.Float {
		return n.F
	}
	return n.I
}

func (n Num) float() float64 {
	if n.Float {
		return n.F
	}
	return float64(n.I)
}

// Zero is `not n`.
func (n Num) Zero() bool {
	if n.Float {
		return n.F == 0
	}
	return n.I == 0
}

// Sub is n - o.
func (n Num) Sub(o Num) Num {
	if !n.Float && !o.Float {
		return Num{I: n.I - o.I}
	}
	return Num{F: n.float() - o.float(), Float: true}
}

// Equal is n == o.
func (n Num) Equal(o Num) bool {
	if !n.Float && !o.Float {
		return n.I == o.I
	}
	return n.float() == o.float()
}

// Int is int(n).
func (n Num) Int() (int64, error) { return Int(n.Value()) }

// Float is float(n).
func (n Num) Float64() float64 { return n.float() }

// NumberInt is int(_number(value) or 0).
func NumberInt(value any) (int64, error) {
	n, ok := Number(value)
	if !ok || n.Zero() {
		return 0, nil
	}
	return n.Int()
}

// NonNegInt is max(0, int(_number(value) or 0)).
func NonNegInt(value any) (int64, error) {
	n, err := NumberInt(value)
	return max(0, n), err
}

// NumberValue is _number(value) as a document value (None when not a number).
func NumberValue(value any) any {
	if n, ok := Number(value); ok {
		return n.Value()
	}
	return nil
}

// ISOFormatUTC is datetime.isoformat() of an aware UTC datetime.
func ISOFormatUTC(t time.Time) string {
	t = t.UTC()
	s := t.Format("2006-01-02T15:04:05")
	if micro := t.Nanosecond() / 1000; micro != 0 {
		s += fmt.Sprintf(".%06d", micro)
	}
	return s + "+00:00"
}
