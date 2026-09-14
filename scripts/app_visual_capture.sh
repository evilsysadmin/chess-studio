#!/usr/bin/env bash
set -euo pipefail

mode="${1:-canonical}"
cd e2e

case "$mode" in
  canonical)
    ./node_modules/.bin/playwright test \
      {app,experiments,chronicles-avatar,war-room,war-room-decor,war-room-armor-oblique,war-room-hans}-visual-artifact.spec.js \
      home-3d-focus-visual.spec.js \
      browser-{runtime,storage}-health.spec.js \
      --workers=1 --retries=0
    ;;
  hans)
    if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
      export HANS_ROUTINE_EVENTS="fire,mop,espresso,dust-board"
    fi
    ./node_modules/.bin/playwright test \
      war-room-hans-routines-visual.spec.js \
      --workers=1 --retries=0
    ;;
  *)
    echo "Unknown app visual capture mode: $mode" >&2
    exit 2
    ;;
esac
