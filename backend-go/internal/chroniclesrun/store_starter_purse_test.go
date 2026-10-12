package chroniclesrun

import (
  "testing"

  "go.mongodb.org/mongo-driver/v2/bson"
  "github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func TestStartingPurseIsCreatedOnceForBookOne(t *testing.T) {
  row := document(NewRun{RunID: "fresh", Owner: "tester", MapID: "swordhaven-first-book"})
  raw, ok := pydoc.Get(row, "inventory")
  if !ok { t.Fatal("missing authoritative starter inventory") }
  wallet, ok := raw.(bson.D)
  if !ok { t.Fatalf("unexpected inventory type %T", raw) }
  rawGold, ok := pydoc.Get(wallet, "crown-gold")
  if !ok { t.Fatal("first-book expedition has no starting gold") }
  gold, ok := rawGold.(bson.D)
  if !ok { t.Fatalf("unexpected gold type %T", rawGold) }
  amount, ok := pydoc.Get(gold, "quantity")
  if !ok || amount != int32(20) { t.Fatalf("expected 20 starter gold, got %v", amount) }

  old := document(NewRun{RunID: "old", Owner: "tester", MapID: "swordhaven-square"})
  legacy, _ := pydoc.Get(old, "inventory")
  if len(legacy.(bson.D)) != 0 { t.Fatal("legacy maps must not get new starter gold") }
}
