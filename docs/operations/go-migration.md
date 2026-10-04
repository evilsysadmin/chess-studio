# Python → Go migration (strangler)

Goal agreed on 2026-10-03: the whole backend moves from Python/FastAPI to Go. The migration is incremental and reversible at every step; Python keeps serving whatever Go does not serve natively yet, and is retired domain by domain only with evidence.

PvP was the first domain and is the template. Its details live in [`pvp.md`](pvp.md).

## Architecture

```
Cloudflare Tunnel → nginx edge (stable :4000) → Go sidecar pvp_<color> → Python backend_<color>
```

- **API front.** In nginx API mode `go`, nginx sends the whole API to the Go sidecar of the active colour. Go serves its native routes and forwards everything else to the paired Python slot unchanged: path, query, body, auth and the Cloudflare client headers, so Python's security identity (`CF-Connecting-IP` with `TRUST_CLOUDFLARE_CLIENT_IP`) is unaffected. Every request/response handled through the Go front uses the generic `X-Chess-Edge: go` marker. `X-Chess-Pvp-Edge: go` remains a PvP-only compatibility marker for PvP routes and probes; non-PvP traffic must not carry it. In API mode `direct` (the default), nginx sends only `/api/pvp` to Go.
- **Mode selection.** `scripts/oci_existing_a1_deploy.sh` chooses the mode per target (`api_edge_mode`). Only the candidate cutover and its commit marker use it. Every rollback renders `direct`, because an older sidecar may not be able to front the API. After the cutover the deploy proves that `/api/release` answered through Go (exit 58 otherwise, with rollback). `scripts/oci_staging_cors_contract.py` pins all of this.
- **Routing.** One routing table per domain, shared by the edge and the native handler (`internal/pvproute` for PvP). A native route has a kill-switch until its domain is retired. A disabled or unknown route goes to Python.
- **Cross-domain HTTP policy.** Shared session-JWT validation lives in `internal/sessionauth` and canonical browser origins in `internal/corspolicy`. Domain packages may wrap those contracts for compatibility, but a new domain must not import `internal/pulse` merely to obtain auth/CORS behavior.
- **Runtime identity.** Process-level service names live in `internal/runtimeidentity`. `runtimeService=chess-studio-backend-go` is the neutral identity; `service=chess-studio-pvp-go` remains a readiness compatibility alias only until deployment probes migrate. Telemetry derives its default Go service name from the same owner.
- **Observability.** Every request Go answers natively is recorded by Go (`internal/telemetry`) the way Python records its own:
  - the `chess_studio_http_server_requests` counter and the `chess_studio_http_server_duration` histogram (seconds, SDK default buckets), with the same attributes;
  - one `http_request` access event with Python's exact JSON shape, written to stdout and sent as an OTLP log;
  - `http.route` is the FastAPI template (`pvproute.Kind.Pattern`), and native PvP events carry `pvp_hop: go:native`.

  Proxied requests are recorded only by Python, never twice. Go exports under `<OTEL_SERVICE_NAME>-go` with its own `service.instance.id`, from the same env file. Sharing Python's service name would merge the two runtimes' series and count Go-native PvP traffic as Python fallback in `pvp-python-fallback.yml`. Telemetry is fail-open, with the kill-switch `GO_REQUEST_TELEMETRY_ENABLED` (on by default).

  Not ported yet:
  - the admin panel's in-process and Mongo history (`observability_history`);
  - the trusted staging smoke marker (`synthetic_source`);
  - traces.

  Dashboards that filter by `service_name` must include the `-go` variant.
- **Presence.** Python's `get_current_user` also touches `last_activity` (coalesced to 30 s). Native Go routes do not; presence comes from the `/api/auth/activity` heartbeat every 120 s, inside the 150 s session TTL. This is an accepted deviation; revisit it when auth/presence moves to Go.
- **Data.** MongoDB stays the single authority during the migration. The process-wide Go connection/pool/readiness/shutdown owner is `internal/mongoruntime`; shared user session-version reads live in `internal/accountstore`; domain stores receive a database handle and must not expose themselves as cross-domain database service locators. Go and Python read and write the same documents, so every native write needs the same CAS, idempotency and document shape as Python, proven with integration tests against a real `mongo:8.0` (see `internal/pulse/mongo_integration_test.go`). Go declares the indexes it relies on.

## Rules for each domain

0. **Observable before native:** a route is not native until Go records it as above.
1. **Safety net first:** parity tests against Python, built from fixtures that Python itself generates (as with `scripts/engine_parity_corpus.py`), plus Mongo integration tests for every write. Go tests always consume the committed parity fixtures; CI only boots Python to regenerate them when the Python authority/generator or the fixture itself changes.
2. **Native behind a kill-switch,** route by route, enabled in staging first and accredited by the deploy.
3. **Evidence before retiring:** Python request counts per route in Grafana (`chess_studio_http_server_requests_total`, see `pvp-python-fallback.yml`) must be zero for an agreed window.
4. **Retire:** delete the Python routes and the kill-switches in reviewed PRs. Rollback is then a release rollback.

## Order

| # | Domain | Python | Status |
| --- | --- | --- | --- |
| 1 | PvP (lobby, challenges, matches, residents) | `pvp_*` | Native in Go. Python fallback retires after 2026-10-17 if the evidence holds. Evidence so far: first 24h of real play with `pvp_hop` in staging (to 2026-10-04 07:50 UTC): 0 public `/api/pvp` requests reached Python. |
| 2 | API front (all traffic through Go) | — | **Staging: `go`** (the default in `oci_existing_a1_deploy.sh`; production stays `direct`). The deploy attests `/api/release` through Go (exit 58). With `GO_NATIVE_GAMES_READ_ENABLED` it also attests that anonymous `/api/games` gets Go's 401 (`X-Chess-Games-Native: go`, exit 59); either failure rolls back. Revert: `CHESS_STUDIO_API_EDGE_MODE=direct`. Next: production once staging accredits it. |
| 3 | Games vs CPU: `/api/games/*`, `/api/analyze*` | `game_api`, `game_store`, `chess_core`, `engine_analysis`, `cpu_difficulty`, `*_service` | Engine ported (`residenteval`, `residentsearch`, `residentpolicy`). Game core ported (`internal/gamecore`: rebuilding from initial FEN or handicap + SAN, snapshot, draw claims, insufficient material, `resolve_move`, FEN validity) with a corpus from `scripts/games_parity_corpus.py`. Operation idempotency ported (`internal/gameops`: Idempotency-Key, sha256 fingerprints over Python's `json.dumps`, uuid5 ids, ledger) with a corpus from `scripts/games_ops_corpus.py`: a retry must be recognised whether it lands on Python or Go (watch out: omitted `difficulty` fingerprints as int `50`, explicit as `50.0`). Game store ported (`internal/gamestore`, mirrors `game_store.py`: idempotent create on a deterministic id, CAS on `moves`, owner-scoped reads and deletes, summaries with Python's naive `isoformat`; documents keep the BSON types and unknown fields so both runtimes share `games`), with integration tests against Mongo in CI and a local Go↔Python cross-read check. First native routes: `GET /api/games`, `GET` and `DELETE /api/games/{game_id}` (`internal/gamesapi`) behind `GO_NATIVE_GAMES_READ_ENABLED` (default off; compose `CHESS_STUDIO_GO_NATIVE_GAMES_READ_ENABLED`; on by default for staging in `oci_existing_a1_deploy.sh`, first accredited by the staging deploy of `e25ef140` on 2026-10-03). Around the handler they mirror Python's:
- `get_current_user`, including the activity touch (`internal/presence`);
- Starlette CORS and the security headers;
- the 120/minute default limit, per process;
- the storage 503.

They only receive traffic in api "go" mode (row 2). CPU move policy: `residentmove.MoveForLevel` runs the same human-Elo policy as `cpu_difficulty.get_factual_difficulty_cpu_move` for any stored difficulty, with the bands (every level 0-100 and banker's-rounded half levels), position complexity and candidate weights pinned by a corpus from `scripts/cpu_policy_parity_corpus.py`. Next: the create/move/undo/hint routes. |
| 4 | System: health, ready, release, status, features, client telemetry | `system_api`, `feature_flags`, `client_telemetry` | Pending. Small, but `status` aggregates every store. |
| 5 | Auth, users, profile, presence | `auth`, `users_store`, `profile_store`, `auth_*_guard` | Pending. Go already validates sessions. Passwords use Argon2id with legacy bcrypt verification, and both must match. |
| 6 | Feedback, Matthias daily, narrative, memory and episodes | `feedback_store`, `matthias_*`, `narrative_*` | Pending. `narrative_cloudflare` calls an LLM provider. |
| 7 | Chronicles and Pawn Slug API | `chronicles_*`, `pawn_slug_api` | Pending. The procedural generators need seeded parity corpora. |
| 8 | Admin and observability | `admin_*`, `observability*` | Pending. |
| 9 | Retire the Python image and runtime | — | Last step. |
