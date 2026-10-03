# Python → Go migration (strangler)

Goal agreed on 2026-10-03: the whole backend moves from Python/FastAPI to Go. The migration is incremental and reversible at every step; Python keeps serving whatever Go does not serve natively yet, and is retired domain by domain only with evidence.

PvP was the first domain and is the template. Its details live in [`pvp.md`](pvp.md).

## Architecture

```
Cloudflare Tunnel → nginx edge (stable :4000) → Go sidecar pvp_<color> → Python backend_<color>
```

- **API front.** In nginx API mode `go`, nginx sends the whole API to the Go sidecar of the active colour. Go serves its native routes and forwards everything else to the paired Python slot unchanged: path, query, body, auth and the Cloudflare client headers, so Python's security identity (`CF-Connecting-IP` with `TRUST_CLOUDFLARE_CLIENT_IP`) is unaffected. Proxied responses carry `X-Chess-Edge: go`. In API mode `direct` (the default), nginx sends only `/api/pvp` to Go.
- **Mode selection.** `scripts/oci_existing_a1_deploy.sh` chooses the mode per target (`api_edge_mode`). Only the candidate cutover and its commit marker use it. Every rollback renders `direct`, because an older sidecar may not be able to front the API. After the cutover the deploy proves that `/api/release` answered through Go (exit 58 otherwise, with rollback). `scripts/oci_staging_cors_contract.py` pins all of this.
- **Routing.** One routing table per domain, shared by the edge and the native handler (`internal/pvproute` for PvP). A native route has a kill-switch until its domain is retired. A disabled or unknown route goes to Python.
- **Data.** MongoDB stays the single authority during the migration. Go and Python read and write the same documents, so every native write needs the same CAS, idempotency and document shape as Python, proven with integration tests against a real `mongo:8.0` (see `internal/pulse/mongo_integration_test.go`). Go declares the indexes it relies on.

## Rules for each domain

1. **Safety net first:** parity tests against Python, built from fixtures that Python itself generates (as with `scripts/engine_parity_corpus.py`), plus Mongo integration tests for every write.
2. **Native behind a kill-switch,** route by route, enabled in staging first and accredited by the deploy.
3. **Evidence before retiring:** Python request counts per route in Grafana (`chess_studio_http_server_requests_total`, see `pvp-python-fallback.yml`) must be zero for an agreed window.
4. **Retire:** delete the Python routes and the kill-switches in reviewed PRs. Rollback is then a release rollback.

## Order

| # | Domain | Python | Status |
| --- | --- | --- | --- |
| 1 | PvP (lobby, challenges, matches, residents) | `pvp_*` | Native in Go. Python fallback retires after 2026-10-17 if the evidence holds. |
| 2 | API front (all traffic through Go) | — | Mode in place, default `direct`. Next: enable it in staging. |
| 3 | Games vs CPU: `/api/games/*`, `/api/analyze*` | `game_api`, `game_store`, `chess_core`, `engine_analysis`, `cpu_difficulty`, `*_service` | Engine ported (`residenteval`, `residentsearch`, `residentpolicy`). Game core ported (`internal/gamecore`: rebuilding from initial FEN or handicap + SAN, snapshot, draw claims, insufficient material, `resolve_move`, FEN validity) with a corpus from `scripts/games_parity_corpus.py`. Operation idempotency ported (`internal/gameops`: Idempotency-Key, sha256 fingerprints over Python's `json.dumps`, uuid5 ids, ledger) with a corpus from `scripts/games_ops_corpus.py`: a retry must be recognised whether it lands on Python or Go (watch out: omitted `difficulty` fingerprints as int `50`, explicit as `50.0`). Next: the game store (Mongo) and the routes. |
| 4 | System: health, ready, release, status, features, client telemetry | `system_api`, `feature_flags`, `client_telemetry` | Pending. Small, but `status` aggregates every store. |
| 5 | Auth, users, profile, presence | `auth`, `users_store`, `profile_store`, `auth_*_guard` | Pending. Go already validates sessions. Passwords use Argon2id with legacy bcrypt verification, and both must match. |
| 6 | Feedback, Matthias daily, narrative, memory and episodes | `feedback_store`, `matthias_*`, `narrative_*` | Pending. `narrative_cloudflare` calls an LLM provider. |
| 7 | Chronicles and Pawn Slug API | `chronicles_*`, `pawn_slug_api` | Pending. The procedural generators need seeded parity corpora. |
| 8 | Admin and observability | `admin_*`, `observability*` | Pending. |
| 9 | Retire the Python image and runtime | — | Last step. |
