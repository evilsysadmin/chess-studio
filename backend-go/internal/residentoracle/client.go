package residentoracle

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var uciPattern = regexp.MustCompile(`^[a-h][1-8][a-h][1-8][qrbn]?$`)

const oracleLabel = "chess-studio:pvp-resident-oracle:v1"

type Config struct {
	UpstreamURL string
	JWTSecret   string
	Client      *http.Client
	Now         func() time.Time
}

type Client struct {
	endpoint *url.URL
	secret   string
	client   *http.Client
	now      func() time.Time
}

func New(cfg Config) (*Client, error) {
	raw := strings.TrimSpace(cfg.UpstreamURL)
	if raw == "" {
		return nil, errors.New("resident oracle upstream URL is required")
	}
	base, err := url.Parse(raw)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return nil, errors.New("invalid resident oracle upstream URL")
	}
	if base.Scheme != "http" && base.Scheme != "https" {
		return nil, errors.New("resident oracle upstream must use http or https")
	}
	if base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("resident oracle upstream must not contain query or fragment")
	}
	if base.Path != "" && base.Path != "/" {
		return nil, errors.New("resident oracle upstream must not contain a path")
	}

	secret := strings.TrimSpace(cfg.JWTSecret)
	if secret == "" {
		return nil, errors.New("resident oracle JWT secret is required")
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 4 * time.Second}
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}

	endpoint := *base
	endpoint.Path = "/api/pvp/_internal/resident-move"
	return &Client{endpoint: &endpoint, secret: secret, client: client, now: now}, nil
}

func (c *Client) Move(ctx context.Context, fen, resident string) (string, error) {
	payload := struct {
		FEN      string `json:"fen"`
		Resident string `json:"resident"`
	}{
		FEN: strings.TrimSpace(fen),
		Resident: strings.TrimSpace(resident),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	timestamp := strconv.FormatInt(c.now().UTC().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Chess-Timestamp", timestamp)
	req.Header.Set("X-Chess-Signature", signature(c.secret, timestamp, body))

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("resident oracle request: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return "", fmt.Errorf("resident oracle response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("resident oracle status %d", resp.StatusCode)
	}

	var decoded struct {
		UCI string `json:"uci"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", fmt.Errorf("resident oracle invalid JSON: %w", err)
	}
	uci := strings.ToLower(strings.TrimSpace(decoded.UCI))
	if !uciPattern.MatchString(uci) {
		return "", errors.New("resident oracle returned invalid UCI")
	}
	return uci, nil
}

func signature(secret, timestamp string, body []byte) string {
	labelMAC := hmac.New(sha256.New, []byte(secret))
	_, _ = labelMAC.Write([]byte(oracleLabel))
	subkey := labelMAC.Sum(nil)

	mac := hmac.New(sha256.New, subkey)
	_, _ = mac.Write([]byte(timestamp))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
