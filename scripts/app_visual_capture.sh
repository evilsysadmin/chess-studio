#!/usr/bin/env bash
set -euo pipefail

mode="${1:-canonical}"
cd e2e

case "$mode" in
  canonical)
    ./node_modules/.bin/playwright test \
      {app,experiments,chronicles-avatar,training,war-room,war-room-decor,war-room-armor-oblique,war-room-hans}-visual-artifact.spec.js \
      matthias-home-visual-artifact.spec.js \
      home-3d-focus-visual.spec.js \
      browser-{runtime,storage}-health.spec.js \
      --workers=1 --retries=0
    ;;
  hans)
    if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
      # `fire` already has its own canonical visual canary above. Keep this
      # parallel lane focused on the ambient scheduler and order espresso last
      # so it runs with less SwiftShader contention after a worker frees up.
      export HANS_ROUTINE_EVENTS="mop,dust-board,espresso"
    fi
    ./node_modules/.bin/playwright test \
      war-room-hans-routines-visual.spec.js \
      --workers=2 --retries=0
    node ../scripts/hans_visual_artifact_summary.mjs \
      ../.artifacts/app-visual/hans-routines
    ;;
  *)
    echo "Unknown app visual capture mode: $mode" >&2
    exit 2
    ;;
esac
