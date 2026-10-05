package release

import (
	"os"
	"regexp"
	"testing"
)

func TestAppReleaseMatchesTheRepository(t *testing.T) {
	pattern := regexp.MustCompile(`APP_RELEASE\s*=\s*['"]([^'"]+)['"]`)
	for _, path := range []string{"../../../frontend/src/release.js", "../../../backend-python/release_info.py"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		m := pattern.FindSubmatch(data)
		if m == nil || string(m[1]) != AppRelease {
			t.Fatalf("%s has APP_RELEASE %q, Go has %q: bump backend-go/internal/release too", path, m, AppRelease)
		}
	}
}

func TestDeploymentIdentityMatchesPython(t *testing.T) {
	// Expectations from release_info.deployment_identity.
	cases := []struct {
		env  map[string]string
		want string
	}{
		{map[string]string{}, "release:" + AppRelease},
		{map[string]string{"GIT_COMMIT_SHA": "0123abcd"}, "git:0123abcd"},
		{map[string]string{"GIT_COMMIT_SHA": "  --  ", "COMMIT_SHA": "c1"}, "git:c1"},
		{map[string]string{"RENDER_GIT_COMMIT": "a b/c", "GIT_COMMIT_SHA": "x"}, "git:a-b-c"},
		{map[string]string{"GITHUB_SHA": "-ñandú_1.0:ok-"}, "git:and-_1.0:ok"},
		{map[string]string{"GIT_COMMIT_SHA": "x\u3000y"}, "git:x-y"},
	}
	long := ""
	for i := 0; i < 90; i++ {
		long += "z"
	}
	cases = append(cases, struct {
		env  map[string]string
		want string
	}{map[string]string{"GIT_COMMIT_SHA": long}, "git:" + long[:80]})
	for _, c := range cases {
		if got := DeploymentIdentity(func(k string) string { return c.env[k] }); got != c.want {
			t.Errorf("%v: got %q want %q", c.env, got, c.want)
		}
	}
}
