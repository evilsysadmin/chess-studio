# Cinematic replay and sharing

## Goal
Let players preserve memorable games as cinematic replays and share compact victory/blunder artifacts without making export workflows mandatory.

## First slice
- Mark a finished game as memorable.
- Build a replay timeline from stored moves and real noteworthy incidents.
- Use restrained 3D camera emphasis, music and pauses around key moments.
- Generate a compact shareable result/blunder card from factual game metadata.

## Guardrails
- Replay never invents commentary or an evaluation swing.
- Reduced-motion gets a non-cinematic replay.
- Sharing excludes tokens/private account data.
- PGN remains optional/low priority.

## Acceptance
- Replay survives F5 and reconstructs deterministically from source game data.
- Key-moment ordering is stable.
- Shared card contains only approved public-safe fields.
- Mobile has explicit play/pause/skip controls and no forced autoplay.