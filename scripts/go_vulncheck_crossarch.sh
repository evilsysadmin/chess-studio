#!/usr/bin/env bash
# Analyze the deployed Linux architectures, not only the CI runner build tags.
set -euo pipefail
# Check go.mod/go.sum against source + test imports, including alternate tags.
# Go's -diff fails on drift without modifying the checked-out module files.
go mod tidy -diff
go install golang.org/x/vuln/cmd/govulncheck@v1.9.0
scanner="$(go env GOPATH)/bin/govulncheck"
"$scanner" ./...
GOOS=linux GOARCH=arm64 "$scanner" ./...
