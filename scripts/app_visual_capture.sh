#!/usr/bin/env bash
set -euo pipefail

cd e2e

./node_modules/.bin/playwright test \
  {app,experiments,chronicles-avatar,war-room,war-room-decor,war-room-armor-oblique,war-room-hans}-visual-artifact.spec.js \
  home-3d-focus-visual.spec.js \
  browser-{runtime,storage}-health.spec.js \
  --workers=1 --retries=0

./node_modules/.bin/playwright test \
  war-room-hans-routines-visual.spec.js \
  --workers=4 --retries=0
