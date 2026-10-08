package chroniclesrun

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

func TestPublicPreservesDungeonTopologyVersion(t *testing.T) {
	level := int64(3)
	topologyVersion := int64(1)
	row := document(NewRun{
		RunID: "run-topology",
		Owner: "tester",
		Seed: 417,
		MapID: "crypt-eight-squares",
		ContentVersion: 1,
		ManifestRevision: "revision",
		Fingerprint: "fingerprint",
		DungeonLevel: &level,
		DungeonTopologyVersion: &topologyVersion,
		Now: time.Unix(0, 0).UTC(),
	})
	public := Public(row)

	got, err := pyval.Int(get(public, "dungeonTopologyVersion"))
	if err != nil {
		t.Fatal(err)
	}
	if got != topologyVersion {
		t.Fatalf("dungeonTopologyVersion=%d, want %d", got, topologyVersion)
	}
}
