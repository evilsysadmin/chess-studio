package edge

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatusPayloadPublishesCanonicalAndLegacyServiceNames(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["service"] != "chess-studio-pvp-go" {
		t.Fatalf("legacy service=%#v", body["service"])
	}
	if body["runtimeService"] != "chess-studio-backend-go" {
		t.Fatalf("runtime service=%#v", body["runtimeService"])
	}
}
