# Castle progression space

## Goal
Turn Home/castle progression into a diegetic space that visibly changes from real play, with rewards biased toward genuine performance rather than grind.

## First slice
- Define unlockable castle objects with stable IDs, provenance and rarity.
- Award only from measured events already stored by Chess Studio.
- Render unlocked objects in the castle without turning Home into an inventory dashboard.
- Preserve progressive disclosure: normal play stays one click away.

## Data contract
Each unlock records `objectId`, `earnedAt`, `sourceType`, `sourceId` and evidence sufficient to explain why it was earned. No fabricated achievements.

## Non-goals
- No monetization.
- No generic XP shop.
- No mandatory collection loop.

## Acceptance
- Same achievement cannot duplicate accidentally.
- Reset/progress-clearing semantics are explicit and tested.
- Mobile castle remains usable at 360/390/430 px.
- Existing quick game, tournament and Combat entry remain prominent.

## Follow-up
Physical trophies, furniture, rooms, banners, relics and temporary event decorations can iterate behind this contract.