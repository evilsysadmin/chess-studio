package obshistory

import (
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func TestAnnotationRowMirrorsPython(t *testing.T) {
	// Expectations from list_deployment_annotations' row (pymongo's naive
	// datetimes, str(x or default)[:limit]).
	at := time.Date(2026, 10, 5, 11, 0, 0, 123_000_000, time.UTC)
	cases := []struct {
		raw  bson.D
		want string
	}{
		{bson.D{{Key: "deployment_id", Value: "git:abc"}, {Key: "release", Value: "v16"}, {Key: "provider", Value: "oracle"}, {Key: "deployed_at", Value: bson.NewDateTimeFromTime(at)}},
			`{"release":"v16","provider":"oracle","deploymentId":"git:abc","at":"2026-10-05T11:00:00.123000"}`},
		{bson.D{{Key: "release", Value: ""}, {Key: "provider", Value: int32(0)}, {Key: "deployed_at", Value: bson.NewDateTimeFromTime(at.Truncate(time.Second))}},
			`{"release":"unknown","provider":"unknown","deploymentId":"","at":"2026-10-05T11:00:00"}`},
		{bson.D{{Key: "release", Value: strings.Repeat("v1", 30)}, {Key: "provider", Value: int32(7)}, {Key: "deployed_at", Value: "x"}},
			`{"release":"v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1v1","provider":"7","deploymentId":"","at":"x"}`},
		{bson.D{{Key: "deployed_at", Value: int32(5)}}, `{"release":"unknown","provider":"unknown","deploymentId":"","at":"5"}`},
		{bson.D{}, `{"release":"unknown","provider":"unknown","deploymentId":"","at":""}`},
	}
	for _, c := range cases {
		got, err := pydoc.Encode(AnnotationRow(c.raw))
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != c.want {
			t.Errorf("got  %s\nwant %s", got, c.want)
		}
	}
}

func TestProviderMirrorsPython(t *testing.T) {
	for env, want := range map[string]string{"": "unknown", "RENDER": "render", "RENDER_SERVICE_ID": "render", "OCI_RESOURCE_PRINCIPAL_VERSION": "oracle"} {
		if got := Provider(func(k string) string {
			if k == env {
				return "1"
			}
			return ""
		}); got != want {
			t.Errorf("%s: %s want %s", env, got, want)
		}
	}
}
