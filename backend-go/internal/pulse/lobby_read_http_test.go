package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeLobbyReadStore struct {
	snapshot lobbySnapshot
	err      error
	calls    int
	username string
	now      time.Time
}

func (f *fakeLobbyReadStore) LobbySnapshot(_ context.Context, username string, now time.Time) (lobbySnapshot, error) {
	f.calls++
	f.username = username
	f.now = now
	return f.snapshot, f.err
}

func newLobbyReadHandler(
	t *testing.T,
	now time.Time,
	base *fakeStore,
	lobby lobbyReadStore,
	virtual bool,
	owner string,
	sparring string,
) *Handler {
	t.Helper()
	if base == nil {
		base = &fakeStore{exists:true}
	}
	base.exists = true
	h, err := NewHandler(HandlerConfig{
		Store: base,
		LobbyReadStore: lobby,
		JWTSecret: "01234567890123456789012345678901",
		VirtualPlayersEnabled: virtual,
		VirtualOwner: owner,
		SparringUsername: sparring,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func lobbyReadRequest(t *testing.T, h *Handler, now time.Time, method, username string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "http://edge/api/pvp/lobby", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, username, 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestNativeLobbyReadReturnsPythonCompatibleSnapshotAndHidesSyntheticActors(t *testing.T) {
	now := time.Date(2026,10,2,14,0,0,0,time.UTC)
	joined := now.Add(-time.Hour)
	cooldown := now.Add(12*time.Second)
	lastPlayed := now.Add(-5*time.Minute)
	challengeCreated := now.Add(-10*time.Second)
	matchUpdated := now.Add(-time.Second)
	whiteRating := int64(900)
	blackRating := int64(1000)
	whiteClock := int64(600000)
	blackClock := int64(600000)
	rated := true
	active := &cancelMatchRow{
		ID:"m-1",White:"alice",Black:"bob",WhiteRating:&whiteRating,BlackRating:&blackRating,
		FEN:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		Turn:"w",Status:"starting",WhiteClockMS:&whiteClock,BlackClockMS:&blackClock,
		Rated:&rated,Revision:3,CreatedAt:now.Add(-time.Minute),UpdatedAt:matchUpdated,
	}
	store := &fakeLobbyReadStore{snapshot:lobbySnapshot{
		Roster:[]rosterRow{
			{Username:"alice",Rating:900,Tier:"Aficionado",JoinedAt:joined},
			{Username:"bob",Rating:1000,Tier:"Intermedio",JoinedAt:joined},
			{Username:"otto_falk",Rating:850,Tier:"Aficionado",JoinedAt:joined},
			{Username:"sparringmeister",Rating:400,Tier:"Principiante",JoinedAt:joined},
		},
		HeadToHead:map[string]lobbyHeadToHead{
			"bob":{Games:4,Wins:2,Draws:1,Losses:1,LastPlayedAt:lastPlayed},
		},
		Cooldowns:map[string]time.Time{"bob":cooldown},
		Challenges:[]challengeRow{{
			ID:"c-1",Challenger:"bob",Opponent:"alice",
			ChallengerRating:1000,OpponentRating:900,Status:"pending",CreatedAt:challengeCreated,
		}},
		ActiveMatch:active,
		Messages:[]chatMessageRow{
			{ID:"msg-1",Username:"bob",Text:"hola",Kind:"message",CreatedAt:now.Add(-2*time.Second)},
			{ID:"msg-2",Username:"alice",Text:"vamos",Kind:"",CreatedAt:now.Add(-time.Second)},
		},
	}}
	h := newLobbyReadHandler(t,now,&fakeStore{exists:true},store,true,"owner","sparringmeister")

	rr := lobbyReadRequest(t,h,now,http.MethodGet,"alice")
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String())
	}
	if got:=rr.Header().Get("X-Chess-Pvp-Native"); got!="lobby-read" {
		t.Fatalf("native=%q",got)
	}
	if store.calls!=1 || store.username!="alice" || !store.now.Equal(now) {
		t.Fatalf("store calls=%d user=%q now=%s",store.calls,store.username,store.now)
	}

	var body struct{
		Roster []map[string]any `json:"roster"`
		Challenges []map[string]any `json:"challenges"`
		ActiveMatch map[string]any `json:"activeMatch"`
		Messages []map[string]any `json:"messages"`
		PollAfterMS int64 `json:"pollAfterMs"`
	}
	if err:=json.Unmarshal(rr.Body.Bytes(),&body); err!=nil { t.Fatal(err) }
	if body.PollAfterMS!=3000 { t.Fatalf("poll=%d",body.PollAfterMS) }
	if len(body.Roster)!=2 {
		t.Fatalf("roster=%#v",body.Roster)
	}
	if body.Roster[0]["username"]!="alice" || body.Roster[0]["isSelf"]!=true {
		t.Fatalf("self=%#v",body.Roster[0])
	}
	bob:=body.Roster[1]
	if bob["username"]!="bob" || bob["challengeCooldownUntil"]!=stamp(cooldown) {
		t.Fatalf("bob=%#v",bob)
	}
	h2h,ok:=bob["headToHead"].(map[string]any)
	if !ok || h2h["games"]!=float64(4) || h2h["wins"]!=float64(2) ||
		h2h["draws"]!=float64(1) || h2h["losses"]!=float64(1) ||
		h2h["lastPlayedAt"]!=stamp(lastPlayed) {
		t.Fatalf("h2h=%#v",bob["headToHead"])
	}
	if len(body.Challenges)!=1 || body.Challenges[0]["direction"]!="incoming" {
		t.Fatalf("challenges=%#v",body.Challenges)
	}
	if body.ActiveMatch["id"]!="m-1" || body.ActiveMatch["status"]!="starting" {
		t.Fatalf("activeMatch=%#v",body.ActiveMatch)
	}
	if len(body.Messages)!=2 || body.Messages[0]["isSelf"]!=false || body.Messages[1]["isSelf"]!=true {
		t.Fatalf("messages=%#v",body.Messages)
	}
	if body.Messages[1]["kind"]!="message" {
		t.Fatalf("default kind=%#v",body.Messages[1])
	}
}

func TestNativeLobbyReadOwnerSeedsAndExposesResidentIdentity(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	base:=&fakeStore{exists:true}
	store:=&fakeLobbyReadStore{snapshot:lobbySnapshot{Roster:[]rosterRow{
		{Username:"owner",Rating:400,Tier:"Principiante",JoinedAt:now},
		{Username:"otto_falk",Rating:850,Tier:"Aficionado",JoinedAt:now},
	}}}
	h:=newLobbyReadHandler(t,now,base,store,true,"owner","sparringmeister")

	rr:=lobbyReadRequest(t,h,now,http.MethodGet,"owner")
	if rr.Code!=http.StatusOK { t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String()) }
	for name,want:=range map[string]int64{
		"sparringmeister":400,
		"otto_falk":850,
		"marta_stein":1200,
		"viktor_kraus":1450,
	}{
		if got:=base.syntheticRoster[name]; got!=want {
			t.Fatalf("synthetic %s=%d want=%d all=%#v",name,got,want,base.syntheticRoster)
		}
	}
	var body struct{ Roster []map[string]any `json:"roster"` }
	if err:=json.Unmarshal(rr.Body.Bytes(),&body); err!=nil { t.Fatal(err) }
	if len(body.Roster)!=2 { t.Fatalf("roster=%#v",body.Roster) }
	otto:=body.Roster[1]
	if otto["displayName"]!="Otto Falk" || otto["actorKind"]!="resident" || otto["actorLabel"]!="RESIDENTE · IA" {
		t.Fatalf("resident identity=%#v",otto)
	}
}

func TestNativeLobbyReadMapsStorageFailure(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	store:=&fakeLobbyReadStore{err:errors.New("mongo down")}
	h:=newLobbyReadHandler(t,now,&fakeStore{exists:true},store,false,"","")
	rr:=lobbyReadRequest(t,h,now,http.MethodGet,"alice")
	if rr.Code!=http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String())
	}
}

func TestNativeLobbyReadRejectsWrongMethod(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	h:=newLobbyReadHandler(t,now,&fakeStore{exists:true},&fakeLobbyReadStore{},false,"","")
	rr:=lobbyReadRequest(t,h,now,http.MethodPost,"alice")
	if rr.Code!=http.StatusMethodNotAllowed {
		t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String())
	}
	if got:=rr.Header().Get("Allow"); got!="GET, OPTIONS" {
		t.Fatalf("allow=%q",got)
	}
}

func TestLobbyReadRateLimitIsFortyPerMinute(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	h:=&Handler{lobbyReadWindows:map[string]rateWindow{}}
	for i:=0;i<40;i++ {
		ok,retry:=h.allowLobbyRead("alice",now)
		if !ok || retry!=0 {
			t.Fatalf("request %d ok=%t retry=%d",i+1,ok,retry)
		}
	}
	ok,retry:=h.allowLobbyRead("alice",now)
	if ok || retry<1 {
		t.Fatalf("41st ok=%t retry=%d",ok,retry)
	}
	ok,_=h.allowLobbyRead("alice",now.Add(time.Minute))
	if !ok { t.Fatal("new minute must reset limit") }
}

func TestPublicLobbyRosterOmitsOptionalFieldsForSelf(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	h2h:=&lobbyHeadToHead{Games:3,Wins:1,Draws:1,Losses:1,LastPlayedAt:now}
	got:=publicLobbyRoster(
		rosterRow{Username:"alice",Rating:0,JoinedAt:now},
		"alice",h2h,now.Add(time.Minute),false,
	)
	if got["rating"]!=int64(0) || got["tier"]!="Principiante" {
		t.Fatalf("rating/tier=%#v",got)
	}
	if _,ok:=got["headToHead"]; ok { t.Fatalf("self h2h leaked=%#v",got) }
	if _,ok:=got["challengeCooldownUntil"]; ok { t.Fatalf("self cooldown leaked=%#v",got) }
}


func TestNativeLobbyReadMarksRouteBeforeAuthentication(t *testing.T) {
	now:=time.Date(2026,10,2,14,0,0,0,time.UTC)
	h:=newLobbyReadHandler(t,now,&fakeStore{exists:true},&fakeLobbyReadStore{},false,"","")
	req:=httptest.NewRequest(http.MethodGet,"http://edge/api/pvp/lobby",nil)
	rr:=httptest.NewRecorder()
	h.ServeHTTP(rr,req)
	if rr.Code!=http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String())
	}
	if got:=rr.Header().Get("X-Chess-Pvp-Native"); got!="lobby-read" {
		t.Fatalf("native marker=%q",got)
	}
}
