# Combat Chess tactical deployment

## Goal
Evolve Combat Chess toward XCOM-style pre-battle deployment using the persistent roster, reserves and purchased intelligence.

## First slice
- Barracks can contain more units than a battle deploys.
- Player selects the battle roster before launch.
- Veterans may be protected in reserve.
- Deployment UI shows legal slot/class constraints and relevant purchased intel.
- Encounter threat compensates primarily for the deployed force, not total barracks strength.

## Persistent identity
Unit alias, XP, rank, medals, techniques, metamorphosis unlocks, survivals and death history remain attached to the unit regardless of deployment.


## Veteran lifecycle and permanent loss
Combat Chess treats a unit as a persistent identity, not a disposable slot skin.

- Every generated unit receives its own alias/identity immediately, including level-1 recruits.
- XP, rank, medals, techniques, metamorphosis unlocks, survivals, kills/boss records and service history belong to that identity.
- A fallen progressed unit gets one recovery/revive window before the next battle. Reviving preserves the same identity and records the recovery; economy/cost and retained progression are governed by the current runtime rules, not by UI copy.
- Starting the next battle without recovering an eligible casualty makes the loss permanent: archive that identity/service record in the Memorial, then create a fresh level-1 replacement with a new identity and no inherited veteran progression.
- An uninvested level-1 casualty is not promoted into a valuable revivable veteran merely because it died. It still passes through the Memorial/history path before replacement.
- Memorial records are history. Do not rewrite a fallen unit's archived alias or service record because a future naming catalog, rank table or UI changes.
- A replacement reuses a battlefield slot, never the dead identity.

## Rank, medals and metamorphosis
Military progression reflects real Combat events.

- Rank/medals are earned from actual service/achievements; do not decorate units with arbitrary progression.
- Rank insignia should remain subtle and diegetic on the 3D/board piece where practical, especially base/plinth/collar/chevrons rather than floating RPG badges.
- Higher-rank veterans may unlock battlefield forms/metamorphosis options.
- The form/loadout is selected before battle and frozen for that encounter; there is no free mid-battle class switching.
- Metamorphosis changes battlefield class/movement while preserving the unit's persistent identity/history.

## Intelligence economy
Reconnaissance is separate from veteran progression.

- Earn operational credits from real campaign/tactical achievements with anti-farming safeguards.
- Spend credits before encounters for progressively deeper intelligence.
- Intel may reveal threat ranges, composition/tendencies, modifiers and boss information.
- Never reveal exact engine moves or invent false intelligence.
- Do not spend persistent veteran XP as the normal reconnaissance currency.


## Guardrails
- No mid-battle free class switching.
- No hidden penalty for keeping a veteran in reserve.
- No invented enemy intel.

## Acceptance
- Legal/illegal deployments are unit tested.
- F5 restores pre-battle deployment without crossing users.
- Starting a battle freezes the selected roster.
- Mobile deployment remains understandable without horizontal overflow.