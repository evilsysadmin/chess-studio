// Package resetmail mirrors backend-python/email_service.py: the one
// transactional mail Chess Studio sends, the password-reset link, through
// Resend's HTTP API. Without RESEND_API_KEY, development and staging log
// the link instead; production fails closed.
package resetmail

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	resendURL   = "https://api.resend.com/emails"
	defaultFrom = "Chess Studio <onboarding@resend.dev>"
)

type Sender struct {
	apiKey     string
	from       string
	production bool
	endpoint   string
	client     *http.Client
	logf       func(format string, args ...any)
}

// New reads RESEND_API_KEY, PASSWORD_RESET_FROM and ENVIRONMENT values.
func New(apiKey, from, environment string) *Sender {
	from = strings.TrimSpace(from)
	if from == "" {
		from = defaultFrom
	}
	env := strings.ToLower(strings.TrimSpace(environment))
	if env == "" {
		env = "development"
	}
	return &Sender{
		apiKey: strings.TrimSpace(apiKey), from: from, production: env == "production" || env == "prod",
		endpoint: resendURL, client: &http.Client{Timeout: 8 * time.Second}, logf: log.Printf,
	}
}

// Send mirrors send_password_reset_email: true when the provider accepted
// the mail (or, outside production without a key, when the link was logged).
func (s *Sender) Send(ctx context.Context, email, resetURL string) bool {
	if s.apiKey == "" {
		if !s.production {
			s.logf("PASSWORD RESET DEV LINK: %s", resetURL)
			return true
		}
		s.logf("Recuperación solicitada pero RESEND_API_KEY no está configurada.")
		return false
	}
	payload, _ := json.Marshal(map[string]any{
		"from":    s.from,
		"to":      []string{email},
		"subject": "Recupera tu contraseña · Chess Studio",
		"html": "<div style='font-family:system-ui,sans-serif;line-height:1.55'>" +
			"<h2>Chess Studio</h2>" +
			"<p>Se ha solicitado restablecer la contraseña de tu cuenta.</p>" +
			"<p><a href='" + resetURL + "'>Restablecer contraseña</a></p>" +
			"<p>El enlace caduca en 30 minutos. Si no lo pediste, ignora este mensaje.</p>" +
			"</div>",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Chess-Studio/1.0")
	resp, err := s.client.Do(req)
	if err != nil {
		s.logf("No se pudo enviar el correo de recuperación: %v", err)
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}
