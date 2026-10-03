// Package pyjson writes JSON byte-identical to Python's
// json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).
// Fingerprints hash those bytes and log pipelines parse them, so Go must not
// drift from Python (ints vs floats, float repr, \uXXXX escapes).
package pyjson

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// Int marks a Python int: json.dumps writes ints and floats differently
// (50 vs 50.0). Plain Go ints are accepted too; float64 is always a float.
type Int int64

// Dumps serialises nil, bool, Int/int, float64, string, map[string]any,
// []any and []string.
func Dumps(value any) (string, error) {
	var b strings.Builder
	if err := writePyJSON(&b, value); err != nil {
		return "", err
	}
	return b.String(), nil
}

func writePyJSON(b *strings.Builder, value any) error {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if v {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case Int:
		b.WriteString(strconv.FormatInt(int64(v), 10))
	case int:
		b.WriteString(strconv.Itoa(v))
	case float64:
		b.WriteString(FloatRepr(v))
	case string:
		writePyString(b, v)
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys) // UTF-8 byte order is code point order
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			writePyString(b, k)
			b.WriteByte(':')
			if err := writePyJSON(b, v[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	case []string:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			writePyString(b, item)
		}
		b.WriteByte(']')
	case []any:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := writePyJSON(b, item); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	default:
		return fmt.Errorf("pyjson: unsupported %T", value)
	}
	return nil
}

// FloatRepr is Python's repr(float) (json.dumps uses float.__repr__).
func FloatRepr(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		if math.Signbit(f) {
			return "-0.0"
		}
		return "0.0"
	}
	sign := ""
	if f < 0 {
		sign, f = "-", -f
	}
	// Shortest round-trip digits, as Python's repr.
	sci := strconv.FormatFloat(f, 'e', -1, 64) // d.ddde±XX
	mantissa, expPart, _ := strings.Cut(sci, "e")
	digits := strings.Replace(mantissa, ".", "", 1)
	exp, _ := strconv.Atoi(expPart)
	decpt := exp + 1
	if decpt > -4 && decpt <= 16 {
		switch {
		case decpt <= 0:
			return sign + "0." + strings.Repeat("0", -decpt) + digits
		case decpt >= len(digits):
			return sign + digits + strings.Repeat("0", decpt-len(digits)) + ".0"
		default:
			return sign + digits[:decpt] + "." + digits[decpt:]
		}
	}
	out := digits[:1]
	if len(digits) > 1 {
		out += "." + digits[1:]
	}
	e := decpt - 1
	expSign := "+"
	if e < 0 {
		expSign, e = "-", -e
	}
	return fmt.Sprintf("%s%se%s%02d", sign, out, expSign, e)
}

func writePyString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r >= 0x20 && r <= 0x7e {
				b.WriteRune(r)
			} else if r > 0xffff {
				hi, lo := utf16.EncodeRune(r)
				fmt.Fprintf(b, `\u%04x\u%04x`, hi, lo)
			} else {
				fmt.Fprintf(b, `\u%04x`, r)
			}
		}
	}
	b.WriteByte('"')
}
