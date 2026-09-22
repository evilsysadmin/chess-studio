# Cinematic game autopsy

## Goal
Turn post-game analysis into a short visual autopsy of the most important real moments, with one-click training from stored positions.

## First slice
- Select up to three distinct evidence-backed highlights.
- Replay each highlight with controlled 3D camera emphasis and concise explanation.
- Keep the existing compact summary as the default path.
- Offer `Entrenar este error` only when a real reconstructible personal puzzle exists or can pass quality gates.

## Highlight policy
Prefer decisive evaluation swings, missed/allowed mate, material catastrophes, strong tactics and meaningful turning points. Do not manufacture drama from quiet moves.


## Personal puzzle quality contract
A personal puzzle is training material, not merely a legal position with a nominal answer.

For Workers-AI/generated personal puzzles, acceptance is fail-closed and versioned:

- the current quality-contract version must be proven; persisted puzzles from an older quality version do not silently remain active;
- the intended first move must be proven against the engine contract, not merely accepted because it matches the originally played move;
- obvious refutations must be checked;
- the opponent's best defensive reply must be proven when the position is non-terminal;
- the stored principal variation must agree with that best defense and be long enough to demonstrate the tactical point;
- terminal solutions must prove that no defensive reply exists after the solution;
- engine level/depth/candidate evidence must meet the current minimum contract;
- if a puzzle cannot prove the current gates, retire/quarantine it rather than grandfathering it.

The same tactical standard applies to curated or locally reconstructed material even when it does not carry Workers-AI provenance: reject a lesson whose nominal move immediately hangs material to a simple reply, is trivially refuted, loses material without objective compensation, or is contradicted by a stronger forcing line.

`Entrenar este error` / `Entrenar este patrón` appears only when a real stored/reconstructible position matches the measured incident/opening filter and survives the quality contract. Generic coaching never fabricates a puzzle merely to create a CTA.

A quality gate may become stricter by bumping its version and tests. Do not weaken a tactical gate just to keep legacy generated puzzles alive.


## Guardrails
- Reduced-motion users get a static equivalent.
- No engine line is presented as player intent.
- No duplicate highlights for the same incident.

## Acceptance
- Deterministic highlight selection tests.
- Existing autopsy and personal-puzzle contracts remain compatible.
- Cinematic layer is lazy-loaded.
- Mobile can skip/advance every moment.
