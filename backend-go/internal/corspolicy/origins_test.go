package corspolicy

import "testing"

func TestCanonicalBrowserOriginsReturnsDefensiveCopy(t *testing.T) {
	first := CanonicalBrowserOrigins()
	if len(first) == 0 {
		t.Fatal("canonical browser origins are empty")
	}
	original := first[0]
	first[0] = "https://mutated.invalid"
	second := CanonicalBrowserOrigins()
	if second[0] != original {
		t.Fatalf("global origin policy mutated: %q", second[0])
	}
}
