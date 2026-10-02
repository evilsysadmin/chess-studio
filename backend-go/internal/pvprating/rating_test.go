package pvprating

import (
	"context"
	"errors"
	"testing"
)

type fakeStore struct {
	applied []applyCall
	result map[string]bool
	err map[string]error
}

type applyCall struct {
	username string
	matchID string
	expected int64
	next int64
}

func (f *fakeStore) ApplyRating(_ context.Context, username, matchID string, expected, next int64) (bool, error) {
	f.applied = append(f.applied, applyCall{username:username,matchID:matchID,expected:expected,next:next})
	if err:=f.err[username]; err!=nil { return false, err }
	if value,ok:=f.result[username]; ok { return value,nil }
	return true,nil
}

func TestNextRatingsMatchesPythonVectors(t *testing.T) {
	tests:=[]struct{
		white,black int64
		result string
		wantWhite,wantBlack int64
	}{
		{400,400,"1-0",416,384},
		{400,400,"0-1",384,416},
		{400,400,"1/2-1/2",400,400},
		{1200,1350,"1-0",1223,1327},
		{1200,1350,"0-1",1191,1359},
		{1200,1350,"1/2-1/2",1207,1343},
		{100,10000,"0-1",100,10000},
		{100,10000,"1-0",132,9968},
	}
	for _,tc:=range tests{
		gotW,gotB,err:=NextRatings(tc.white,tc.black,tc.result)
		if err!=nil { t.Fatal(err) }
		if gotW!=tc.wantWhite || gotB!=tc.wantBlack {
			t.Fatalf("%d/%d %s => %d/%d want %d/%d",tc.white,tc.black,tc.result,gotW,gotB,tc.wantWhite,tc.wantBlack)
		}
	}
}

func TestNormalizeMatchesPythonBoundsAndDefault(t *testing.T) {
	for raw,want:=range map[int64]int64{
		0:400, 99:100, 100:100, 400:400, 10000:10000, 10001:10000,
	}{
		if got:=Normalize(raw); got!=want { t.Fatalf("Normalize(%d)=%d want=%d",raw,got,want) }
	}
}

func TestNextRatingsRejectsInvalidResult(t *testing.T) {
	if _,_,err:=NextRatings(400,400,"*"); !errors.Is(err,ErrInvalidResult) {
		t.Fatalf("err=%v",err)
	}
}

func TestSettleAppliesFrozenRatingsToBothPlayers(t *testing.T) {
	store:=&fakeStore{}
	service,_:=New(store)
	result,err:=service.Settle(context.Background(),Match{
		ID:"m-1",Status:"finished",Rated:true,Result:"1-0",
		White:"alice",Black:"bob",WhiteRating:1200,BlackRating:1350,
	})
	if err!=nil { t.Fatal(err) }
	if result==nil || result.White!=1223 || result.Black!=1327 { t.Fatalf("result=%#v",result) }
	if len(store.applied)!=2 { t.Fatalf("applied=%#v",store.applied) }
	if got:=store.applied[0]; got.username!="alice" || got.expected!=1200 || got.next!=1223 || got.matchID!="m-1" {
		t.Fatalf("white call=%#v",got)
	}
	if got:=store.applied[1]; got.username!="bob" || got.expected!=1350 || got.next!=1327 || got.matchID!="m-1" {
		t.Fatalf("black call=%#v",got)
	}
}

func TestSettleIsRecoverableWhenOnlyOneSideWasPreviouslyApplied(t *testing.T) {
	store:=&fakeStore{result:map[string]bool{"alice":true,"bob":false}}
	service,_:=New(store)
	result,err:=service.Settle(context.Background(),Match{
		ID:"m-1",Status:"finished",Rated:true,Result:"1-0",
		White:"alice",Black:"bob",WhiteRating:1200,BlackRating:1350,
	})
	if err!=nil { t.Fatal(err) }
	if result!=nil { t.Fatalf("result=%#v want nil until both sides settle",result) }

	store.result["bob"]=true
	result,err=service.Settle(context.Background(),Match{
		ID:"m-1",Status:"finished",Rated:true,Result:"1-0",
		White:"alice",Black:"bob",WhiteRating:1200,BlackRating:1350,
	})
	if err!=nil { t.Fatal(err) }
	if result==nil || result.White!=1223 || result.Black!=1327 { t.Fatalf("retry result=%#v",result) }
}

func TestSettleSkipsUnratedOrInvalidMatches(t *testing.T) {
	store:=&fakeStore{}
	service,_:=New(store)
	cases:=[]Match{
		{ID:"m",Status:"active",Rated:true,Result:"1-0",White:"a",Black:"b"},
		{ID:"m",Status:"finished",Rated:false,Result:"1-0",White:"a",Black:"b"},
		{ID:"m",Status:"finished",Rated:true,Result:"*",White:"a",Black:"b"},
		{ID:"m",Status:"finished",Rated:true,Result:"1-0",White:"a",Black:"a"},
	}
	for _,match:=range cases{
		got,err:=service.Settle(context.Background(),match)
		if err!=nil { t.Fatal(err) }
		if got!=nil { t.Fatalf("unexpected settlement %#v for %#v",got,match) }
	}
	if len(store.applied)!=0 { t.Fatalf("applied=%#v",store.applied) }
}

func TestSettlePropagatesStorageFailure(t *testing.T) {
	boom:=errors.New("mongo down")
	store:=&fakeStore{err:map[string]error{"alice":boom}}
	service,_:=New(store)
	_,err:=service.Settle(context.Background(),Match{
		ID:"m",Status:"finished",Rated:true,Result:"1-0",White:"alice",Black:"bob",WhiteRating:400,BlackRating:400,
	})
	if !errors.Is(err,boom) { t.Fatalf("err=%v",err) }
	if len(store.applied)!=1 { t.Fatalf("calls=%#v",store.applied) }
}
