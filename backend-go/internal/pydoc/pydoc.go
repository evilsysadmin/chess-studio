// Package pydoc moves free-form JSON documents the way the Python backend
// does: json.loads keeps key order and tells ints from floats, pymongo stores
// ints as int32 when they fit and int64 otherwise, Python compares values
// with == (dicts ignore order, 1 == 1.0 == True), and FastAPI's JSONResponse
// writes compact UTF-8 with Python's float repr.
//
// Documents are bson.D (ordered), arrays bson.A, so what Go stores in Mongo
// is what pymongo would have stored for the same request body.
package pydoc

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// ErrIntegerTooLarge is pymongo's OverflowError: BSON holds at most int64.
var ErrIntegerTooLarge = errors.New("integer does not fit BSON int64")

// Decode parses one JSON value (json.loads), objects as bson.D in their
// order (a repeated key keeps its first position and its last value).
func Decode(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	value, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("extra data after JSON value")
	}
	return value, nil
}

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			doc := bson.D{}
			index := map[string]int{}
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyTok.(string)
				if !ok {
					return nil, errors.New("object key is not a string")
				}
				value, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				if at, seen := index[key]; seen {
					doc[at].Value = value
					continue
				}
				index[key] = len(doc)
				doc = append(doc, bson.E{Key: key, Value: value})
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return doc, nil
		case '[':
			arr := bson.A{}
			for dec.More() {
				value, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, value)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return arr, nil
		}
		return nil, fmt.Errorf("unexpected delimiter %v", t)
	case json.Number:
		return number(string(t))
	default:
		return tok, nil // string, bool, nil
	}
}

// number is json.loads' int/float split plus pymongo's int encoding.
func number(text string) (any, error) {
	if !strings.ContainsAny(text, ".eE") {
		n, ok := new(big.Int).SetString(text, 10)
		if !ok {
			return nil, fmt.Errorf("invalid number %q", text)
		}
		if !n.IsInt64() {
			return nil, ErrIntegerTooLarge
		}
		return Int(n.Int64()), nil
	}
	f, err := strconv.ParseFloat(text, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return nil, err
	}
	return f, nil // Python floats overflow to inf like ParseFloat
}

// Int is how pymongo stores a Python int: int32 when it fits.
func Int(v int64) any {
	if v >= math.MinInt32 && v <= math.MaxInt32 {
		return int32(v)
	}
	return v
}

// Normalize turns values read back from Mongo into the shapes Decode makes
// (bson.D, bson.A, int32/int64, float64, string, bool, nil); other BSON
// types are left as they are.
func Normalize(value any) any {
	switch v := value.(type) {
	case bson.D:
		out := make(bson.D, len(v))
		for i, e := range v {
			out[i] = bson.E{Key: e.Key, Value: Normalize(e.Value)}
		}
		return out
	case bson.A:
		out := make(bson.A, len(v))
		for i, item := range v {
			out[i] = Normalize(item)
		}
		return out
	case []any:
		return Normalize(bson.A(v))
	case bson.M:
		out := bson.D{}
		for key, item := range v {
			out = append(out, bson.E{Key: key, Value: Normalize(item)})
		}
		return out
	case map[string]any:
		return Normalize(bson.M(v))
	}
	return value
}

// Get returns the value of key in doc.
func Get(doc bson.D, key string) (any, bool) {
	for _, e := range doc {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

// Set mirrors dict assignment: an existing key keeps its position.
func Set(doc bson.D, key string, value any) bson.D {
	for i := range doc {
		if doc[i].Key == key {
			doc[i].Value = value
			return doc
		}
	}
	return append(doc, bson.E{Key: key, Value: value})
}

// Delete mirrors dict.pop(key, None).
func Delete(doc bson.D, key string) bson.D {
	for i := range doc {
		if doc[i].Key == key {
			return append(doc[:i:i], doc[i+1:]...)
		}
	}
	return doc
}

// Copy is a shallow copy (dict(doc)).
func Copy(doc bson.D) bson.D { return append(bson.D(nil), doc...) }

// numeric reports a Python number (bool counts: True == 1).
func numeric(value any) (*big.Float, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return big.NewFloat(1), true
		}
		return big.NewFloat(0), true
	case int32:
		return new(big.Float).SetInt64(int64(v)), true
	case int64:
		return new(big.Float).SetInt64(v), true
	case int:
		return new(big.Float).SetInt64(int64(v)), true
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, false
		}
		return new(big.Float).SetFloat64(v), true
	}
	return nil, false
}

// Equal is Python's ==: dicts compare as mappings, numbers by value across
// bool/int/float, everything else by type and value. NaN is never equal.
func Equal(a, b any) bool {
	if fa, ok := a.(float64); ok && math.IsNaN(fa) {
		return false
	}
	if fb, ok := b.(float64); ok && math.IsNaN(fb) {
		return false
	}
	if na, ok := numeric(a); ok {
		if nb, ok := numeric(b); ok {
			return na.Cmp(nb) == 0
		}
		return false
	}
	if fa, ok := a.(float64); ok {
		fb, ok := b.(float64)
		return ok && fa == fb // ±inf
	}
	switch x := a.(type) {
	case nil:
		return b == nil
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bson.D:
		y, ok := b.(bson.D)
		if !ok || len(x) != len(y) {
			return false
		}
		for _, e := range x {
			other, found := Get(y, e.Key)
			if !found || !Equal(e.Value, other) {
				return false
			}
		}
		return true
	case bson.A:
		y, ok := b.(bson.A)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !Equal(x[i], y[i]) {
				return false
			}
		}
		return true
	}
	return fmt.Sprintf("%T:%v", a, a) == fmt.Sprintf("%T:%v", b, b)
}

// Encode writes value as FastAPI's JSONResponse would: compact, UTF-8
// (ensure_ascii=False), keys in document order, Python float repr.
func Encode(value any) ([]byte, error) {
	var b strings.Builder
	if err := encode(&b, value); err != nil {
		return nil, err
	}
	return []byte(b.String()), nil
}

func encode(b *strings.Builder, value any) error {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(v))
	case int32:
		b.WriteString(strconv.FormatInt(int64(v), 10))
	case int64:
		b.WriteString(strconv.FormatInt(v, 10))
	case int:
		b.WriteString(strconv.Itoa(v))
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("out of range float values are not JSON compliant")
		}
		b.WriteString(pyjson.FloatRepr(v))
	case string:
		writeString(b, v)
	case bson.D:
		b.WriteByte('{')
		for i, e := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, e.Key)
			b.WriteByte(':')
			if err := encode(b, e.Value); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	case bson.A:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := encode(b, item); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case []any:
		return encode(b, bson.A(v))
	case bson.DateTime:
		// pymongo returns naive UTC datetimes; jsonable_encoder isoformats them.
		writeString(b, pyISO(v.Time().UTC()))
	case bson.ObjectID:
		writeString(b, v.Hex())
	default:
		return fmt.Errorf("pydoc: unsupported %T", value)
	}
	return nil
}

func pyISO(t time.Time) string {
	base := t.Format("2006-01-02T15:04:05")
	if micro := t.Nanosecond() / 1000; micro != 0 {
		base += fmt.Sprintf(".%06d", micro)
	}
	return base
}

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r < 0x20:
			fmt.Fprintf(b, `\u%04x`, r)
		default:
			b.WriteString(s[i : i+size])
		}
		i += size
	}
	b.WriteByte('"')
}
