package pyval

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestFromISOFormatMatchesPython(t *testing.T) {
	for _, c := range isoCases {
		got := "error"
		if v, aware, ok := FromISOFormat(c.in); ok {
			got = ISOFormatUTC(v) + map[bool]string{true: " aware", false: " naive"}[aware]
		}
		if got != c.want {
			t.Errorf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}

func TestStrIntAndBoundedText(t *testing.T) {
	strs := map[string]any{
		"True": true, "7": int32(7), "2.5": 2.5, "1e+16": 1e16, "1.0": 1.0,
		"{'a': 1}": bson.D{{Key: "a", Value: int32(1)}}, "['q', 2]": bson.A{"q", int32(2)},
		`["it's", 'x"y']`: bson.A{"it's", `x"y`}, "['a\\nb']": bson.A{"a\nb"}, "None": nil,
	}
	for want, v := range strs {
		if got := Str(v); got != want {
			t.Errorf("str(%v) = %q want %q", v, got, want)
		}
	}
	ints := map[string]int64{"7": 7, " 8 ": 8, "+9": 9, "-1_000": -1000, "007": 7}
	for s, want := range ints {
		if got, err := Int(s); err != nil || got != want {
			t.Errorf("int(%q) = %d, %v", s, got, err)
		}
	}
	for _, bad := range []any{"abc", "3.5", "", "1__0", "_1", bson.A{}, bson.D{}, nil} {
		if _, err := Int(bad); err == nil {
			t.Errorf("int(%v) must fail", bad)
		}
	}
	if got := BoundedText("  espacios raros　aquí\x1csep ", 100); got != "espacios raros aquí sep" {
		t.Errorf("bounded: %q", got)
	}
	if got := BoundedText(0, 10); got != "" {
		t.Errorf("falsy: %q", got)
	}
	if got := BoundedText("ééééé", 3); got != "ééé" {
		t.Errorf("runes: %q", got)
	}
}

func TestParseISOFormatErrorsMatchPython(t *testing.T) {
	for _, c := range isoErrorCases {
		v, aware, err := ParseISOFormat(c.in)
		got := ""
		switch {
		case err != nil:
			got = "err " + err.Error()
		case aware && (v.Year() < 1 || v.Year() > 9999):
			got = "overflow"
		default:
			got = v.Format("2006-01-02T15:04:05.000000") + "+00:00" + map[bool]string{true: " aware", false: " naive"}[aware]
		}
		if got != c.want {
			t.Errorf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}
