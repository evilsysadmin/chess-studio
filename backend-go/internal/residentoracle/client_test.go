package residentoracle

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClientSignsPythonCompatibleRequestAndReturnsUCI(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 15, 0, 0, time.UTC)
	secret := "01234567890123456789012345678901"
	fen := "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/pvp/_internal/resident-move" {
			t.Fatalf("request=%s %s", r.Method, r.URL.Path)
		}
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var body map[string]string
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Fatal(err)
		}
		if body["fen"] != fen || body["resident"] != "otto_falk" {
			t.Fatalf("body=%#v", body)
		}
		timestamp := r.Header.Get("X-Chess-Timestamp")
		if timestamp != "1790943300" {
			t.Fatalf("timestamp=%q", timestamp)
		}
		want := pythonStyleSignature(secret, timestamp, raw)
		if got := r.Header.Get("X-Chess-Signature"); got != want {
			t.Fatalf("signature=%q want=%q", got, want)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"uci":"e7e5"}`))
	}))
	defer server.Close()

	client, err := New(Config{
		UpstreamURL: server.URL,
		JWTSecret: secret,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.Move(context.Background(), fen, "otto_falk")
	if err != nil {
		t.Fatal(err)
	}
	if got != "e7e5" {
		t.Fatalf("uci=%q", got)
	}
}

func TestClientRejectsNonSuccessAndInvalidUCI(t *testing.T) {
	tests := []struct {
		name string
		status int
		body string
	}{
		{"upstream error", http.StatusUnauthorized, `{"detail":"bad"}`},
		{"invalid uci", http.StatusOK, `{"uci":"drop table"}`},
		{"invalid json", http.StatusOK, `not-json`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client, err := New(Config{UpstreamURL:server.URL,JWTSecret:"01234567890123456789012345678901"})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := client.Move(context.Background(), "fen", "otto_falk"); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestNewRejectsUnsafeConfiguration(t *testing.T) {
	tests := []Config{
		{},
		{UpstreamURL:"ftp://example.test",JWTSecret:"secret"},
		{UpstreamURL:"http://example.test/base",JWTSecret:"secret"},
		{UpstreamURL:"http://example.test?x=1",JWTSecret:"secret"},
		{UpstreamURL:"http://example.test"},
	}
	for _, cfg := range tests {
		if _, err := New(cfg); err == nil {
			t.Fatalf("accepted cfg=%#v", cfg)
		}
	}
}

func TestSignatureVectorIsStable(t *testing.T) {
	body := []byte(`{"fen":"abc","resident":"otto_falk"}`)
	got := signature("test-secret", "1700000000", body)
	want := pythonStyleSignature("test-secret", "1700000000", body)
	if got != want {
		t.Fatalf("got=%q want=%q", got, want)
	}
	if !strings.HasPrefix(got, "sha256=") || len(got) != 71 {
		t.Fatalf("signature shape=%q", got)
	}
}

func pythonStyleSignature(secret, timestamp string, body []byte) string {
	label := hmac.New(sha256.New, []byte(secret))
	_, _ = label.Write([]byte(oracleLabel))
	key := label.Sum(nil)
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(timestamp + "."))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
