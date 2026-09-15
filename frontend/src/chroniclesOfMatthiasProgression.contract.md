# Chronicles Tactics progression contract

This file intentionally keeps the vertical slice contract terse and testable.

- XP is persistent profile progress, isolated from normal chess.
- The Crypt 01 encounter has a finite XP budget: damage HP bands, kills, objective, support HP bands, and survivor awards can each be claimed once.
- Reloading, retrying, or replaying the same encounter must not regenerate those awards.
- Levels grant one attribute point per level gained and one skill point on even levels.
- The active run id survives reload for continuity, is bound to the authenticated user, and is not itself synced profile progress.
- UI exposes only level/XP/unspent points during play; attribute allocation and skills stay behind later progressive disclosure.
