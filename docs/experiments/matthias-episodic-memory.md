# Matthias episodic memory

## Goal
Make Matthias reference real prior incidents and results so rivalry feels continuous rather than session-local.

## First slice
- Define bounded episodic records for notable game incidents.
- Store only facts already measured or reconstructible from saved game data.
- Add retrieval rules for recent, severe or recurring incidents.
- Surface sparse contextual callbacks on Home and in Matthias narrative context.

## Episode examples
Missed mate, allowed mate, queen lost to pawn, major tactical blunder, brilliant tactic, repeated opening failure and an exact single-game result against Matthias. Series and Combat outcomes remain later extensions and must receive equally explicit evidence contracts before they become biography.

## Storage contract
- Episodes live inside the existing per-user `matthias_memory` document.
- There is no second collection, identity or reset lifecycle.
- The first episodic observation establishes a baseline; old cumulative counts are never backfilled as fake recent memories.
- The stored observation snapshot contains only bounded incident counts, CPU rivalry counters and opening counters.
- FEN, move history, prompts, tokens, credentials and arbitrary user text are excluded from episodic snapshots.
- Equivalent episode fingerprints are deduplicated and history is capped.

## Retrieval contract
- Candidate selection is deterministic and bounded to three callbacks.
- Recent, severe and recurring evidence may qualify; ordinary events may correctly return silence.
- Narrative calls receive only eligible callback candidates, not the complete persisted biography.
- Home copy is rendered from known structured evidence, never from arbitrary stored labels or AI prose.
- An episodic Home visit does **not** increase Matthias' appearance probability; it only changes what he says when the existing cadence already permits a visit.

## Priority on Home
Episodes never displace: active saved game, real return/reunion, active challenge, open coaching debt, or newly earned respect. After those priorities, an eligible episode may beat generic goals/legacy chatter because it is concrete continuity rather than another random quip.

## Guardrails
- Never invent an incident.
- Never expose private game content beyond the user's own context.
- Deduplicate equivalent memories and cap history size.
- Matthias remains sparse; silence is valid.
- Unknown incident keys stay measurable in the baseline but are not promoted to biography until their semantics are explicitly defined.
- Aggregate jumps that cannot prove one exact rivalry/opening outcome are not narrated as a specific game.

## Acceptance
- Deterministic tests prove evidence -> episode -> eligible callback.
- First observation is baseline-only; later deltas create episodes.
- Same/decreasing counters create no duplicate memories.
- Exact rivalry result reconstruction rejects ambiguous aggregate jumps.
- Daily audience and narrative context receive only bounded eligible callbacks.
- Home uses deterministic evidence-backed copy and preserves the existing cadence/cooldown.
- F5 preserves persistent memory through the backend; logout/login changes no identity or storage semantics.
- `Empezar de cero` deletes episodic progress through the existing Matthias reset document deletion while leaving daily quota semantics unchanged.
- Existing single Matthias identity/personality is preserved.
