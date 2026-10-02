# PvP / 1v1 — bounded context contract

Status: canonical architecture contract for human-vs-human Chess Studio play.

## Purpose

PvP is a bounded context with its own lifecycle, failure model and acceptance gates. It may share the FastAPI process and Mongo deployment with the rest of Chess Studio, but it must not depend on implicit behavior from unrelated game, renderer, visual or presence subsystems.

The goal is logical isolation first. Process/deploy separation is optional later and must be justified by load, blast radius, SLO or operational evidence.

## Authority

Backend PvP is the sole authority for:
- roster availability;
- challenges and their resolution;
- match identity and lifecycle;
- readiness/handoff;
- FEN, legal move application and turn;
- clocks;
- terminal result and end reason;
- PvP rating settlement;
- server-owned lobby chat history.

The frontend may cache/project snapshots and emit intents. It must not reconstruct authoritative lifecycle transitions locally.

Mongo is the durable authority for persisted PvP state. Browser state is never a competing source of truth.

## Domain states

### Challenge
Allowed states:
- pending
- accepted
- declined
- cancelled
- expired

Only one pending challenge may exist for the same unordered player pair.

### Match
Allowed states:
- starting
- active
- finished
- cancelled

Allowed monotonic transitions:
- starting -> active
- starting -> cancelled
- active -> finished

A match must never transition backward.

## API boundary

Target public namespace:

`/api/pvp/v1/*`

The current `/api/pvp/*` surface is compatibility v0. Migration to v1 must preserve behavior through an explicit adapter/shim until all first-party clients are on v1.

The v1 client surface must use stable DTOs and stable machine-readable error codes. UI copy is not an API contract.

## Mutation semantics

Every network-retriable mutation must satisfy at least one of:
- natural idempotency;
- deterministic operation identity;
- idempotency key;
- compare-and-swap / revision guard.

Required examples:
- challenge creation cannot duplicate an existing pending pair;
- accept retry cannot create two matches;
- readiness retry cannot advance readiness twice;
- move retry cannot apply the same move twice;
- rating settlement is exactly-once for one finished match;
- cancellation is idempotent once terminal;
- side effects from an accepted challenge or activated match must be deduplicable.

## Error model

PvP v1 errors must distinguish these classes:

- `validation`: malformed request or impossible DTO.
- `rule_conflict`: valid request rejected by current PvP rules/state.
- `ownership`: authenticated user does not own/participate in the resource.
- `revision_conflict`: state changed concurrently; client should re-read authority.
- `dependency_transient`: storage/network dependency failed temporarily; retry may be safe.
- `internal`: unexpected backend failure.

A v1 error envelope should expose:
- stable code;
- HTTP status;
- retryable boolean;
- optional retry-after;
- request/reference id.

The frontend must not infer retry behavior by parsing human-readable copy.

## Handoff contract

Handoff is the bounded transition from accepted challenge to active match.

Invariants:
- deterministic match identity derived from the accepted challenge;
- both players reconcile against one authoritative match;
- readiness is idempotent;
- handoff is bounded by a server deadline;
- cancellation before activation is server-authoritative;
- once activation commits, cleanup failure must not turn success into an HTTP 5xx;
- transient storage failure may be retried only where the operation remains idempotent/CAS-protected;
- F5/reconnect re-reads server authority instead of replaying local assumptions;
- the client may suppress transient noise while recovery is progressing, but persistent failure must surface clearly.

## Secondary side effects

These must never invalidate an already committed authoritative transition:
- roster cleanup after activation;
- lobby system messages;
- coarse telemetry;
- notifications;
- non-critical audit/log enrichment.

Prefer event/outbox-like, deduplicable semantics as the subsystem evolves.

## Persistence contract

PvP collections and indexes are part of the domain contract.

Current logical stores include:
- roster;
- challenges;
- matches;
- lobby chat.

Requirements:
- index definitions are tested;
- TTLs are explicit;
- schema changes are backward compatible or migrated explicitly;
- persistent-storage-required environments fail explicitly if Mongo is unavailable;
- in-memory fallback is test/local-only and never presented as cross-session persistence.

## Presence and clocks

Presence is advisory input to lifecycle policy, not a second match authority.

Clock values are server-owned. Clients render snapshots and elapsed time derived from server timestamps but cannot settle timeout independently.

Disconnect and reconnect policy must be deterministic, bounded and covered by tests.

## Staging sparring rival

Staging may expose one synthetic PvP rival for visual/flow QA. This actor is an
environment-gated adapter around the real PvP lifecycle, not a second frontend
mock or a browser kept alive indefinitely.

Contract:

- disabled outside staging;
- visible and challengeable only by the configured owner account;
- appears through the normal roster DTO and challenge API;
- auto-accepts a challenge and marks itself ready through the authoritative
  backend state, so the owner still traverses the real handoff into War Room;
- is treated as online for disconnect policy while that synthetic duel exists;
- matches against the sparring actor are explicitly unrated and never mutate
  human PvP Elo;
- production must force the feature off independently of runtime secret state.

The synthetic actor exists to exercise lobby -> challenge -> handoff -> Duel
Room presentation. It must not become a general matchmaking bot or leak into
normal-user rosters.

### Owner-scoped resident experiment

Staging may additionally expose a tiny set of synthetic **residents** only to
the configured sparring owner account. This is an explicitly bounded product
experiment, not public matchmaking yet.

- the existing staging synthetic gate must be enabled;
- only the configured owner can see, challenge or play residents;
- other accounts must neither see them in roster nor challenge their usernames;
- every resident is disclosed in DTO/UI as `RESIDENTE · IA`;
- protocol ownership keeps the technical username while UI uses the resident display name;
- resident matches use the same authoritative challenge/handoff/match/clocks/CAS
  lifecycle as human PvP;
- resident matches remain unrated and never change human PvP Elo;
- playing strength comes from the existing calibrated human-Elo CPU policy;
- engine work runs through the bounded engine executor, never directly on the
  FastAPI event loop;
- this first slice does not send proactive resident challenges. Challenge
  initiation remains human-driven until engagement frequency/cooldown policy is
  reviewed separately.

## Rating

PvP rating is independent from CPU/Matthias rating.

Settlement:
- only after an authoritative terminal match result;
- exactly once per match;
- retry-safe;
- never inferred from browser-local outcome.

## Chat

Lobby chat is a PvP-owned auxiliary surface.

It must remain bounded:
- bounded history;
- bounded message length;
- backend rate limit;
- no hidden coupling to match correctness;
- chat failure cannot break challenge/handoff/gameplay success.

## Go read-offload wedge

The Go PvP edge may absorb high-frequency read coordination incrementally while Python remains the lifecycle authority.

Current bounded contract:
- lobby pulse may read Mongo natively and invalidate the full Python lobby snapshot;
- match pulse may renew only the caller's coarse duel presence timestamp without changing gameplay revision;
- match pulse may expose revision/status plus the rival's coarse presence band, and detect clock, handoff or disconnect-grace boundaries that require an immediate Python reconciliation;
- the Go pulse only emits lifecycle hints: Python remains the authority that starts/restarts disconnect grace and commits timeout/forfeit/result transitions;
- stable active matches with unchanged revision and presence perform a bounded full Python reconciliation every 15 seconds; during blue/green compatibility with an older pulse that lacks presence hints, clients retain the previous 3-second safety reconcile;
- roster join/heartbeat and leave may execute natively in Go with the same server-owned PvP rating/tier, a bounded join rate limit, and pending-challenge cancellation on leave;
- roster native cutover has an independent kill-switch; disabled means the edge proxies the existing Python routes unchanged;
- lobby chat posting may execute natively in Go with the same 240-character normalization, per-user 12/minute limit and Mongo message schema; its kill-switch falls back to the Python route without a frontend change;
- timeout, disconnect grace/forfeit, handoff transitions, move legality, result and Elo settlement remain Python-authoritative until migrated explicitly with equivalent CAS/idempotency coverage;
- a missing/disabled native pulse must fall back to the existing Python GET path.

## Health and observability

PvP must gain a dedicated logical health/readiness view even while sharing the backend process.

Track at minimum:
- challenge create/accept outcome;
- handoff duration;
- handoff timeout/cancel;
- transient storage retry count;
- reconnect recovery;
- match activation failure;
- rating settlement failure;
- PvP API latency/error rate by operation and stable error code.

Logs must include request/reference identity and safe PvP resource identity where appropriate, without exposing secrets or unapproved fine-grained user activity.

## CI ownership

PvP changes must have a path-aware gate that owns:
- backend PvP contract tests;
- frontend PvP API/client tests;
- focused browser flow for lobby -> challenge -> accept -> handoff -> active match;
- retry/idempotency/CAS tests;
- storage transient/permanent failure tests;
- F5/reconnect/timeout/cancel tests;
- exactly-once rating settlement;
- compatibility v0 -> v1 while migration exists.

PvP-only changes must not pay unrelated Hans, Chronicles or War Room visual sidecars unless the changed file is genuinely consumed by those producers.

## Layering target

Incremental target:

`router -> pvp service/state machine -> pvp store`

The router validates/authenticates/serializes. The service owns domain transitions. The store owns persistence primitives. Frontend adapters consume versioned DTOs.

Avoid adding new transition rules directly to React or scattering them between router and store.

## Migration plan

1. Contract and ownership.
2. Stable PvP error envelope and frontend adapter.
3. Extract service/state-machine layer from router.
4. Introduce `/api/pvp/v1` with v0 compatibility adapter.
5. Dedicated health/metrics and SLOs.
6. Dedicated CI/synthetic PvP lane.
7. Re-evaluate process/deploy isolation only from operational evidence.

## Acceptance checklist

A PvP change is not complete unless applicable items hold:
- one authoritative owner per mutable state;
- retry path is idempotent or CAS-protected;
- terminal transitions are monotonic;
- secondary side effects cannot revert committed success;
- transient and permanent failures are distinguishable;
- frontend consumes stable state/error semantics;
- F5/reconnect converges to server authority;
- tests cover duplicate/retry and concurrent mutation;
- PvP gate runs without unrelated visual debt;
- compatibility is explicit during API migration.

Tracking: #4368.


## Go migration wedge

PvP is migrating incrementally toward a dedicated Go process. The first slice is deliberately a transport edge, not a second authority:

- `backend-go/cmd/pvp-edge` accepts only `/api/pvp*` plus its internal health/readiness endpoints;
- while a PvP operation still belongs to Python, Go proxies it transparently to the paired Python backend and preserves auth, request path/query/body and response semantics;
- Go readiness fails closed when the paired Python authority is not ready;
- proxy transport failure returns a stable retryable `pvp_upstream_unavailable` envelope instead of inventing domain state;
- most compatibility routes remain stateless proxies while Mongo/Python remain authoritative until an operation is explicitly migrated with parity tests;
- the first native read is `GET /api/pvp/lobby/pulse`: Go validates the same HS256 session contract (including account `session_version`), reads Mongo directly and returns only a deterministic lobby revision plus polling cadence;
- the browser uses that revision as invalidation: a stable lobby no longer forces FastAPI to rebuild the full roster/challenges/match/chat DTO every few seconds; a changed revision refreshes the canonical Python snapshot immediately and a bounded 30 s full reconcile remains as a compatibility safety net;
- the pulse deliberately excludes roster `last_seen` values from its digest, so the existing 15 s availability heartbeat does not manufacture a full lobby refresh when membership did not change;
- `PVP_NATIVE_PULSE_ENABLED` is a deploy kill switch. When disabled the exact native route returns 404 and first-party clients fall back to the existing full Python poll without changing mutation semantics;
- moves, clocks, challenges, rating settlement and all PvP mutations still belong to Python in this slice;
- migration is endpoint-by-endpoint. An operation moves to Go only when its auth, idempotency/CAS, persistence, error and reconnect contracts have dedicated parity coverage;
- rollback must remain routing-level while the compatibility proxy exists.

Target deployment pairs each blue/green Python slot with the same-color Go PvP edge, so switching the stable nginx edge cannot route a duel to the wrong backend generation.
