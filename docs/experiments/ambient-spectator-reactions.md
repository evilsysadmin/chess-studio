# Ambient spectator reactions

## Goal
Add sparse anonymous audience reactions to genuinely noteworthy chess moments without creating another chatty personality system.

## First slice
- Reuse real noteworthy-event detection already available to Matthias/autopsy.
- For each event choose one of: CPU only, spectators only, both, silence.
- Keep reactions short, anonymous and ambient.
- Allow optional subtle room-audio/murmur accompaniment.

## Eligible moments
Imminent mate, catastrophic blunder, brilliant tactic, major evaluation swing, dramatic promotion or decisive sacrifice.

## Guardrails
- Silence is common.
- No reaction to routine captures/checks.
- Never contradict the measured game event.
- CPU and spectators should not predictably duplicate each other.
- Respect zen/reduced-motion/audio preferences.

## Acceptance
- Rate limiting and deduplication tests.
- Deterministic event -> eligible reaction tests.
- No spectator layer in contexts where commentary is disabled.
- Mobile layout never reserves permanent chat space for spectators.