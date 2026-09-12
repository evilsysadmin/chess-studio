# Match Director

## Goal
Coordinate existing narrative systems—music, Matthias, spectators, camera and ambient events—from real match context without changing chess rules.

## First slice
- Introduce a pure context snapshot: mode, series state, rivalry facts, recent notable incidents, current turn state and user preferences.
- Produce sparse direction cues such as silence, music intensity band, eligible commentator, camera emphasis and ambient-event permission.
- Individual systems retain ownership of rendering/playback; the Director only decides eligibility/priority.

## Guardrails
- Never alter legal moves, engine strength or game outcome.
- Never invent rivalry history.
- Zen/reduced-motion/mute preferences override direction.
- No LLM/network dependency in the hot path.
- Deterministic under injected inputs.

## Acceptance
- Pure unit tests for priority/conflict resolution.
- At most one dominant cue per channel at a time.
- No duplicated Matthias/spectator event for the same incident unless explicitly allowed.
- Existing default chess path behaves identically when the Director emits silence.