#!/usr/bin/env bash
set -euo pipefail

mode="${1:-canonical}"
groups="${2:-all}"
experiments_scope="${3:-all}"
chronicles_avatar="${4:-true}"
cd e2e

has_group() {
  local needle="$1"
  [[ ",$groups," == *",all,"* || ",$groups," == *",$needle,"* ]]
}

has_experiment_scope() {
  local needle="$1"
  [[ ",$experiments_scope," == *",all,"* || ",$experiments_scope," == *",$needle,"* ]]
}

case "$mode" in
  canonical)
    if [[ "$groups" == "none" ]]; then
      echo "App visual capture: no canonical surface selected."
      exit 0
    fi

    specs=()
    if has_group home; then
      specs+=(
        app-visual-artifact.spec.js
        matthias-home-visual-artifact.spec.js
        home-3d-focus-visual.spec.js
      )
    fi
    if has_group experiments; then
      # Chronicles owns two heavy WebGL surfaces. Always run their focused
      # producers when Chronicles is in scope, even in a mixed/full visual run.
      # Put Tactics first so the action-RPG framing artifact survives even if a
      # later legacy/full-suite canary times out under hosted SwiftShader.
      if has_experiment_scope chronicles; then
        specs+=(
          chronicles-tactics-visual-artifact.spec.js
          chronicles-gameplay-visual-artifact.spec.js
        )
      fi

      # The generic Experiments producer owns the hub/Arcade surfaces. It is not
      # the canonical Chronicles gameplay proof anymore, so skip it for a pure
      # Chronicles change and keep it for landing/Pawn Slug/full mixed scopes.
      if [[ "$experiments_scope" != "chronicles" ]]; then
        specs+=(experiments-visual-artifact.spec.js)
      fi

      if has_experiment_scope chronicles && [[ "$chronicles_avatar" == "true" ]]; then
        specs+=(chronicles-avatar-visual-artifact.spec.js)
      fi
    fi
    if has_group training; then
      specs+=(training-visual-artifact.spec.js)
    fi
    if has_group warroom; then
      specs+=(
        war-room-visual-artifact.spec.js
        war-room-decor-visual-artifact.spec.js
        war-room-armor-oblique-visual-artifact.spec.js
        war-room-hans-visual-artifact.spec.js
        war-room-cat-render-contract.spec.js
      )
    fi
    if has_group health; then
      specs+=(
        browser-runtime-health.spec.js
        browser-storage-health.spec.js
      )
    fi

    if (( ${#specs[@]} == 0 )); then
      echo "App visual capture: scope '$groups' resolved to no canonical specs."
      exit 0
    fi

    export APP_VISUAL_EXPERIMENTS_SCOPE="$experiments_scope"
    echo "App visual capture groups: $groups"
    if has_group experiments; then
      echo "Experiments visual subscopes: $experiments_scope"
      echo "Chronicles avatar proof: $chronicles_avatar"
    fi
    printf ' - %s\n' "${specs[@]}"
    ./node_modules/.bin/playwright test \
      "${specs[@]}" \
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
