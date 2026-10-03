package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
)

type fakeMatchReadStore struct {
	log              *[]string
	readRow          cancelMatchRow
	observerWasLive  bool
	readFound        bool
	readErr          error
	virtualRow       cancelMatchRow
	virtualFound     bool
	virtualErr       error
	handoffRow       cancelMatchRow
	handoffChanged   bool
	handoffErr       error
	canonical        []cancelMatchRow
	canonicalFound   []bool
	canonicalErr     []error
	canonicalCalls   int
	markVirtualCalls int
	handoffCalls     int
}

func (f *fakeMatchReadStore) add(event string) {
	if f.log != nil {
		*f.log = append(*f.log, event)
	}
}
func (f *fakeMatchReadStore) ReadMatchAndTouchPresence(context.Context, string, string, time.Time) (cancelMatchRow, bool, bool, error) {
	f.add("touch")
	return f.readRow, f.observerWasLive, f.readFound, f.readErr
}
func (f *fakeMatchReadStore) MarkVirtualReady(context.Context, string, string, time.Time) (cancelMatchRow, bool, error) {
	f.markVirtualCalls++
	f.add("virtual-ready")
	return f.virtualRow, f.virtualFound, f.virtualErr
}
func (f *fakeMatchReadStore) FinishReadHandoffTimeout(context.Context, string, int64, time.Time) (cancelMatchRow, bool, error) {
	f.handoffCalls++
	f.add("handoff-timeout")
	return f.handoffRow, f.handoffChanged, f.handoffErr
}
func (f *fakeMatchReadStore) GetHandoffMatch(context.Context, string) (cancelMatchRow, bool, error) {
	f.add("read")
	i := f.canonicalCalls
	f.canonicalCalls++
	var row cancelMatchRow
	var found bool
	var err error
	if i < len(f.canonical) {
		row = f.canonical[i]
	}
	if i < len(f.canonicalFound) {
		found = f.canonicalFound[i]
	} else {
		found = true
	}
	if i < len(f.canonicalErr) {
		err = f.canonicalErr[i]
	}
	return row, found, err
}

type fakeMatchTimeoutService struct {
	log     *[]string
	outcome matchtimeout.Outcome
	err     error
	calls   int
}

func (f *fakeMatchTimeoutService) FinishIfExpired(context.Context, string) (matchtimeout.Match, matchtimeout.Outcome, error) {
	f.calls++
	if f.log != nil {
		*f.log = append(*f.log, "timeout")
	}
	return matchtimeout.Match{}, f.outcome, f.err
}

type fakeMatchDisconnectService struct {
	log             *[]string
	outcome         matchdisconnect.Outcome
	err             error
	calls           int
	observer        string
	observerWasLive bool
	opponentVirtual bool
}

func (f *fakeMatchDisconnectService) Apply(_ context.Context, _ string, observer string, observerWasLive, opponentVirtual bool) (matchdisconnect.Match, matchdisconnect.Outcome, error) {
	f.calls++
	f.observer = observer
	f.observerWasLive = observerWasLive
	f.opponentVirtual = opponentVirtual
	if f.log != nil {
		*f.log = append(*f.log, "disconnect")
	}
	return matchdisconnect.Match{}, f.outcome, f.err
}

type orderedRatingSettlement struct {
	log   *[]string
	err   error
	calls int
	match pvprating.Match
}

func (f *orderedRatingSettlement) Settle(_ context.Context, match pvprating.Match) (*pvprating.Settlement, error) {
	f.calls++
	f.match = match
	if f.log != nil {
		*f.log = append(*f.log, "settle")
	}
	if f.err != nil {
		return nil, f.err
	}
	return &pvprating.Settlement{White: 416, Black: 384}, nil
}

func activeReadRow(now time.Time) cancelMatchRow {
	whiteRating := int64(400)
	blackRating := int64(400)
	whiteClock := int64(599000)
	blackClock := int64(600000)
	rated := true
	return cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob", WhiteRating: &whiteRating, BlackRating: &blackRating,
		FEN: "8/8/8/8/8/8/8/8 w - - 0 1", Turn: "w", Status: "active", Revision: 7,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock, Rated: &rated,
		TurnStartedAt: now.Add(-time.Second), CreatedAt: now.Add(-time.Minute), UpdatedAt: now,
	}
}

func finishedDisconnectRow(now time.Time) cancelMatchRow {
	row := activeReadRow(now)
	result := "1-0"
	reason := "disconnect"
	row.Status = "finished"
	row.Result = &result
	row.EndReason = &reason
	row.TurnStartedAt = time.Time{}
	row.Revision = 8
	return row
}

func matchReadHandler(t *testing.T, now time.Time, store matchReadStore, timeout matchTimeoutService, disconnect matchDisconnectService, rating ratingSettlementService, virtual bool) *Handler {
	t.Helper()
	h, err := NewHandler(HandlerConfig{
		Store:                 &fakeStore{exists: true},
		MatchReadStore:        store,
		MatchTimeout:          timeout,
		MatchDisconnect:       disconnect,
		RatingSettlement:      rating,
		JWTSecret:             "01234567890123456789012345678901",
		VirtualPlayersEnabled: virtual,
		VirtualOwner:          "alice",
		SparringUsername:      "sparringmeister",
		Now:                   func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func matchReadRequest(t *testing.T, h *Handler, now time.Time, method, path, user string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "http://edge"+path, nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, user, 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestNativeMatchReadRunsLifecycleInPythonOrder(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	log := []string{}
	active := activeReadRow(now)
	finished := finishedDisconnectRow(now)
	store := &fakeMatchReadStore{
		log: &log, readRow: active, observerWasLive: true, readFound: true,
		canonical:      []cancelMatchRow{active, finished},
		canonicalFound: []bool{true, true},
	}
	timeout := &fakeMatchTimeoutService{log: &log, outcome: matchtimeout.OutcomeNoop}
	disconnect := &fakeMatchDisconnectService{log: &log, outcome: matchdisconnect.OutcomeFinished}
	rating := &orderedRatingSettlement{log: &log}
	h := matchReadHandler(t, now, store, timeout, disconnect, rating, false)

	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m-1", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	want := []string{"touch", "timeout", "read", "disconnect", "read", "settle"}
	if len(log) != len(want) {
		t.Fatalf("log=%#v want=%#v", log, want)
	}
	for i := range want {
		if log[i] != want[i] {
			t.Fatalf("log=%#v want=%#v", log, want)
		}
	}
	if !disconnect.observerWasLive || disconnect.observer != "alice" || disconnect.opponentVirtual {
		t.Fatalf("disconnect args=%#v", disconnect)
	}
	if rating.calls != 1 || rating.match.Status != "finished" || rating.match.Result != "1-0" {
		t.Fatalf("rating=%#v calls=%d", rating.match, rating.calls)
	}
	var body struct {
		Match       map[string]any `json:"match"`
		PollAfterMS int64          `json:"pollAfterMs"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.PollAfterMS != 1250 || body.Match["status"] != "finished" || body.Match["endReason"] != "disconnect" {
		t.Fatalf("body=%#v", body)
	}
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "match-read" {
		t.Fatalf("native=%q", got)
	}
}

func TestNativeMatchReadVirtualReadyDoesNotActivate(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	whiteRating := int64(400)
	blackRating := int64(850)
	rated := false
	row := cancelMatchRow{
		ID: "m-v", White: "alice", Black: "otto_falk", WhiteRating: &whiteRating, BlackRating: &blackRating,
		Status: "starting", Turn: "w", WhiteReady: true, BlackReady: false, Rated: &rated,
		ReadyDeadline: now.Add(20 * time.Second), Revision: 2, CreatedAt: now.Add(-time.Second), UpdatedAt: now,
	}
	ready := row
	ready.BlackReady = true
	ready.Revision = 3
	store := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		virtualRow: ready, virtualFound: true,
	}
	timeout := &fakeMatchTimeoutService{}
	disconnect := &fakeMatchDisconnectService{}
	h := matchReadHandler(t, now, store, timeout, disconnect, nil, true)

	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m-v", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if store.markVirtualCalls != 1 {
		t.Fatalf("virtual calls=%d", store.markVirtualCalls)
	}
	if timeout.calls != 0 || disconnect.calls != 0 {
		t.Fatalf("timeout=%d disconnect=%d", timeout.calls, disconnect.calls)
	}
	var body struct {
		Match map[string]any `json:"match"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.Match["status"] != "starting" || body.Match["opponentReady"] != true {
		t.Fatalf("match=%#v", body.Match)
	}
}

func TestNativeMatchReadCancelsExpiredHumanHandoff(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	row := cancelMatchRow{ID: "m", White: "alice", Black: "bob", Status: "starting", Turn: "w", ReadyDeadline: now, Revision: 4}
	cancelled := row
	cancelled.Status = "cancelled"
	reason := "handoff_timeout"
	cancelled.EndReason = &reason
	cancelled.Revision = 5
	store := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		handoffRow: cancelled, handoffChanged: true,
	}
	h := matchReadHandler(t, now, store, &fakeMatchTimeoutService{}, &fakeMatchDisconnectService{}, nil, false)
	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if store.handoffCalls != 1 || store.markVirtualCalls != 0 {
		t.Fatalf("handoff=%d virtual=%d", store.handoffCalls, store.markVirtualCalls)
	}
}

func TestNativeMatchReadSettlesAlreadyFinishedMatch(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	row := finishedDisconnectRow(now)
	store := &fakeMatchReadStore{readRow: row, observerWasLive: true, readFound: true}
	rating := &orderedRatingSettlement{}
	timeout := &fakeMatchTimeoutService{}
	disconnect := &fakeMatchDisconnectService{}
	h := matchReadHandler(t, now, store, timeout, disconnect, rating, false)
	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m-1", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rating.calls != 1 || timeout.calls != 0 || disconnect.calls != 0 {
		t.Fatalf("rating=%d timeout=%d disconnect=%d", rating.calls, timeout.calls, disconnect.calls)
	}
}

func TestNativeMatchReadMapsMissingAndStorageErrors(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	h := matchReadHandler(t, now, &fakeMatchReadStore{readFound: false}, &fakeMatchTimeoutService{}, &fakeMatchDisconnectService{}, nil, false)
	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/missing", "alice")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("missing status=%d body=%s", rr.Code, rr.Body.String())
	}

	boom := errors.New("mongo down")
	h = matchReadHandler(t, now, &fakeMatchReadStore{readErr: boom}, &fakeMatchTimeoutService{}, &fakeMatchDisconnectService{}, nil, false)
	rr = matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m", "alice")
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("error status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMatchReadRateLimitIsSixtyPerMinute(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 30, 0, 0, time.UTC)
	h := &Handler{matchReadWindows: map[string]rateWindow{}}
	for i := 0; i < 60; i++ {
		ok, retry := h.allowMatchRead("alice", now)
		if !ok || retry != 0 {
			t.Fatalf("request %d ok=%t retry=%d", i+1, ok, retry)
		}
	}
	ok, retry := h.allowMatchRead("alice", now)
	if ok || retry < 1 {
		t.Fatalf("61st ok=%t retry=%d", ok, retry)
	}
	ok, _ = h.allowMatchRead("alice", now.Add(time.Minute))
	if !ok {
		t.Fatal("new minute must reset limit")
	}
}

func TestMatchReadPathIsExact(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/pvp/matches/m-1":        true,
		"/api/pvp/matches/m-1/":       false,
		"/api/pvp/matches/m-1/pulse":  false,
		"/api/pvp/matches/m-1/resign": false,
		"/api/pvp/matches/":           false,
	} {
		_, got := matchReadID(path)
		if got != want {
			t.Fatalf("%s got=%t want=%t", path, got, want)
		}
	}
}

func TestNativeMatchReadRecoversPendingResidentReply(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 50, 0, 0, time.UTC)
	row := committedMoveHTTPRow(now)
	row.Black = "marta_stein"

	bot := row
	bot.FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
	bot.Turn = "w"
	bot.Revision = 9

	store := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		canonical:      []cancelMatchRow{row, row},
		canonicalFound: []bool{true, true},
	}
	timeout := &fakeMatchTimeoutService{outcome: matchtimeout.OutcomeNoop}
	disconnect := &fakeMatchDisconnectService{outcome: matchdisconnect.OutcomeNoop}
	moveStore := &scriptedMatchMoveStore{rows: []cancelMatchRow{bot}}
	oracle := &fakeResidentMoveOracle{uci: "e7e5"}

	h := matchReadHandler(t, now, store, timeout, disconnect, nil, true)
	h.matchMoveStore = moveStore
	h.residentMoveOracle = oracle

	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m-1", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if oracle.calls != 1 || oracle.resident != "marta_stein" || oracle.fen != row.FEN {
		t.Fatalf("oracle calls=%d resident=%q fen=%q", oracle.calls, oracle.resident, oracle.fen)
	}
	if moveStore.commitCalls != 1 || len(moveStore.updates) != 1 {
		t.Fatalf("commits=%d updates=%#v", moveStore.commitCalls, moveStore.updates)
	}
	if got := rr.Header().Get("X-Chess-Pvp-Resident-Pending"); got != "" {
		t.Fatalf("unexpected pending=%q", got)
	}
	var body struct {
		Match map[string]any `json:"match"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Match["turn"] != "w" {
		t.Fatalf("match=%#v", body.Match)
	}
}

func TestNativeMatchReadResidentOracleFailureStaysReadable(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 50, 0, 0, time.UTC)
	row := committedMoveHTTPRow(now)
	row.Black = "otto_falk"

	store := &fakeMatchReadStore{
		readRow: row, observerWasLive: true, readFound: true,
		canonical:      []cancelMatchRow{row, row},
		canonicalFound: []bool{true, true},
	}
	h := matchReadHandler(
		t, now, store,
		&fakeMatchTimeoutService{outcome: matchtimeout.OutcomeNoop},
		&fakeMatchDisconnectService{outcome: matchdisconnect.OutcomeNoop},
		nil, true,
	)
	h.matchMoveStore = &scriptedMatchMoveStore{}
	h.residentMoveOracle = &fakeResidentMoveOracle{err: errors.New("oracle unavailable")}

	rr := matchReadRequest(t, h, now, http.MethodGet, "/api/pvp/matches/m-1", "alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Resident-Pending"); got != "1" {
		t.Fatalf("pending=%q", got)
	}
	var body struct {
		Match map[string]any `json:"match"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Match["turn"] != "b" || body.Match["status"] != "active" {
		t.Fatalf("match=%#v", body.Match)
	}
}
