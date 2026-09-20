# Chess Studio backend — operating contract

This file augments the repository root `AGENTS.md` for `backend-python/`.

## 1. Authority and persistence

Mongo/backend state is authoritative for persistent server-owned data.

- Do not make browser-local state the sole authority for data that must survive account/session/device changes.
- Keep create/update operations retry-safe and idempotent where the API can be retried.
- Protect concurrent creates/updates against duplicate records and last-write races.
- Preserve ownership checks on games, Chronicles runs, profiles and user-scoped records.
- Centralize lifecycle deletion/purge behavior so deleting/reusing an account does not leave orphaned user-owned data.
- Add/maintain indexes that correspond to real lookup/purge paths, but do not make index bootstrap failure take unrelated indexes down with it.

## 2. API behavior

- Keep validation errors distinct from unexpected internal failures.
- Do not catch broad exceptions and relabel server bugs as user/game-rule errors.
- Preserve compatibility for active frontend callers unless the same PR updates all consumers and tests.
- Remove dead endpoints only after verifying there are no production consumers.
- Keep API surface gates/tests updated when routers/endpoints intentionally change.
- Prefer small typed/domain helpers over duplicating validation logic across routes.

## 3. Chess/game correctness

- Server-side chess endpoints must validate legal state/moves with the real chess engine/library contract.
- Never introduce Combat-only rules into standard game APIs accidentally.
- Hints/AI endpoints must fail safely and must not corrupt game state if an engine/provider fails.
- Persistent game creation/reconciliation must tolerate network retries without silently creating divergent sessions.

## 4. Chronicles

Chronicles run identity/world binding must be reproducible.

- Generated layouts derive from a stable seed/map code/versioned generator contract.
- A given supported map code/seed must reproduce the same intended world for its generator version.
- Run persistence stores the identity/metadata needed to recover that world; do not trust only client storage.
- Topology/reachability/quality validation runs before a generated world is accepted.
- Frontend/backend copies of authored manifests/contracts must stay semantically aligned; update both sides and their parity tests together.
- Procedural variation must not delete mandatory authored progression/content or generate unwinnable topology.
- Progression writes (XP/levels/skills/spells/items) must be based on actual run events and be retry-safe; avoid duplicate rewards on replayed requests.

## 5. Presence, privacy and admin

- Presence stores only the approved coarse status/foreground/release metadata.
- Do not add FEN, move history, message text, clickstream, keyboard/mouse events, secrets or tokens to presence/telemetry.
- Keep online/idle/recent classification derived from timestamps rather than extra invasive heartbeats.
- Admin endpoints must enforce authorization server-side; frontend hiding is not security.

## 6. Security and resilience

- Preserve dependency/security/static gates and practical severity thresholds.
- Treat tokens/secrets as environment/config only; never log or persist them in user data.
- Bound input sizes and validate identifiers before database/filesystem use.
- Keep test isolation for process-global resilience/rate-limit/metrics state.
- When adding retries/backoff/circuit-breaker behavior, ensure a retry cannot duplicate a non-idempotent side effect.

## 7. Testing

Prefer focused backend tests first, then broader suite/gates as warranted.

Cover at minimum when relevant:
- happy path;
- invalid/auth/ownership path;
- duplicate/retry/concurrency behavior;
- persistence round-trip/recovery;
- migration/legacy compatibility;
- deletion/purge lifecycle;
- generated-world determinism and invalid topology rejection.

Never claim full backend validation if required Python dependencies/services were unavailable.
