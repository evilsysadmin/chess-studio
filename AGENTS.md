# Chess Studio — agent operating contract

This file contains the stable, repository-wide rules for working on Chess Studio.
Keep it short and operational. Feature-specific implementation details belong in the nearest nested `AGENTS.md` or in focused docs.

## 1. Critical rule: CI must never block an iteration

GitHub Actions is asynchronous. Do not keep a chat/agent turn alive waiting for a workflow to finish.

After pushing or opening a PR:
- optionally take one status snapshot to catch an immediate failure;
- enable automerge when appropriate;
- remember the PR/branch/SHA;
- immediately continue with independent useful work.

Before pushing the next PR, take one status snapshot of the previous PR.

Interpret that snapshot as follows:
- `green` / merged: continue;
- `pending` / running: continue and do not poll it again during that iteration;
- failed: inspect only the failed check/job and the minimum logs needed to diagnose it, fix it, push, then continue;
- conflict / out-of-date: update only when required to keep working.

Forbidden workflow patterns:
- polling loops;
- `sleep` + status checks;
- `watch`-style workflow monitoring;
- repeatedly rereading all checks while they are pending;
- keeping the turn open solely to wait for CI or a deployment;
- downloading complete workflow logs when no concrete failure requires them.

A pending PR is not a blocker unless the next task materially depends on that PR being merged.

## 2. Git and GitHub discipline

Prefer local work. The normal path is:

`cached repo -> worktree/branch -> edit -> local validation -> artifacts -> commit/push -> PR -> automerge`

Rules:
- Reuse an existing local checkout/cache; do not clone repeatedly.
- Use a separate worktree/branch per independent iteration when useful.
- Sync `main` once when needed; do not continuously fetch.
- If the sandbox has no repo, rediscover the Git/GitHub connector and continue without asking the user to re-provide repository details.
- Use GitHub primarily for small metadata reads, SHA/check state, commit/PR operations and automerge.
- Avoid `fetch_file` for large files, full diffs/patches, broad searches, full workflow logs and duplicate reads.
- Treat already-read content as working cache unless there is evidence it changed.
- If git/network access is degraded, reduce GitHub traffic further rather than compensating with repeated API calls.
- Prepare the change completely before remote writes whenever possible.
- Do not create project ZIPs unless the user explicitly asks for one.

## 3. PR-sized iterations

Prefer small, coherent iterations over large multi-feature bursts.

For each iteration:
1. inspect only the relevant code/docs/assets;
2. make one coherent change;
3. run the smallest useful local validation first;
4. run broader gates when justified by the touched surface;
5. produce and inspect visual artifacts when the change is visual;
6. push/open a PR;
7. enable automerge by default;
8. continue without waiting for CI.

Do not ask for user confirmation between normal implementation steps. Ask only for a genuine product decision, missing secret/authorization, destructive action that cannot be safely inferred, or another real blocker.

Do not expand scope merely because adjacent cleanup is available. Follow-up cleanup should normally become another PR.

## 4. Testing and claims

Use repository-provided Make targets/scripts instead of inventing parallel test entrypoints when practical.

General order:
- focused tests for the touched subsystem;
- static/preflight checks;
- broader frontend/backend tests when the change warrants them;
- browser/headless/runtime validation for user-visible flows.

Rules:
- Never claim a test, render, deployment or visual review passed if it was not actually executed/inspected.
- Distinguish source/static validation from runtime validation.
- If dependencies or infrastructure prevent a gate from running, state that precisely and continue with the strongest validation available.
- Fix the first concrete failure; do not pull giant logs pre-emptively.
- Preserve existing CI quality/security gates unless the change explicitly replaces them with an equivalent or stronger gate.

## 5. Visual work: artifact-first validation

Every visual iteration must leave a reviewable PNG artifact and that PNG must actually be inspected.

Required loop:

`render/generate -> artifact PNG -> inspect -> compare baseline -> detect regression -> correct -> validate`

A successful process exit is not visual validation.

Check at minimum:
- composition and hierarchy;
- clipping/overflow;
- unexpected scale or alignment changes;
- mobile/responsive behavior when relevant;
- obvious rendering regressions;
- consistency with the canonical/baseline appearance.

Keep the last validated artifact/worksheet/cache needed to resume after a tool or chat failure. Long visual pipelines must be restartable rather than requiring regeneration from scratch.

### Home 3D

- The canonical Home visual pipeline uses Blender.
- Interactions should remain diegetic where practical rather than becoming dashboard clutter.
- Preserve progressive disclosure: the common path stays simple; advanced depth is revealed on demand.

### War Room v2

- The War Room v2 visual pipeline uses Blender.
- Preserve the current War Room implementation/assets as a rollback baseline until v2 has passed visual, mobile, performance and functional validation.
- Do not irreversibly overwrite/remove the rollback path while v2 is still being validated.

### Pawn Slug Godot

- Pawn Slug is pure 2D. Do not use Blender for its sprites.
- Sprite generation/packing/validation rules live in `games/pawn-slug-godot/AGENTS.md` and take precedence for that subtree.
- Runtime sprites/framesheets must be genuinely compatible with Godot, not merely visually plausible.

## 6. Stable product invariants

These are cross-cutting assumptions. Do not silently violate them while implementing an unrelated change.

- Prefer progressive disclosure across the UI: simple default path, explicit access to advanced depth.
- Matthias is the fixed CPU character/identity; do not add selectable CPU personalities unless the product direction is explicitly changed.
- Any coaching, rivalry memory or contextual remarks that reference a user's play must be backed by real stored/measured events or stats. Do not invent incidents or weaknesses.
- Combat Chess may deliberately bend chess rules, but those mutations must remain confined to Combat/Roguelike unless explicitly promoted to another mode.
- Normal chess, tournament, puzzles and other standard modes must not inherit Combat-only HP/metamorphosis/permadeath rules accidentally.
- Telemetry/presence should stay coarse and low-cardinality. Do not add click/mouse/keyboard surveillance, FEN/game-content telemetry, secrets, tokens or free-form private content to observability.
- Preserve accessibility, keyboard/touch usability and mobile layouts when changing shared UI.
- Prefer useful gameplay/performance/reliability improvements over decorative complexity.

## 7. Environment and deployment assumptions

Treat repository configuration/workflows as the executable source of truth and update this section when architecture changes.

Current intended deployment model:
- OCI A1 is the iterative staging environment once operational;
- Render remains the stable production backend until deliberately migrated;
- staging may track `main` continuously or very frequently;
- production should not be promoted automatically on every merge merely because staging is continuous;
- production promotion should use a known green SHA that has passed required checks and staging validation, with a manual hotfix path available.

Do not sit waiting for a deployment to finish. Validate deployment state at the next natural checkpoint unless the current task specifically requires the deployed result before any useful work can continue.

Observability should cover staging and production with the same privacy rules, while keeping environment/release identity clear enough to compare them.

## 8. Source of truth and documentation hierarchy

When instructions conflict, use this order:
1. current code/configuration/workflows for executable facts;
2. nearest nested `AGENTS.md` for subsystem-specific working rules;
3. root `AGENTS.md` for repository-wide operating rules;
4. focused current docs;
5. historical release notes/README history.

Do not preserve an obsolete assumption merely because it appears in an old release note. If architecture or workflow changes intentionally, update the relevant agent documentation in the same or a closely related PR.

Avoid turning the root `AGENTS.md` into a feature backlog or release history.

Canonical shorthand used in project conversations:
- `Chronicles` = `Chronicles of Matthias`.
- `Tactics` = `Chronicles of Matthias Tactics`.

## 9. Completion report

At the end of an implementation iteration, report concisely:
- what changed;
- what was actually validated locally;
- PR/branch when created;
- CI state only as the latest single snapshot, if checked;
- any genuine remaining risk/blocker.

Do not imply that pending CI is being watched in the background.
