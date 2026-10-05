package authcrypto

import (
	"encoding/json"
	"os"
	"testing"
)

// TestVerifyPasswordMatchesPython replays scripts/password_parity_corpus.py:
// every (password, hash) answer auth.verify_password gave.
func TestVerifyPasswordMatchesPython(t *testing.T) {
	raw, err := os.ReadFile("testdata/python_password_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Rows []struct {
			Hash   string `json:"hash"`
			Checks []struct {
				Candidate string `json:"candidate"`
				OK        bool   `json:"ok"`
			} `json:"checks"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	accepted, total := 0, 0
	for _, row := range corpus.Rows {
		for _, check := range row.Checks {
			total++
			got := VerifyPassword(check.Candidate, row.Hash)
			if got != check.OK {
				t.Errorf("verify(%q, %.40s…) = %v, Python %v", check.Candidate, row.Hash, got, check.OK)
			}
			if got {
				accepted++
			}
		}
	}
	if total < 150 || accepted < 40 {
		t.Fatalf("corpus too thin: %d checks, %d accepted", total, accepted)
	}
}

func TestMalformedLegacyHashIsAMismatch(t *testing.T) {
	if VerifyPassword("x", "$2b$04$short") {
		t.Fatal("malformed bcrypt hash accepted")
	}
}
