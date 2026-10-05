package admininsights

import (
	"math"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const floatSentinel = "\ue000pyfloat:"

// decodePython is json.loads: pydoc.Decode plus the NaN, Infinity and
// -Infinity literals Python accepts, rewritten (outside strings) into
// sentinel strings and turned back into floats after decoding.
func decodePython(raw string) (any, error) {
	var b strings.Builder
	inString, escaped, rewrote := false, false, false
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if inString {
			b.WriteByte(c)
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			b.WriteByte(c)
			continue
		}
		matched := false
		for _, token := range []string{"-Infinity", "Infinity", "NaN"} {
			if strings.HasPrefix(raw[i:], token) {
				b.WriteString(`"` + floatSentinel + token + `"`)
				i += len(token) - 1
				matched, rewrote = true, true
				break
			}
		}
		if !matched {
			b.WriteByte(c)
		}
	}
	text := raw
	if rewrote {
		text = b.String()
	}
	value, err := pydoc.Decode([]byte(text))
	if err != nil || !rewrote {
		return value, err
	}
	return restoreFloats(value), nil
}

func restoreFloats(v any) any {
	switch x := v.(type) {
	case string:
		switch x {
		case floatSentinel + "NaN":
			return math.NaN()
		case floatSentinel + "Infinity":
			return math.Inf(1)
		case floatSentinel + "-Infinity":
			return math.Inf(-1)
		}
	case bson.D:
		for i := range x {
			x[i].Value = restoreFloats(x[i].Value)
		}
	case bson.A:
		for i := range x {
			x[i] = restoreFloats(x[i])
		}
	}
	return v
}
