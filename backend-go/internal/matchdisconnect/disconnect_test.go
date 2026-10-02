package matchdisconnect

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
	beginOK bool
	beginErr error
	finishOK bool
	finishErr error
	beginCalls int
	finishCalls int
	getCalls int
	beginColor Color
	restart bool
	result string
	whiteClock int64
	blackClock int64
}

func (f *fakeStore) GetMatch(context.Context,string)(Match,bool,error){
	f.getCalls++
	return f.match,f.found,f.err
}
func (f *fakeStore) BeginGrace(_ context.Context,_ string,color Color,now time.Time,restart bool)(Match,bool,error){
	f.beginCalls++
	f.beginColor=color
	f.restart=restart
	if f.beginErr!=nil { return Match{},false,f.beginErr }
	if !f.beginOK { return Match{},false,nil }
	updated:=f.match
	if color==White { updated.WhiteGraceAt=now } else { updated.BlackGraceAt=now }
	f.match=updated
	return updated,true,nil
}
func (f *fakeStore) FinishDisconnect(_ context.Context,_ string,_ int64,result string,whiteClock,blackClock int64,_ time.Time)(Match,bool,error){
	f.finishCalls++
	f.result=result
	f.whiteClock=whiteClock
	f.blackClock=blackClock
	if f.finishErr!=nil { return Match{},false,f.finishErr }
	if !f.finishOK { return Match{},false,nil }
	updated:=f.match
	updated.Status="finished"
	updated.Result=result
	updated.EndReason="disconnect"
	updated.WhiteClockMS=whiteClock
	updated.BlackClockMS=blackClock
	updated.TurnStartedAt=time.Time{}
	updated.Revision++
	f.match=updated
	return updated,true,nil
}

func active(now time.Time) Match {
	return Match{
		ID:"m-1",White:"alice",Black:"bob",Turn:"w",Status:"active",Revision:5,
		WhiteClockMS:600000,BlackClockMS:600000,TurnStartedAt:now.Add(-time.Second),
		WhiteSeenAt:now,BlackSeenAt:now.Add(-20*time.Second),
	}
}

func TestApplyStartsGraceForDisconnectedOpponent(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	store:=&fakeStore{match:active(now),found:true,beginOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	match,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeGraceStarted || store.beginCalls!=1 || store.beginColor!=Black || store.restart {
		t.Fatalf("outcome=%q begin=%d color=%q restart=%t",outcome,store.beginCalls,store.beginColor,store.restart)
	}
	if !match.BlackGraceAt.Equal(now) || store.finishCalls!=0 {
		t.Fatalf("match=%#v finish=%d",match,store.finishCalls)
	}
}

func TestApplyRestartsGraceWhenObserverWasNotLive(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.BlackGraceAt=now.Add(-55*time.Second)
	store:=&fakeStore{match:match,found:true,beginOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	got,outcome,err:=service.Apply(context.Background(),"m-1","alice",false,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeGraceStarted || !store.restart || !got.BlackGraceAt.Equal(now) {
		t.Fatalf("outcome=%q restart=%t match=%#v",outcome,store.restart,got)
	}
	if store.finishCalls!=0 { t.Fatalf("finish=%d",store.finishCalls) }
}

func TestApplyKeepsExistingGraceWhenObserverStayedLive(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.BlackGraceAt=now.Add(-30*time.Second)
	store:=&fakeStore{match:match,found:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeNoop || store.beginCalls!=0 || store.finishCalls!=0 {
		t.Fatalf("outcome=%q begin=%d finish=%d",outcome,store.beginCalls,store.finishCalls)
	}
}

func TestApplyForfeitsDisconnectedOpponentAfterGrace(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.BlackGraceAt=now.Add(-GracePeriod)
	store:=&fakeStore{match:match,found:true,finishOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	got,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeFinished || got.Status!="finished" || got.Result!="1-0" || got.EndReason!="disconnect" {
		t.Fatalf("outcome=%q match=%#v",outcome,got)
	}
	if store.result!="1-0" || store.whiteClock!=599000 || store.blackClock!=600000 {
		t.Fatalf("result=%q clocks=%d/%d",store.result,store.whiteClock,store.blackClock)
	}
}

func TestApplyForfeitsWhiteOpponentWhenBlackObserves(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.WhiteSeenAt=now.Add(-30*time.Second)
	match.BlackSeenAt=now
	match.WhiteGraceAt=now.Add(-GracePeriod)
	store:=&fakeStore{match:match,found:true,finishOK:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Apply(context.Background(),"m-1","bob",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeFinished || store.result!="0-1" {
		t.Fatalf("outcome=%q result=%q",outcome,store.result)
	}
}

func TestApplyVirtualOpponentNeverStartsGrace(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	store:=&fakeStore{match:active(now),found:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,true)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeNoop || store.beginCalls!=0 || store.finishCalls!=0 {
		t.Fatalf("outcome=%q begin=%d finish=%d",outcome,store.beginCalls,store.finishCalls)
	}
}

func TestApplyRecentlyPresentOpponentDoesNothing(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.BlackSeenAt=now.Add(-ReconnectingWindow)
	store:=&fakeStore{match:match,found:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeNoop || store.beginCalls!=0 { t.Fatalf("outcome=%q begin=%d",outcome,store.beginCalls) }
}

func TestApplyMissedFinishCASRereadsCurrentState(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	match:=active(now)
	match.BlackGraceAt=now.Add(-GracePeriod)
	store:=&fakeStore{match:match,found:true,finishOK:false}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	got,outcome,err:=service.Apply(context.Background(),"m-1","alice",true,false)
	if err!=nil { t.Fatal(err) }
	if outcome!=OutcomeNoop || got.ID!="m-1" || store.getCalls!=2 {
		t.Fatalf("outcome=%q got=%#v getCalls=%d",outcome,got,store.getCalls)
	}
}

func TestApplyRejectsOutsiderAndPropagatesStorage(t *testing.T){
	now:=time.Date(2026,10,2,13,10,0,0,time.UTC)
	store:=&fakeStore{match:active(now),found:true}
	service,_:=New(Config{Store:store,Now:func()time.Time{return now}})
	_,outcome,err:=service.Apply(context.Background(),"m-1","mallory",true,false)
	if err!=nil || outcome!=OutcomeNotFound { t.Fatalf("outcome=%q err=%v",outcome,err) }

	boom:=errors.New("mongo down")
	service,_=New(Config{Store:&fakeStore{err:boom},Now:func()time.Time{return now}})
	_,_,err=service.Apply(context.Background(),"m-1","alice",true,false)
	if !errors.Is(err,boom) { t.Fatalf("err=%v",err) }
}
