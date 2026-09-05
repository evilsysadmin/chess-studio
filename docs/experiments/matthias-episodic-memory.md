# Matthias episodic memory

## Goal
Make Matthias reference real prior incidents and results so rivalry feels continuous rather than session-local.

## First slice
- Define bounded episodic records for notable game incidents.
- Store only facts already measured or reconstructible from saved game data.
- Add retrieval rules for recent, severe or recurring incidents.
- Surface sparse contextual callbacks on Home and in game commentary.

## Episode examples
Missed mate, allowed mate, queen lost to pawn, major tactical blunder, brilliant tactic, comeback, repeated opening failure, series result and notable Combat outcome.

## Guardrails
- Never invent an incident.
- Never expose private game content beyond the user's own context.
- Deduplicate equivalent memories and cap history size.
- Matthias remains sparse; silence is valid.

## Acceptance
- Deterministic tests prove evidence -> episode -> eligible callback.
- F5/logout/login behavior is defined.
- Reset clears episodic progress under the existing reset contract.
- Existing single Matthias identity/personality is preserved.