#!/usr/bin/env bash
set -euo pipefail

# GO-2026-6809 / CVE-2026-111943: Go stdlib fixes are embedded at build time.
# The runner must use the patched local compiler, never a download/switch.
# Require the patched security floor, not one frozen patch number.
# Docker and setup-go are still required to pin the same exact release.
go_at_least_patched() {
  local version="$1" major minor patch
  [[ "$version" =~ ^go([1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || return 1
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[3]}"
  (( major > 1 || (major == 1 && (minor > 27 || (minor == 27 && patch >= 3))) ))
}

if [[ "${1:-}" == '--self-test' ]]; then
  for good in go1.27.3 go1.27.4 go1.27.10 go1.28.0; do
    go_at_least_patched "$good" || { echo "Rejected patched Go: $good" >&2; exit 1; }
  done
  for bad in go1.27.2 go1.26.10 go1.26.999 go1.27.3rc1 go1.27.03 go1.027.3; do
    if go_at_least_patched "$bad"; then
      echo "Accepted unsafe or malformed Go: $bad" >&2
      exit 1
    fi
  done
  echo 'Go binary compiler security floor self-test: OK'
  exit 0
fi
[[ "$#" -eq 0 ]] || { echo 'Unexpected arguments' >&2; exit 2; }

export GOTOOLCHAIN=local
selected_go="$(go env GOVERSION)"
go_at_least_patched "$selected_go" || {
  echo "::error::Unpatched or malformed Go compiler: $selected_go"
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
