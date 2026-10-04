package accountstore

import "testing"

func TestBSONIntegerMatchesPythonMongoCompatibility(t *testing.T) {
	tests := []struct {
		value any
		want  int64
		ok    bool
	}{
		{nil, 0, true},
		{int32(7), 7, true},
		{int64(8), 8, true},
		{int(9), 9, true},
		{"10", 0, false},
	}
	for _, tt := range tests {
		got, ok := bsonInteger(tt.value)
		if got != tt.want || ok != tt.ok {
			t.Fatalf("bsonInteger(%v)=(%d,%t) want (%d,%t)", tt.value, got, ok, tt.want, tt.ok)
		}
	}
}
