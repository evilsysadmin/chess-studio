package userdata

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type recorder struct {
	calls  []string
	failAt string
	counts map[string]int64
}

func (r *recorder) DeleteMany(_ context.Context, collection string, filter bson.D) (int64, error) {
	r.calls = append(r.calls, fmt.Sprintf("many %s %v", collection, filter))
	if collection == r.failAt {
		return 0, errors.New("down")
	}
	return r.counts[collection], nil
}

func (r *recorder) DeleteOne(_ context.Context, collection string, filter bson.D) error {
	r.calls = append(r.calls, fmt.Sprintf("one %s %v", collection, filter))
	if collection == r.failAt {
		return errors.New("down")
	}
	return nil
}

func TestPurgeDeletesEveryOwnedDocumentInPythonsOrder(t *testing.T) {
	r := &recorder{counts: map[string]int64{"games": 3, "chronicles_runs": 2, "feedback": 1, "pvp_matches": 9}}
	purged, err := Purge(context.Background(), r, "alice")
	if err != nil {
		t.Fatal(err)
	}
	if purged != (Purged{Games: 3, ChroniclesRuns: 2, Feedback: 1}) {
		t.Fatalf("purged %+v", purged)
	}
	want := []string{
		`many games {"owner":"alice"}`,
		`one profile {"_id":"alice"}`,
		`one pvp_roster {"_id":"alice"}`,
		`many pvp_challenges {"$or":[{"challenger":"alice"},{"opponent":"alice"}]}`,
		`many pvp_matches {"$or":[{"white":"alice"},{"black":"alice"}]}`,
		`many pvp_lobby_chat {"username":"alice"}`,
		`many chronicles_runs {"owner":"alice"}`,
		`one matthias_daily {"_id":"alice"}`,
		`one matthias_memory {"_id":"alice"}`,
		`many feedback {"username":"alice"}`,
	}
	if strings.Join(r.calls, "\n") != strings.Join(want, "\n") {
		t.Fatalf("calls\n%s", strings.Join(r.calls, "\n"))
	}
	r = &recorder{failAt: "pvp_matches"}
	if _, err := Purge(context.Background(), r, "alice"); !errors.Is(err, ErrUnavailable) || len(r.calls) != 5 {
		t.Fatalf("stop on error: %v %d", err, len(r.calls))
	}
}

// The cascade must stay in step with Python's: a store added there is a
// store Go would leave behind.
func TestPurgeCoversPythonsCascade(t *testing.T) {
	src, err := os.ReadFile("../../../backend-python/user_data_lifecycle.py")
	if err != nil {
		t.Fatal(err)
	}
	calls := regexp.MustCompile(`await ([a-z_]+)\.([a-z_]+)\(username\)`).FindAllStringSubmatch(string(src), -1)
	var got []string
	for _, c := range calls {
		got = append(got, c[1]+"."+c[2])
	}
	want := []string{
		"game_store.delete_games_by_owner", "profile_store.delete_profile", "pvp_store.delete_user_data",
		"chronicles_run_store.delete_user_runs", "matthias_daily_store.delete_user_daily",
		"matthias_memory_store.delete_user_memory", "feedback_store.delete_feedback_by_user",
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("Python's purge changed: %v", got)
	}
}
