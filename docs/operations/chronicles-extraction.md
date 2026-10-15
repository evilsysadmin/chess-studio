# Chronicles extraction inventory — phase 0

Tracking: #5632. Destination: `evilsysadmin/chronicles-of-matthias`.

## Source surfaces to extract

- Entry/UI: `frontend/src/components/ChroniclesOfMatthias.jsx`, `ChroniclesCharacterSheet.jsx`, `ChroniclesCharacterSetup.jsx`, `ChroniclesAutomap.jsx`, `ChroniclesQuestLog.jsx`, `ChroniclesShop.jsx`, `ChroniclesGuild.jsx`, `ChroniclesSpellMenu.jsx`, `ChroniclesCombatRoster.jsx`, `ChroniclesInitiativeRail.jsx`.
- Engine and presentation: `frontend/src/chroniclesOfMatthias*.js`, `frontend/src/chronicles/`, plus `frontend/src/chroniclesPartyFootprint.js` and other `chronicles*` modules.
- Backend: `backend-go/internal/gamesapi/chronicles.go` and any API/storage routes it depends on.
- Build and asset tooling: `scripts/chronicles/`, `scripts/art/pack_chronicles_sprites.py`, asset manifests and actual referenced runtime assets.
- Tests and contracts: locate all Chronicles unit, contract, E2E, mobile and save/restore coverage before moving files.

## Mandatory migration gates

1. Record an exact source commit SHA, then generate a complete dependency/import and asset-reference graph (including imports outside Chronicles-specific filenames).
2. Identify backend ownership, auth and persistence; preserve save schemas and behavior. Browser localStorage is **origin-scoped**: the new subdomain cannot read the old one directly. Design an explicit authenticated transfer or user-initiated export/import before cutover.
3. Bring up standalone build and tests on the destination repository, with CI, dependency/security gates and rollback.
4. Deploy independent staging and validate real gameplay, combat, quests, inventory, F5 restore, desktop and 360/390/430 px mobile.
5. Cut over production only after staging is verified. Leave existing Chess Studio entry intact until then.
6. Godot is a separate later prototype, not part of the extraction PR series.

## Delivery discipline

Keep extraction PRs small and reversible. New PRs begin Draft. Nonvisual PRs can arm native automerge after required checks permit it; visual PRs require actual rendered evidence embedded in the chat before Ready/automerge. Avoid moving or deleting code before the destination runs.
