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

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
)

type fakeChallengeCreateService struct {
	result challengecreate.Result
	err error
	calls int
	username string
	opponent string
}

func (f *fakeChallengeCreateService) Create(_ context.Context, username, opponent string) (challengecreate.Result, error) {
	f.calls++
	f.username = username
	f.opponent = opponent
	return f.result, f.err
}

func TestNativeChallengeCreateHumanReturns201AndNarratesOnlyFreshWinner(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	service := &fakeChallengeCreateService{result: challengecreate.Result{
		Challenge: challengecreate.Challenge{
			ID: "c-1", Challenger: "alice", Opponent: "bob",
			ChallengerRating: 1200, OpponentRating: 1350,
			Status: "pending", CreatedAt: now,
		},
		CreatedNow: true,
	}}
	store := &fakeStore{exists:true, version:3}
	h, err := NewHandler(HandlerConfig{
		Store: store, JWTSecret:"01234567890123456789012345678901",
		ChallengeCreate: service, Now: func() time.Time { return now },
	})
	if err != nil { t.Fatal(err) }

	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges", strings.NewReader(`{"opponent":" BOB "}`))
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 3, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if service.username != "alice" || service.opponent != "bob" { t.Fatalf("call=%q %q", service.username, service.opponent) }
	if len(store.systemMessages)!=1 || store.systemMessages[0]!="alice retó a bob." { t.Fatalf("messages=%#v", store.systemMessages) }
	var body struct{ Challenge map[string]any `json:"challenge"` }
	if err:=json.Unmarshal(rr.Body.Bytes(), &body); err!=nil { t.Fatal(err) }
	if body.Challenge["id"]!="c-1" || body.Challenge["status"]!="pending" || body.Challenge["direction"]!="outgoing" {
		t.Fatalf("challenge=%#v", body.Challenge)
	}
	if body.Challenge["resolvedAt"] != nil { t.Fatalf("resolvedAt=%#v want nil", body.Challenge["resolvedAt"]) }
}

func TestNativeChallengeCreateReusedPairDoesNotNarrateAgain(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	service := &fakeChallengeCreateService{result: challengecreate.Result{
		Challenge: challengecreate.Challenge{
			ID:"winner", Challenger:"bob", Opponent:"alice",
			ChallengerRating:1350, OpponentRating:1200, Status:"pending", CreatedAt:now,
		},
		CreatedNow:false,
	}}
	store := &fakeStore{exists:true}
	h,_:=NewHandler(HandlerConfig{Store:store,JWTSecret:"01234567890123456789012345678901",ChallengeCreate:service,Now:func()time.Time{return now}})
	req:=httptest.NewRequest(http.MethodPost,"http://edge/api/pvp/challenges",strings.NewReader(`{"opponent":"bob"}`))
	req.Header.Set("Authorization","Bearer "+signedToken(t,"alice",0,now.Add(time.Hour),"session","01234567890123456789012345678901"))
	rr:=httptest.NewRecorder()
	h.ServeHTTP(rr,req)
	if rr.Code!=http.StatusCreated { t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String()) }
	if len(store.systemMessages)!=0 { t.Fatalf("duplicate narration=%#v",store.systemMessages) }
	var body struct{ Challenge map[string]any `json:"challenge"` }
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.Challenge["direction"]!="incoming" { t.Fatalf("direction=%#v",body.Challenge["direction"]) }
}

func TestNativeChallengeCreateMapsCooldown(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	service := &fakeChallengeCreateService{err:challengecreate.CooldownError{RetryAfter:7}}
	h,_:=NewHandler(HandlerConfig{Store:&fakeStore{exists:true},JWTSecret:"01234567890123456789012345678901",ChallengeCreate:service,Now:func()time.Time{return now}})
	req:=httptest.NewRequest(http.MethodPost,"http://edge/api/pvp/challenges",strings.NewReader(`{"opponent":"bob"}`))
	req.Header.Set("Authorization","Bearer "+signedToken(t,"alice",0,now.Add(time.Hour),"session","01234567890123456789012345678901"))
	rr:=httptest.NewRecorder()
	h.ServeHTTP(rr,req)
	if rr.Code!=http.StatusTooManyRequests { t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String()) }
	if got:=rr.Header().Get("Retry-After"); got!="7" { t.Fatalf("retry-after=%q",got) }
}

func TestNativeChallengeCreateVirtualAutoAcceptsAndReadies(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	create := &fakeChallengeCreateService{result: challengecreate.Result{
		Challenge: challengecreate.Challenge{ID:"c-v",Challenger:"alice",Opponent:"otto_falk",ChallengerRating:1200,OpponentRating:850,Status:"pending",CreatedAt:now},
		CreatedNow:true,
	}}
	match := challengeaccept.Match{
		ID:"c-v",White:"alice",Black:"otto_falk",WhiteRating:1200,BlackRating:850,
		FEN:challengeaccept.StartingFEN,Turn:"w",Status:"starting",Rated:false,
		WhiteClockMS:challengeaccept.InitialClockMS,BlackClockMS:challengeaccept.InitialClockMS,
		ReadyDeadline:now.Add(challengeaccept.ReadyTimeout),CreatedAt:now,UpdatedAt:now,
	}
	accept := &fakeChallengeAcceptService{result:challengeaccept.Result{Match:match,AcceptedNow:true,Challenger:"alice"}}
	store := &fakeStore{exists:true,readyResult:readyMatchOK}
	h,_:=NewHandler(HandlerConfig{
		Store:store,JWTSecret:"01234567890123456789012345678901",
		ChallengeCreate:create,ChallengeAccept:accept,
		VirtualPlayersEnabled:true,VirtualOwner:"alice",SparringUsername:"sparringmeister",
		Now:func()time.Time{return now},
	})
	req:=httptest.NewRequest(http.MethodPost,"http://edge/api/pvp/challenges",strings.NewReader(`{"opponent":"otto_falk"}`))
	req.Header.Set("Authorization","Bearer "+signedToken(t,"alice",0,now.Add(time.Hour),"session","01234567890123456789012345678901"))
	rr:=httptest.NewRecorder()
	h.ServeHTTP(rr,req)
	if rr.Code!=http.StatusCreated { t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String()) }
	wantRatings:=map[string]int64{"sparringmeister":400,"otto_falk":850,"marta_stein":1200,"viktor_kraus":1450}
	for user,want:=range wantRatings {
		if got:=store.syntheticRoster[user]; got!=want { t.Fatalf("%s rating=%d want=%d roster=%#v",user,got,want,store.syntheticRoster) }
	}
	if accept.calls!=1 || accept.challengeID!="c-v" || accept.username!="otto_falk" || !accept.synthetic {
		t.Fatalf("accept call=%#v",accept)
	}
	if store.readyCalls!=1 || store.readyUser!="otto_falk" { t.Fatalf("ready calls=%d user=%q",store.readyCalls,store.readyUser) }
	if len(store.systemMessages)!=2 { t.Fatalf("messages=%#v",store.systemMessages) }
	var body struct{ Challenge map[string]any `json:"challenge"` }
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.Challenge["status"]!="accepted" || body.Challenge["matchId"]!="c-v" { t.Fatalf("challenge=%#v",body.Challenge) }
}

func TestNativeChallengeCreateRejectsHiddenVirtualActors(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	for _,tc:=range []struct{opponent,detail string}{
		{"sparringmeister","Ese rival de staging no está disponible para esta cuenta."},
		{"otto_falk","Ese residente no está disponible para esta cuenta."},
	}{
		t.Run(tc.opponent,func(t *testing.T){
			service:=&fakeChallengeCreateService{}
			h,_:=NewHandler(HandlerConfig{
				Store:&fakeStore{exists:true},JWTSecret:"01234567890123456789012345678901",
				ChallengeCreate:service,VirtualPlayersEnabled:true,VirtualOwner:"alice",SparringUsername:"sparringmeister",
				Now:func()time.Time{return now},
			})
			req:=httptest.NewRequest(http.MethodPost,"http://edge/api/pvp/challenges",strings.NewReader(`{"opponent":"`+tc.opponent+`"}`))
			req.Header.Set("Authorization","Bearer "+signedToken(t,"mallory",0,now.Add(time.Hour),"session","01234567890123456789012345678901"))
			rr:=httptest.NewRecorder()
			h.ServeHTTP(rr,req)
			if rr.Code!=http.StatusConflict { t.Fatalf("status=%d body=%s",rr.Code,rr.Body.String()) }
			var body map[string]any
			_ = json.Unmarshal(rr.Body.Bytes(), &body)
			if body["detail"]!=tc.detail { t.Fatalf("detail=%#v",body["detail"]) }
			if service.calls!=0 { t.Fatalf("service called=%d",service.calls) }
		})
	}
}

func TestNativeChallengeCreateMapsDomainErrors(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 30, 0, 0, time.UTC)
	tests:=[]struct{name string; err error; status int}{
		{"self",challengecreate.ErrSelfChallenge,400},
		{"self roster",challengecreate.ErrSelfUnavailable,409},
		{"opponent roster",challengecreate.ErrOpponentUnavailable,409},
		{"self busy",challengecreate.ErrSelfBusy,409},
		{"opponent busy",challengecreate.ErrOpponentBusy,409},
		{"storage",errors.New("mongo down"),503},
	}
	for _,tc:=range tests{
		t.Run(tc.name,func(t *testing.T){
			h,_:=NewHandler(HandlerConfig{
				Store:&fakeStore{exists:true},JWTSecret:"01234567890123456789012345678901",
				ChallengeCreate:&fakeChallengeCreateService{err:tc.err},Now:func()time.Time{return now},
			})
			req:=httptest.NewRequest(http.MethodPost,"http://edge/api/pvp/challenges",strings.NewReader(`{"opponent":"bob"}`))
			req.Header.Set("Authorization","Bearer "+signedToken(t,"alice",0,now.Add(time.Hour),"session","01234567890123456789012345678901"))
			rr:=httptest.NewRecorder()
			h.ServeHTTP(rr,req)
			if rr.Code!=tc.status { t.Fatalf("status=%d want=%d body=%s",rr.Code,tc.status,rr.Body.String()) }
		})
	}
}
