package matchresign

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeStore struct {
	match Match
	found bool
	err error
	finishOK bool
	finishErr error
	finishCalls int
	expectedRevision int64
	result string
	whiteClock int64
	blackClock int64
	now time.Time
}

func (f *fakeStore) GetMatch(context.Context,string)(Match,bool,error){
	return f.match,f.found,f.err
}
func (f *fakeStore) FinishResignation(_ context.Context,_ string,revision int64,result string,whiteClock,blackClock int64,now time.Time)(Match,bool,error){
	f.finishCalls++
	f.expectedRevision=revision
	f.result=result
	f.whiteClock=whiteClock
	f.blackClock=blackClock
	f.now=now
	if f.finishErr!=nil { return Match{},false,f.finishErr }
	if !f.finishOK { return Match{},false,nil }
	updated:=f.match
	updated.Status="finished"
	updated.Result=result
	updated.EndReason="resignation"
	updated.WhiteClockMS=whiteClock
	updated.BlackClockMS=blackClock
	updated.TurnStartedAt=time.Time{}
	updated.Revision++
	updated.UpdatedAt=now
	return updated,true,nil
}

func activeMatch(now time.Time) Match {
	return Match{
		ID:"m-1",White:"alice",Black:"bob",Turn:"w",Status:"active",Revision:7,
		WhiteClockMS:600000,BlackClockMS:600000,TurnStartedAt:now.Add(-1500*time.Millisecond),
	}
}

func TestResignWhiteFinishesWithBlackWinAndClockSnapshot(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	store:=&fakeStore{match:activeMatch(now),found:true,finishOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	match,outcome,err:=service.Resign(context.Background(),"m-1","alice")
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeOK || match.Status!="finished" || match.Result!="0-1" || match.EndReason!="resignation" {
		t.Fatalf("outcome=%q match=%#v",outcome,match)
	}
	if store.expectedRevision!=7 || store.whiteClock!=598500 || store.blackClock!=600000 {
		t.Fatalf("finish rev=%d clocks=%d/%d",store.expectedRevision,store.whiteClock,store.blackClock)
	}
}

func TestResignBlackFinishesWithWhiteWin(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	match:=activeMatch(now)
	match.Turn="b"
	store:=&fakeStore{match:match,found:true,finishOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Resign(context.Background(),"m-1","bob")
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeOK || store.result!="1-0" || store.whiteClock!=600000 || store.blackClock!=598500 {
		t.Fatalf("outcome=%q result=%q clocks=%d/%d",outcome,store.result,store.whiteClock,store.blackClock)
	}
}

func TestClockSnapshotDoesNotRunBeforeCountdownStart(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	match:=activeMatch(now)
	match.TurnStartedAt=now.Add(5*time.Second)
	white,black:=ClockSnapshot(match,now)
	if white!=600000 || black!=600000 { t.Fatalf("clocks=%d/%d",white,black) }
}

func TestClockSnapshotClampsExpiredClock(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	match:=activeMatch(now)
	match.WhiteClockMS=500
	match.TurnStartedAt=now.Add(-2*time.Second)
	white,black:=ClockSnapshot(match,now)
	if white!=0 || black!=600000 { t.Fatalf("clocks=%d/%d",white,black) }
}

func TestResignRejectsMissingParticipantAndFinishedMatch(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	tests:=[]struct{name,user string;match Match;found bool;want Outcome}{
		{"missing","alice",Match{},false,OutcomeNotFound},
		{"outsider","mallory",activeMatch(now),true,OutcomeNotFound},
		{"finished","alice",func()Match{m:=activeMatch(now);m.Status="finished";return m}(),true,OutcomeWrongState},
	}
	for _,tc:=range tests{
		t.Run(tc.name,func(t *testing.T){
			store:=&fakeStore{match:tc.match,found:tc.found}
			service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
			_,got,err:=service.Resign(context.Background(),"m-1",tc.user)
			if err!=nil { t.Fatal(err) }
			if got!=tc.want { t.Fatalf("outcome=%q want=%q",got,tc.want) }
			if store.finishCalls!=0 { t.Fatalf("finish calls=%d",store.finishCalls) }
		})
	}
}

func TestResignRetriesCASAndReportsConflict(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	store:=&fakeStore{match:activeMatch(now),found:true,finishOK:false}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Resign(context.Background(),"m-1","alice")
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeRevisionConflict || store.finishCalls!=3 {
		t.Fatalf("outcome=%q calls=%d",outcome,store.finishCalls)
	}
}

func TestResignPropagatesStorageFailure(t *testing.T){
	now:=time.Date(2026,10,2,12,0,0,0,time.UTC)
	boom:=errors.New("mongo down")
	store:=&fakeStore{match:activeMatch(now),found:true,finishErr:boom}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,_,err:=service.Resign(context.Background(),"m-1","alice")
	if !errors.Is(err,boom) { t.Fatalf("err=%v",err) }
}
