package pydoc

import (
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Expected strings are Python's json.dumps(json.loads(input),
// ensure_ascii=False, allow_nan=False, separators=(",", ":")).
func TestDecodeEncodeRoundTripLikeFastAPI(t *testing.T) {
	for in, want := range map[string]string{
		`{"b":1,"a":[1.0,2.5,1e16,1e-5,true,null,"ñ\n\"x\u0001"],"b":{"z":-0,"y":123456789012}}`: `{"b":{"z":0,"y":123456789012},"a":[1.0,2.5,1e+16,1e-05,true,null,"ñ\n\"x\u0001"]}`,
		`[]`:        `[]`,
		`{"k":0.1}`: `{"k":0.1}`,
	} {
		value, err := Decode([]byte(in))
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		out, err := Encode(value)
		if err != nil || string(out) != want {
			t.Errorf("%s -> %s (%v), Python %s", in, out, err, want)
		}
	}
	// Infinity is stored but cannot be answered (allow_nan=False).
	value, err := Decode([]byte(`{"x":1e400}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Encode(value); err == nil {
		t.Fatal("inf must not encode")
	}
}

func TestDecodeKeepsPymongoIntegerTypes(t *testing.T) {
	value, err := Decode([]byte(`[1, 2147483648, -2147483648, 1.0]`))
	if err != nil {
		t.Fatal(err)
	}
	arr := value.(bson.A)
	if _, ok := arr[0].(int32); !ok {
		t.Errorf("small int: %T", arr[0])
	}
	if _, ok := arr[1].(int64); !ok {
		t.Errorf("large int: %T", arr[1])
	}
	if _, ok := arr[2].(int32); !ok {
		t.Errorf("int32 min: %T", arr[2])
	}
	if _, ok := arr[3].(float64); !ok {
		t.Errorf("float: %T", arr[3])
	}
	if _, err := Decode([]byte(`[9223372036854775808]`)); !errors.Is(err, ErrIntegerTooLarge) {
		t.Errorf("overflow: %v", err)
	}
	if _, err := Decode([]byte(`{"a":1} x`)); err == nil {
		t.Error("trailing data accepted")
	}
}

// Python: 1 == 1.0 == True; {"a":1,"b":2} == {"b":2,"a":1.0}; [1] == [True];
// "1" != 1; 2**53+1 != float(2**53+1).
func TestEqualIsPythonEquality(t *testing.T) {
	d := func(s string) any {
		v, err := Decode([]byte(s))
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	for _, tc := range []struct {
		a, b any
		want bool
	}{
		{int32(1), 1.0, true},
		{true, int32(1), true},
		{d(`{"a":1,"b":2}`), d(`{"b":2,"a":1.0}`), true},
		{d(`[1]`), d(`[true]`), true},
		{"1", int32(1), false},
		{int64(1<<53 + 1), float64(1 << 53), false},
		{nil, false, false},
		{d(`{"a":null}`), d(`{}`), false},
		{d(`[1,2]`), d(`[2,1]`), false},
	} {
		if got := Equal(tc.a, tc.b); got != tc.want {
			t.Errorf("Equal(%v, %v) = %v", tc.a, tc.b, got)
		}
	}
}
