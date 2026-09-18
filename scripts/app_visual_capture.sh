#!/usr/bin/env bash
set -euo pipefail

mode="${1:-canonical}"
groups="${2:-all}"
experiments_scope="${3:-all}"
chronicles_avatar="${4:-true}"
producer_scope="${5:-all}"

# Dedicated visual producers already create the canonical screenshots/artifacts
# that matter. Tell Playwright not to continuously record trace/video on these
# software-rendered WebGL runs; required functional E2E keeps diagnostics.
export APP_VISUAL_ARTIFACT=1

cd e2e

has_group() {
  local needle="$1"
  [[ ",$groups," == *",all,"* || ",$groups," == *",$needle,"* ]]
}

has_experiment_scope() {
  local needle="$1"
  [[ ",$experiments_scope," == *",all,"* || ",$experiments_scope," == *",$needle,"* ]]
}

has_producer() {
  local needle="$1"
  [[ ",$producer_scope," == *",all,"* || ",$producer_scope," == *",$needle,"* ]]
}

case "$mode" in
  canonical)
    if [[ "$groups" == "none" || "$producer_scope" == "none" ]]; then
      echo "App visual capture: no canonical producer selected."
      exit 0
    fi

    specs=()
    if has_group home; then
      has_producer home-base && specs+=(app-visual-artifact.spec.js)
      has_producer home-matthias && specs+=(matthias-home-visual-artifact.spec.js)
      has_producer home-focus && specs+=(home-3d-focus-visual.spec.js)
    fi
    if has_group experiments; then
      if has_experiment_scope chronicles; then
        has_producer chronicles-tactics && specs+=(chronicles-tactics-visual-artifact.spec.js)
        has_producer chronicles-gameplay && specs+=(chronicles-gameplay-visual-artifact.spec.js)
      fi

      if [[ "$experiments_scope" == "pawnslug" ]] && has_producer experiments-hub; then
        specs+=(pawn-slug-godot-visual-artifact.spec.js)
      elif [[ "$experiments_scope" != "chronicles" ]] && has_producer experiments-hub; then
        specs+=(experiments-visual-artifact.spec.js)
      fi

      if has_experiment_scope chronicles && [[ "$chronicles_avatar" == "true" ]] && has_producer chronicles-avatar; then
        specs+=(chronicles-avatar-visual-artifact.spec.js)
      fi
    fi
    if has_group training && has_producer training; then
      specs+=(training-visual-artifact.spec.js)
    fi
    if has_group warroom; then
      has_producer warroom-core && specs+=(war-room-visual-artifact.spec.js)
      has_producer warroom-decor && specs+=(war-room-decor-visual-artifact.spec.js)
      has_producer warroom-armor && specs+=(war-room-armor-oblique-visual-artifact.spec.js)
      has_producer warroom-hans && specs+=(war-room-hans-visual-artifact.spec.js)
    fi
    if has_group health; then
      has_producer health-runtime && specs+=(browser-runtime-health.spec.js)
      has_producer health-storage && specs+=(browser-storage-health.spec.js)
    fi

    if (( ${#specs[@]} == 0 )); then
      echo "App visual capture: groups '$groups' + producers '$producer_scope' resolved to no canonical specs."
      exit 0
    fi

    playwright_experiments_scope="$experiments_scope"
    if [[ "$experiments_scope" != "chronicles" ]] && has_group experiments && has_producer experiments-hub && has_producer chronicles-gameplay && has_experiment_scope chronicles; then
      # The dedicated Chronicles gameplay producer owns the canonical dungeon/
      # portrait proof. Do not ask the legacy Experiments hub producer to render
      # the same software-WebGL session again during broad/full visual sweeps.
      if [[ ",$experiments_scope," == *",all,"* ]]; then
        playwright_experiments_scope="landing,pawnslug"
      else
        filtered_scopes=()
        IFS=',' read -ra requested_scopes <<< "$experiments_scope"
        for scope in "${requested_scopes[@]}"; do
          [[ "$scope" == "chronicles" ]] || filtered_scopes+=("$scope")
        done
        playwright_experiments_scope="$(IFS=,; echo "${filtered_scopes[*]}")"
      fi
    fi

    export APP_VISUAL_EXPERIMENTS_SCOPE="$playwright_experiments_scope"
    echo "App visual capture groups: $groups"
    echo "App visual producers: $producer_scope"
    if has_group experiments; then
      echo "Experiments visual subscopes: $experiments_scope"
      if [[ "$playwright_experiments_scope" != "$experiments_scope" ]]; then
        echo "Experiments hub effective subscopes: $playwright_experiments_scope (Chronicles owned by dedicated producer)"
      fi
      echo "Chronicles avatar proof: $chronicles_avatar"
    fi
    printf ' - %s\n' "${specs[@]}"

    playwright_args=(--workers=1 --retries=0)
    if has_group warroom && has_producer warroom-core && has_producer warroom-decor; then
      # Core already proves the canonical 844x390 Android landscape surface.
      # Keep decor's expensive focused landscape session for decor-only changes,
      # but do not render that same SwiftShader viewport again in broad sweeps.
      playwright_args+=(--grep-invert "War Room decor · scene-first captures android-landscape-844x390")
      echo "War Room visual dedupe: core owns Android landscape; decor keeps desktop inspection only."
    fi

    ./node_modules/.bin/playwright test \
      "${specs[@]}" \
      "${playwright_args[@]}"
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
