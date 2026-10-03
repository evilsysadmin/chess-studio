package gamestore

import (
	"testing"
	"time"
)

func TestPyNaiveISOFormat(t *testing.T) {
	for in, want := range map[time.Time]string{
		time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC):                       "2026-10-03T07:00:00",
		time.Date(2026, 10, 3, 7, 0, 5, 123_000_000, time.UTC):             "2026-10-03T07:00:05.123000",
		time.Date(2026, 1, 2, 3, 4, 5, 1_000, time.UTC):                    "2026-01-02T03:04:05.000001",
		time.Date(2026, 10, 3, 9, 0, 0, 0, time.FixedZone("CEST", 2*3600)): "2026-10-03T07:00:00",
	} {
		if got := PyNaiveISOFormat(in); got != want {
			t.Errorf("%v: got %s want %s", in, got, want)
		}
	}
}
