#!/usr/bin/env bash
# Analyze the deployed Linux architectures, not only the CI runner build tags.
set -euo pipefail
go install golang.org/x/vuln/cmd/govulncheck@v1.9.0
scanner="$(go env GOPATH)/bin/govulncheck"
"$scanner" ./...
GOOS=linux GOARCH=arm64 "$scanner" ./...
