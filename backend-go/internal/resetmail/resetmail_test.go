package resetmail

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendPostsTheResendMessage(t *testing.T) {
	var got map[string]any
	var auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	s := New(" re_key ", "", "production")
	s.endpoint = server.URL
	if !s.Send(context.Background(), "a@x.io", "https://app/?resetToken=t") {
		t.Fatal("accepted mail reported as failed")
	}
	if auth != "Bearer re_key" || got["from"] != "Chess Studio <onboarding@resend.dev>" || got["subject"] != "Recupera tu contraseña · Chess Studio" {
		t.Fatalf("request %s %v", auth, got)
	}
	if to := got["to"].([]any); len(to) != 1 || to[0] != "a@x.io" || !strings.Contains(got["html"].(string), "href='https://app/?resetToken=t'") {
		t.Fatalf("message %v", got)
	}
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnprocessableEntity) }))
	defer failing.Close()
	s.endpoint = failing.URL
	if s.Send(context.Background(), "a@x.io", "u") {
		t.Fatal("rejected mail reported as sent")
	}
}

func TestWithoutAKeyOnlyNonProductionLogsTheLink(t *testing.T) {
	var logs []string
	dev := New("", "", "staging")
	dev.logf = func(f string, a ...any) { logs = append(logs, fmt.Sprintf(f, a...)) }
	if !dev.Send(context.Background(), "a@x.io", "LINK") || logs[0] != "PASSWORD RESET DEV LINK: LINK" {
		t.Fatalf("dev %v", logs)
	}
	prod := New("", "", "prod")
	prod.logf = func(string, ...any) {}
	if prod.Send(context.Background(), "a@x.io", "LINK") {
		t.Fatal("production without a key must fail closed")
	}
}
