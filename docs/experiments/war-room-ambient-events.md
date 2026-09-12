# War Room ambient events

## Goal
Make the War Room feel inhabited through rare, restrained environmental events that do not interrupt chess.

## First slice
- Define a small event scheduler with cooldowns and explicit eligibility.
- Candidate events: storm outside, fireplace variation, Hans tidying a painting, armor creak, Matthias looking away between turns.
- Events are visual/audio flavor only unless a future mechanic explicitly opts in.

## Guardrails
- Rare by default; silence is normal.
- Never block board input or obscure legal state.
- Respect reduced-motion, mute and coarse/mobile performance gates.
- Avoid event overlap and repeated loops.
- No gameplay outcome may depend on ambient randomness.

## Acceptance
- Deterministic scheduler tests using injected time/randomness.
- Hard cooldown and mutual-exclusion tests.
- No extra continuous RAF where an existing scene driver can own the event.
- Browser gates cover desktop and Android War Room.