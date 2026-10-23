#!/usr/bin/env bash
set -euo pipefail

mode="${1:-canonical}"
groups="${2:-all}"
experiments_scope="${3:-all}"
producer_scope="${4:-all}"

# Dedicated visual producers already create the canonical screenshots/artifacts
# that matter. Tell Playwright not to continuously record trace/video on these
# software-rendered WebGL runs; required functional E2E keeps diagnostics.
export APP_VISUAL_ARTIFACT=1

cd e2e

has_group() {
  local needle="$1"
  [[ ",$groups," == *",all,"* || ",$groups," == *",$needle,"* ]]
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

    # Canonical Matthias source edits only need focused Home evidence.
    # The retired portrait sidecar is a classifier compatibility alias.
    if [[ "$producer_scope" == "home-matthias,chronicles-avatar" ||
          "$producer_scope" == "home-matthias" ]]; then
      export HOME_MATTHIAS_CAPTURE_SCOPE="canonical-model"
      echo "Matthias canonical fast path: seated and mobile Home."
    fi

    specs=()
    warroom_core_selected=false
    # Runtime/storage health should run in a fresh browser process before the
    # heavyweight SwiftShader captures. This makes the gate fail fast and avoids
    # measuring renderer exhaustion from earlier visual producers.
    if has_group health; then
      has_producer health-runtime && specs+=(browser-runtime-health.spec.js)
      has_producer health-storage && specs+=(browser-storage-health.spec.js)
    fi
    if has_group home; then
      has_producer home-base && specs+=(app-visual-artifact.spec.js)
      has_producer pvp-lobby && specs+=(pvp-lobby-visual-artifact.spec.js)
      has_producer pvp-handoff && specs+=(pvp-handoff-visual-artifact.spec.js)
      has_producer home-matthias && specs+=(matthias-home-visual-artifact.spec.js)
      has_producer home-focus && specs+=(home-3d-focus-visual.spec.js)
    fi
    if has_group experiments && has_producer experiments-hub; then
      # Game-specific Chronicles producers were extracted with their specs.
      if [[ "$experiments_scope" == "pawnslug" ]]; then
        specs+=(pawn-slug-godot-visual-artifact.spec.js)
      elif [[ "$experiments_scope" != "chronicles" && "$experiments_scope" != "none" ]]; then
        specs+=(experiments-visual-artifact.spec.js)
      fi
    fi
    training_scopes=()
    if has_group training; then
      has_producer training-school && training_scopes+=(school)
      has_producer training-openings && training_scopes+=(openings)
      has_producer training-puzzles && training_scopes+=(puzzles)
      has_producer training-tournament && training_scopes+=(tournament)
      has_producer training-progress && training_scopes+=(progress)
      has_producer training-daily && training_scopes+=(daily)
      if (( ${#training_scopes[@]} > 0 )); then
        specs+=(training-visual-artifact.spec.js)
        export APP_VISUAL_TRAINING_SCOPE="$(IFS=,; echo "${training_scopes[*]}")"
      fi
    fi
    if has_group warroom; then
      has_producer pvp-duel && specs+=(war-room-pvp-duel-visual-artifact.spec.js)
      has_producer combat-battle && specs+=(war-room-combat-battle-visual-artifact.spec.js)
      if has_producer combat-prep; then
        specs+=(war-room-combat-preparation-visual-artifact.spec.js combat-briefing-room-visual-artifact.spec.js)
      fi
      has_producer warroom-core && warroom_core_selected=true
      has_producer warroom-decor && specs+=(war-room-decor-visual-artifact.spec.js)
      has_producer warroom-armor && specs+=(war-room-armor-oblique-visual-artifact.spec.js)
      has_producer warroom-hans && specs+=(war-room-hans-visual-artifact.spec.js)
    fi
    if (( ${#specs[@]} == 0 )) && [[ "$warroom_core_selected" != "true" ]]; then
      echo "App visual capture: groups '$groups' + producers '$producer_scope' resolved to no canonical specs."
      # A retired or out-of-scope visual producer is a deliberate no-op.
      if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "has_specs=false" >> "$GITHUB_OUTPUT"; fi
      exit 0
    fi
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "has_specs=true" >> "$GITHUB_OUTPUT"; fi

    playwright_experiments_scope="$experiments_scope"
    if [[ "$experiments_scope" == "all" ]]; then
      # The old all-scope already captured only landing and Pawn Slug.
      playwright_experiments_scope="landing,pawnslug"
    elif [[ ",$experiments_scope," == *",chronicles,"* ]]; then
      # Do not ask the retained Lab hub to render an extracted game.
      filtered_scopes=()
      IFS=',' read -ra requested_scopes <<< "$experiments_scope"
      for scope in "${requested_scopes[@]}"; do
        [[ "$scope" == "chronicles" ]] || filtered_scopes+=("$scope")
      done
      playwright_experiments_scope="$(IFS=,; echo "${filtered_scopes[*]}")"
    fi

    export APP_VISUAL_EXPERIMENTS_SCOPE="$playwright_experiments_scope"
    echo "App visual capture groups: $groups"
    echo "App visual producers: $producer_scope"
    if has_group training && [[ -n "${APP_VISUAL_TRAINING_SCOPE:-}" ]]; then
      echo "Training visual subscopes: $APP_VISUAL_TRAINING_SCOPE"
    fi
    if has_group experiments; then
      echo "Experiments hub effective subscopes: $playwright_experiments_scope"
    fi
    if (( ${#specs[@]} > 0 )); then
      printf ' - %s\n' "${specs[@]}"
    fi
    if [[ "$warroom_core_selected" == "true" ]]; then
      echo " - war-room-visual-artifact.spec.js (serial canary + shared desktop session + 2-worker mobile remainder)"
    fi

    playwright_args=(--workers=1 --retries=0)
    if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
      playwright_args+=(--max-failures=1)
    fi
    if has_group warroom && has_producer warroom-core && has_producer warroom-decor; then
      # Core already proves the canonical 844x390 Android landscape surface.
      # Keep decor's expensive focused landscape session for decor-only changes,
      # but do not render that same SwiftShader viewport again in broad sweeps.
      playwright_args+=(--grep-invert "War Room decor · scene-first captures android-landscape-844x390")
      echo "War Room visual dedupe: core owns Android landscape; decor keeps desktop inspection only."
    fi

    warroom_core_args=(--retries=0)
    if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
      warroom_core_args+=(--max-failures=1)
    fi

    if [[ "$warroom_core_selected" == "true" ]]; then
      echo "War Room core canary: one cheap default-first profile, serial and fail-closed."
      APP_VISUAL_WARROOM_PROFILE_SHARD=canary \
        ./node_modules/.bin/playwright test \
        war-room-visual-artifact.spec.js \
        --workers=1 \
        "${warroom_core_args[@]}"
    fi

    if (( ${#specs[@]} > 0 )); then
      ./node_modules/.bin/playwright test \
        "${specs[@]}" \
        "${playwright_args[@]}"
    fi

    if [[ "$warroom_core_selected" == "true" ]]; then
      echo "War Room core desktop evidence: reuse one authenticated 1440x900 game across active variants."
      APP_VISUAL_WARROOM_PROFILE_SHARD=desktop-remainder \
        ./node_modules/.bin/playwright test \
        war-room-visual-artifact.spec.js \
        --workers=1 \
        "${warroom_core_args[@]}"

      echo "War Room core mobile evidence: remaining touch profiles with two workers after desktop proof."
      APP_VISUAL_WARROOM_PROFILE_SHARD=mobile-remainder \
        ./node_modules/.bin/playwright test \
        war-room-visual-artifact.spec.js \
        --workers=2 \
        "${warroom_core_args[@]}"

      echo "War Room variant lifecycle soak: rotate v1/v2/v3/v4 twice after warm-up."
      ./node_modules/.bin/playwright test \
        war-room-variant-lifecycle-soak.spec.js \
        --workers=1 \
        --retries=0

      echo "War Room entry latency baseline: v3/v4 cold and warm through first accepted move."
      ./node_modules/.bin/playwright test \
        war-room-entry-latency-visual.spec.js \
        --workers=1 \
        --retries=0

      if [[ -n "${APP_VISUAL_EXPECTED_WAR_ROOM_REVISION:-}" ]]; then
        echo "War Room V2 Hans: prove actual door swing and passage with exact PR GLB."
        ./node_modules/.bin/playwright test \
          war-room-v2-hans-door-visual.spec.js \
          --workers=1 \
          --retries=0
      fi
    fi
    ;;
  hans)
    # Each Hans routine owns a full SwiftShader War Room scene + video recorder.
    # Two concurrent workers contend hard enough to hit the per-test 180 s
    # ceiling on CI, so keep this secondary visual lane serial and deterministic.
    hans_playwright_args=(--workers=1 --retries=0)
    if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
      # `fire` already has its own canonical visual canary above. Keep this
      # parallel lane focused on the ambient scheduler. Run the currently
      # failing dust-board first so its physical setup diagnostic is captured
      # without wasting an entire mop video on each red iteration. On success
      # all three videos remain mandatory; espresso stays last.
      export HANS_ROUTINE_EVENTS="dust-board,mop,espresso"
      hans_playwright_args+=(--max-failures=1)
    fi
    ./node_modules/.bin/playwright test \
      war-room-hans-routines-visual.spec.js \
      "${hans_playwright_args[@]}"
    node ../scripts/hans_visual_artifact_summary.mjs \
      ../.artifacts/app-visual/hans-routines
    ;;
  *)
    echo "Unknown app visual capture mode: $mode" >&2
    exit 2
    ;;
esac
