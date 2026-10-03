package pyjson

import "testing"

func TestPyFloatRepr(t *testing.T) {
	for in, want := range map[float64]string{
		50: "50.0", 0.1: "0.1", 1e-05: "1e-05", 0.0001: "0.0001", 1e16: "1e+16",
		1e15: "1000000000000000.0", 123456789.125: "123456789.125", -3.25: "-3.25",
		1.5e300: "1.5e+300", 5e-324: "5e-324",
	} {
		if got := FloatRepr(in); got != want {
			t.Errorf("%v: got %s want %s", in, got, want)
		}
	}
}

func TestDumpsMatchesPythonShapes(t *testing.T) {
	got, err := Dumps(map[string]any{
		"b": []string{"1.2.3.4", "é"}, "a": Int(200), "c": 12.5, "d": 1000000.0, "e": true, "f": nil, "g": "😀\"",
	})
	if err != nil {
		t.Fatal(err)
	}
	// python3 -c 'import json;print(json.dumps({"b":["1.2.3.4","é"],"a":200,"c":12.5,"d":1000000.0,"e":True,"f":None,"g":"😀\""},sort_keys=True,separators=(",",":"),ensure_ascii=True))'
	want := `{"a":200,"b":["1.2.3.4","\u00e9"],"c":12.5,"d":1000000.0,"e":true,"f":null,"g":"\ud83d\ude00\""}`
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}
