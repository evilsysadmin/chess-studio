package chessrules

import (
	"os/exec"
	"testing"
)

func TestDependencyChecksumProbe(t *testing.T) {
	out, err := exec.Command("go", "mod", "download", "-json", "github.com/corentings/chess/v2@v2.6.0").CombinedOutput()
	if err != nil {
		t.Fatalf("go mod download failed: %v\n%s", err, out)
	}
	t.Fatalf("dependency checksum probe:\n%s", out)
}
