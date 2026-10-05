package authcrypto

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
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

// The corpus' default-cost Argon2id hashes were made by argon2-cffi with
// auth._ARGON2's parameters and fixed salts: same salt, same string.
func TestHashPasswordEncodesLikeArgon2CFFI(t *testing.T) {
	raw, _ := os.ReadFile("testdata/python_password_corpus.json")
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
	matched := 0
	for _, row := range corpus.Rows {
		if !strings.HasPrefix(row.Hash, "$argon2id$v=19$m=19456,t=2,p=1$") || len(row.Checks) < 2 {
			continue
		}
		parts := strings.Split(row.Hash, "$")
		salt, err := base64.RawStdEncoding.DecodeString(parts[4])
		if err != nil {
			t.Fatal(err)
		}
		password := row.Checks[0].Candidate // the hashed password is the first candidate
		if got := hashWithSalt(password, salt); got != row.Hash {
			t.Fatalf("hash(%q)\n got %s\nwant %s", password, got, row.Hash)
		}
		matched++
	}
	if matched < 5 {
		t.Fatalf("only %d argon2id hashes compared", matched)
	}
	fresh, err := HashPassword("correct horse")
	if err != nil || !VerifyPassword("correct horse", fresh) || VerifyPassword("wrong", fresh) {
		t.Fatalf("fresh hash %s %v", fresh, err)
	}
}
