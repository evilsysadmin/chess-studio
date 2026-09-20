# Chess Studio — agent operating contract

This is the stable repository-wide operating contract for Chess Studio.
Keep this file short, durable and operational. Subsystem implementation details belong in the nearest nested `AGENTS.md`.

Canonical shorthand used in project conversations:
- `Chronicles` = `Chronicles of Matthias`.
- `Tactics` = `Chronicles of Matthias Tactics`.

## 1. Non-blocking iteration is mandatory

GitHub Actions and deployments are asynchronous. Never keep a chat/agent turn alive only to wait for them.

After pushing/opening a PR:
- optionally take one immediate status snapshot;
- enable automerge by default when appropriate;
- remember the PR/branch/SHA;
- continue immediately with independent useful work.

Before pushing the next PR, take one status snapshot of the previous PR.

Interpret the snapshot as follows:
- green/merged: continue;
- pending/running: continue; do not poll again during that iteration;
- failed: inspect only the failed check/job and the minimum logs needed, fix it, push, continue;
- conflict/out-of-date: update only when required for the next dependent step.

Forbidden patterns:
- polling loops;
- `sleep` + status checks;
- watch-style workflow monitoring;
- rereading the whole check suite while jobs are pending;
- waiting for CI/deploy when unrelated work can continue;
- downloading giant logs before a concrete failure exists.

A pending PR is not a blocker unless the next change genuinely depends on its code.

## 2. Git/GitHub discipline

Prefer local work and cached artifacts.

Normal path:
`cached repo -> worktree/branch -> edit -> local validation -> visual artifacts -> commit/push -> PR -> automerge`

Rules:
- reuse an existing checkout/cache; do not clone repeatedly;
- use independent branches/worktrees for independent changes;
- use stacked PRs only when the later change truly depends on the earlier branch; keep dependency order explicit;
- sync `main` when needed, not continuously;
- if no local repo is available, rediscover/use the Git/GitHub connector rather than asking for repository details already known;
- keep GitHub calls small: metadata, SHA/check state, small targeted file reads, commit/PR/automerge;
- avoid large `fetch_file` reads, complete diffs/patches, broad searches, whole workflow logs and duplicate reads;
- treat already-read content as working cache unless there is evidence it changed;
- if Git/GitHub is degraded, reduce calls further rather than retrying aggressively;
- prepare a coherent change before remote writes whenever practical;
- do not produce project ZIPs unless explicitly requested.

## 3. PR-sized changes

Prefer small coherent iterations over multi-feature bursts.

For each iteration:
1. inspect only relevant code/docs/assets;
2. make one coherent change;
3. run the smallest meaningful local validation first;
4. run broader gates only when justified by touched surface;
5. for visual changes, produce and inspect review artifacts;
6. push/open PR;
7. enable automerge by default;
8. continue without waiting for CI.

Do not ask for confirmation between normal implementation steps. Ask only for a genuine product decision, missing authorization/secret, destructive action that cannot be safely inferred, or another real blocker.

Do not absorb unrelated cleanup into the same PR just because it is nearby.

## 4. Validation and truthfulness

Prefer repository-provided Make targets/scripts and existing quality gates.

General order:
- focused subsystem tests;
- static/preflight checks;
- broader frontend/backend tests when warranted;
- browser/headless/runtime validation for user-visible flows;
- visual artifact inspection for visual changes.

Rules:
- never claim a test/render/deploy/visual review passed unless it actually ran and was inspected;
- distinguish source/static validation from runtime validation;
- when dependencies/infrastructure block a gate, state exactly what could not run and continue with the strongest available validation;
- diagnose the first concrete failure instead of pulling giant logs pre-emptively;
- preserve existing CI/security/quality gates unless replaced by equivalent or stronger coverage.

## 5. Artifact-first visual work

Every visual iteration must produce a reviewable PNG artifact and that PNG must actually be inspected.

Required loop:
`render/generate -> PNG artifact -> inspect -> compare baseline -> detect regression -> correct -> validate`

A successful process exit is not visual validation.

Check at minimum:
- composition and hierarchy;
- clipping/overflow;
- scale/alignment drift;
- mobile/responsive behavior when relevant;
- obvious render regressions;
- consistency with canonical/baseline appearance.

Keep the latest validated artifact/worksheet/cache needed to resume after a failed tool/chat session. Long visual pipelines must be restartable.

## 6. Subsystem instruction map

Always read the nearest applicable nested `AGENTS.md` before changing a subsystem.

- `frontend/src/AGENTS.md`: frontend architecture and product-mode contracts, including normal chess, Matthias, Home, War Room v1/v2, Combat Chess, puzzles/coaching, Admin/presence, Chronicles and Tactics.
- `backend-python/AGENTS.md`: API, Mongo/persistence, retry/idempotency, privacy/security and backend domain contracts.
- `scripts/blender/AGENTS.md`: reproducible Blender pipelines for Home, War Room v2 and approved 3D game assets.
- `scripts/art/AGENTS.md`: deterministic 2D art generation/normalization/packing, PNG contracts and R2 handoff.
- `games/pawn-slug-godot/AGENTS.md`: Pawn Slug Godot runtime, gameplay and sprite/atlas contracts.

If a subsystem lacks a nested file, this root contract still applies.

## 7. Stable product invariants

Do not silently violate these while changing unrelated code.

### Core chess
- Standard chess, tournaments, puzzles and other normal modes obey standard chess legality.
- Combat-only HP, metamorphosis, permadeath or other rule mutations must not leak into normal chess.
- Chess clocks, series and reconnect/recovery must preserve authoritative game state and legal move history.

### Matthias
- Matthias is the fixed CPU character/identity; do not introduce selectable CPU personalities unless product direction explicitly changes.
- His sarcasm/comments must be sparse and triggered by real noteworthy events, not random noise.
- Any remark, coaching statement or rivalry memory that references the user's play must be backed by real stored/measured facts. Never invent incidents or weaknesses.

### Progressive disclosure
- Keep the normal path understandable and uncluttered.
- Put advanced depth behind deliberate secondary actions/details rather than expanding every screen into a dashboard.

### Combat Chess
- Combat Chess may deliberately bend chess rules, but only inside Combat/Roguelike.
- Persistent unit identity/history/progression and calibrated permanent loss are part of that mode's domain; do not fake or reset them casually.

### Privacy/telemetry
- Presence/telemetry stays coarse, low-cardinality and privacy-preserving.
- Do not add click/mouse/keyboard surveillance, FEN/game-content telemetry, secrets/tokens or free-form private content to observability.

### Accessibility/mobile
- Preserve keyboard, touch, reduced-motion and responsive layouts when touching shared UI.

## 8. Deployment/staging assumptions

Repository workflows/configuration are the executable source of truth.

Current architectural intent:
- iterative staging may use separate fast and canonical lanes;
- frontend fast-lane publication does not by itself certify the full staging stack;
- OCI is the staging backend/compute direction where configured;
- Render remains stable production backend unless intentionally migrated;
- production should promote a known green SHA after staging validation rather than automatically shipping every merge;
- retain a manual hotfix path.

Never wait idle for deployment completion. Recheck at the next natural checkpoint unless the current task cannot be validated in any useful way without the deployed result.

## 9. Documentation/source-of-truth hierarchy

When instructions conflict, use this order:
1. current executable code/config/workflows for factual behavior;
2. nearest nested `AGENTS.md` for subsystem working rules;
3. root `AGENTS.md` for repository-wide rules;
4. focused current docs;
5. historical release notes/archived docs.

Do not preserve an obsolete assumption merely because it appears in an old release note.

When architecture/workflow intentionally changes, update the relevant agent instructions in the same or a closely related PR.

Do not turn `AGENTS.md` into a release diary or backlog dump.

## 10. Completion report

At the end of an implementation iteration report concisely:
- what changed;
- what was actually validated locally;
- PR/branch when created;
- CI state only as the latest single snapshot, if checked;
- genuine remaining risk/blocker.

Never imply pending CI is being watched in the background.
