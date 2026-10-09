package chronicles

import "testing"

func TestRoutePlanForLevelScalesLengthAndCapsAtPolicyMax(t *testing.T) {
	want := map[int64]int{1: 3, 2: 4, 3: 5, 4: 6, 8: 6}
	for level, length := range want {
		route, err := RoutePlanForLevel(20261008, level)
		if err != nil {
			t.Fatalf("level %d: %v", level, err)
		}
		if len(route) != length {
			t.Fatalf("level %d: got route length %d, want %d", level, len(route), length)
		}
		if route[len(route)-1] != "echo-cistern" {
			t.Fatalf("level %d: route must end in echo-cistern: %v", level, route)
		}
	}
}
