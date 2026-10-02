package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchmove"
)

type fakeMatchMoveStore struct {
	match       matchmove.Match
	found       bool
	getErr      error
	commitRow   cancelMatchRow
	commitOK    bool
	commitErr   error
	getCalls    int
	commitCalls int
	updates     []matchmove.Update
	log         *[]string
}

func (f *fakeMatchMoveStore) GetMatch(context.Context, string) (matchmove.Match, bool, error) {
	f.getCalls++
	if f.log != nil {
		*f.log = append(*f.log, "move-get")
	}
	return f.match, f.found, f.getErr
}

func (f *fakeMatchMoveStore) Commit(_ context.Context, _ string, update matchmove.Update) (cancelMatchRow, bool, error) {
	f.commitCalls++
	f.updates = append(f.updates, update)
	if f.log != nil {
		*f.log = append(*f.log, "commit")
	}
	return f.commitRow, f.commitOK, f.commitErr
}

func moveHTTPRow(now time.Time) cancelMatchRow {
	whiteRating := int64(400)
	blackRating := int64(400)
	whiteClock := int64(600000)
	blackClock := int64(600000)
	rated := true
	return cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob",
		WhiteRating: &whiteRating, BlackRating: &blackRating,
		FEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		Turn: "w", Status: "active", Revision: 7,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock,
		TurnStartedAt: now.Add(-1500 * time.Millisecond),
		Rated: &rated, CreatedAt: now.Add(-time.Minute), UpdatedAt: now,
	}
}

func committedMoveHTTPRow(now time.Time) cancelMatchRow {
	row := moveHTTPRow(now)
	whiteClock := int64(598500)
	row.FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
	row.Turn = "b"
	row.Revision = 8
	row.WhiteClockMS = &whiteClock
	row.TurnStartedAt = now
	row.UpdatedAt = now
	return row
}

func newMoveHandlerForTest(
	t *testing.T,
	now time.Time,
	moveStore matchMoveStore,
	readStore matchReadStore,
) *Handler {
	t.Helper()
	h, err := NewHandler(HandlerConfig{
		Store:           &fakeStore{exists: true},
		JWTSecret:       "01234567890123456789012345678901",
		MatchMoveStore:  moveStore,
		MatchReadStore:  readStore,
		MatchTimeout:    &fakeMatchTimeoutService{},
		MatchDisconnect: &fakeMatchDisconnectService{},
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func moveRequest(t *testing.T, h *Handler, now time.Time, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/move", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestNativeMoveHumanCommitsPreparedCAS(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	log := []string{}
	row := moveHTTPRow(now)
	committed := committedMoveHTTPRow(now)
	moveStore := &fakeMatchMoveStore{
		match: moveDomainMatch(row), found: true,
		commitRow: committed, commitOK: true, log: &log,
	}
	readStore := &fakeMatchReadStore{
		log: &log, readRow: row, observerWasLive: true, readFound: true,
		canonical: []cancelMatchRow{row, row},
		canonicalFound: []bool{true, true},
	}
	h := newMoveHandlerForTest(t, now, moveStore, readStore)

	rr := moveRequest(t, h, now, `{"from":"e2","to":"e4","promotion":null}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "match-move" {
		t.Fatalf("native=%q", got)
	}
	if moveStore.commitCalls != 1 || len(moveStore.updates) != 1 {
		t.Fatalf("commit calls=%d updates=%#v", moveStore.commitCalls, moveStore.updates)
	}
	update := moveStore.updates[0]
	if update.ExpectedRevision != 7 || update.UCI != "e2e4" || update.SAN != "e4" ||
		update.FEN != committed.FEN || update.Turn != "b" || update.Status != "active" {
		t.Fatalf("update=%#v", update)
	}
	if update.WhiteClockMS != 598500 || update.BlackClockMS != 600000 {
		t.Fatalf("clocks=%d/%d", update.WhiteClockMS, update.BlackClockMS)
	}
	wantOrder := []string{"move-get", "touch", "timeout", "read", "disconnect", "read", "commit"}
	if len(log) != len(wantOrder) {
		t.Fatalf("order=%#v want=%#v", log, wantOrder)
	}
	for i := range wantOrder {
		if log[i] != wantOrder[i] {
			t.Fatalf("order=%#v want=%#v", log, wantOrder)
		}
	}
}

func TestNativeMoveResidentFailsBeforePresenceOrBoardMutation(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	row := moveHTTPRow(now)
	row.Black = "otto_falk"
	moveStore := &fakeMatchMoveStore{match: moveDomainMatch(row), found: true}
	readStore := &fakeMatchReadStore{readRow: row, readFound: true}
	h := newMoveHandlerForTest(t, now, moveStore, readStore)

	rr := moveRequest(t, h, now, `{"from":"e2","to":"e4"}`)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if moveStore.commitCalls != 0 || readStore.canonicalCalls != 0 {
		t.Fatalf("mutated resident flow commit=%d reads=%d", moveStore.commitCalls, readStore.canonicalCalls)
	}
}

func TestNativeMoveMapsIllegalMove(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	row := moveHTTPRow(now)
	moveStore := &fakeMatchMoveStore{match: moveDomainMatch(row), found: true}
	readStore := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		canonical: []cancelMatchRow{row, row},
		canonicalFound: []bool{true, true},
	}
	h := newMoveHandlerForTest(t, now, moveStore, readStore)

	rr := moveRequest(t, h, now, `{"from":"e2","to":"e5"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body["detail"] != "Jugada ilegal." {
		t.Fatalf("detail=%#v", body["detail"])
	}
	if moveStore.commitCalls != 0 {
		t.Fatalf("commit calls=%d", moveStore.commitCalls)
	}
}

func TestNativeMoveRejectsMalformedPayloadAs422(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	row := moveHTTPRow(now)
	moveStore := &fakeMatchMoveStore{match: moveDomainMatch(row), found: true}
	h := newMoveHandlerForTest(t, now, moveStore, &fakeMatchReadStore{})

	for _, body := range []string{
		`{"from":"E2","to":"e4"}`,
		`{"from":"e2","to":"e9"}`,
		`{"from":"e7","to":"e8","promotion":"k"}`,
		`{"from":"e2"}`,
		`not-json`,
	} {
		rr := moveRequest(t, h, now, body)
		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("body=%s status=%d response=%s", body, rr.Code, rr.Body.String())
		}
	}
}

func TestNativeMoveRetriesCASAndReturnsConflict(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	row := moveHTTPRow(now)
	moveStore := &fakeMatchMoveStore{
		match: moveDomainMatch(row), found: true,
		commitOK: false,
	}
	readStore := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		canonical: []cancelMatchRow{row, row, row, row, row, row},
		canonicalFound: []bool{true, true, true, true, true, true},
	}
	h := newMoveHandlerForTest(t, now, moveStore, readStore)

	rr := moveRequest(t, h, now, `{"from":"e2","to":"e4"}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if moveStore.commitCalls != 3 || moveStore.getCalls != 3 {
		t.Fatalf("get=%d commit=%d", moveStore.getCalls, moveStore.commitCalls)
	}
}

func TestNativeMoveStorageFailureIsRetryable503(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	boom := errors.New("mongo down")
	moveStore := &fakeMatchMoveStore{getErr: boom}
	h := newMoveHandlerForTest(t, now, moveStore, &fakeMatchReadStore{})
	rr := moveRequest(t, h, now, `{"from":"e2","to":"e4"}`)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMoveRateLimitIsFortyFivePerMinute(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 30, 0, 0, time.UTC)
	h := &Handler{matchMoveWindows: map[string]rateWindow{}}
	for i := 0; i < 45; i++ {
		ok, retry := h.allowMatchMove("alice", now)
		if !ok || retry != 0 {
			t.Fatalf("request=%d ok=%t retry=%d", i+1, ok, retry)
		}
	}
	ok, retry := h.allowMatchMove("alice", now)
	if ok || retry < 1 {
		t.Fatalf("46th ok=%t retry=%d", ok, retry)
	}
	ok, _ = h.allowMatchMove("alice", now.Add(time.Minute))
	if !ok {
		t.Fatal("new minute must reset move rate limit")
	}
}

func TestMatchMovePathIsExact(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/pvp/matches/m-1/move": true,
		"/api/pvp/matches/m-1/move/": false,
		"/api/pvp/matches//move": false,
		"/api/pvp/matches/m-1": false,
		"/api/pvp/matches/m-1/resign": false,
	} {
		_, got := matchMoveID(path)
		if got != want {
			t.Fatalf("%s got=%t want=%t", path, got, want)
		}
	}
}
