#!/usr/bin/env bash
set -euo pipefail

# GO-2026-6809 / CVE-2026-111943: Go stdlib fixes are embedded at build time.
# The runner must use the patched local compiler, never a download/switch.
export GOTOOLCHAIN=local
selected_go="$(go env GOVERSION)"
[[ "$selected_go" == 'go1.27.3' ]] || {
  echo "::error::Unexpected Go compiler: $selected_go"
  exit 1
}

CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /tmp/pvp-edge ./cmd/pvp-edge
actual="$(go version /tmp/pvp-edge)"
[[ "$actual" == "/tmp/pvp-edge: $selected_go" ]] || {
  echo "::error::Incorrect Go compiler embedded in ARM64 binary: $actual"
  exit 1
}
metadata="$(go version -m /tmp/pvp-edge)"
grep -Fqx $'\tbuild\tGOOS=linux' <<< "$metadata" || {
  echo "::error::ARM64 binary has incorrect GOOS"
  exit 1
}
grep -Fqx $'\tbuild\tGOARCH=arm64' <<< "$metadata" || {
  echo "::error::Binary was not built for linux/arm64"
  exit 1
}
