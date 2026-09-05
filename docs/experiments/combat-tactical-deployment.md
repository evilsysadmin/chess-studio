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

## Guardrails
- No mid-battle free class switching.
- No hidden penalty for keeping a veteran in reserve.
- No invented enemy intel.

## Acceptance
- Legal/illegal deployments are unit tested.
- F5 restores pre-battle deployment without crossing users.
- Starting a battle freezes the selected roster.
- Mobile deployment remains understandable without horizontal overflow.