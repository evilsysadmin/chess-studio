// Package release is release_info.py: the packaged Chess Studio release and
// the stable deployment identity Admin's deployment annotations key on.
package release

import (
	"regexp"
	"strings"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// AppRelease mirrors APP_RELEASE (frontend/src/release.js and
// backend-python/release_info.py; TestAppReleaseMatchesTheRepository and
// scripts/release_consistency_check.mjs keep the three in step).
const AppRelease = "v16.6dm46zfrv"

var commitEnvKeys = []string{"RENDER_GIT_COMMIT", "GITHUB_SHA", "GIT_COMMIT_SHA", "COMMIT_SHA"}

var unsafeIdentity = regexp.MustCompile(`[^A-Za-z0-9._:-]+`)

// safeIdentityComponent is _safe_identity_component.
func safeIdentityComponent(value string) string {
	normalized := strings.Trim(unsafeIdentity.ReplaceAllString(pyval.Strip(value), "-"), "-")
	return pyval.Prefix(normalized, 80)
}

// BuildCommit is build_commit ("" when no provider commit is set).
func BuildCommit(getenv func(string) string) string {
	for _, key := range commitEnvKeys {
		if component := safeIdentityComponent(getenv(key)); component != "" {
			return component
		}
	}
	return ""
}

// DeploymentIdentity is deployment_identity.
func DeploymentIdentity(getenv func(string) string) string {
	if commit := BuildCommit(getenv); commit != "" {
		return "git:" + commit
	}
	return "release:" + AppRelease
}
