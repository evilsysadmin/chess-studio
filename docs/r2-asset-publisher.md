# R2 asset publisher

Chess Studio stores large derived binary assets in Cloudflare R2 instead of Git history.

## Contract

- Bucket: `chess-studio-assets`
- Public origin: `https://assets.chess-studio.shadowops.dpdns.org`
- Storage class: `Standard`
- Object names are content-addressed with the first 16 hex characters of SHA-256.
- Git keeps only code and the small `frontend/src/assets/r2-assets-manifest.json` mapping logical IDs to immutable URLs.
- Automatic garbage collection is governed by the retention policy in `infra/cloudflare/r2-assets.json`. Active manifest objects, hard-coded runtime R2 URLs and stable `current.*` aliases are protected; old immutable generations are bounded instead of accumulating forever.
- The REST publisher accepts assets up to 300 MB. Larger objects must use the S3-compatible multipart path.

The publisher reuses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; no R2 S3 access key is required for the normal path.

The CLI entrypoint is `scripts/r2_asset_publish.py`. It reuses the publisher core but sends object bytes as a raw `PUT` request body because Cloudflare currently rejects multipart/form-data on this endpoint with API error `10028`.

## Commands

Validate locally without credentials:

```bash
python3 -S scripts/r2_asset_publish.py self-test
python3 -S scripts/r2_asset_publish.py check-manifest
```

Preview a publication without network access:

```bash
python3 -S scripts/r2_asset_publish.py publish ./asset.webp \
  --logical-id pawnSlug.example \
  --prefix pawn-slug/example \
  --dry-run
```

Publish with Cloudflare credentials in the environment:

```bash
python3 -S scripts/r2_asset_publish.py publish ./asset.webp \
  --logical-id pawnSlug.example \
  --prefix pawn-slug/example
```

The command uploads the immutable object first and only then updates the local manifest. Commit the manifest as the small textual change consumed by the application.

## Retention / garbage collection

`scripts/r2_asset_gc.py` owns conservative bucket cleanup.

```bash
python3 -S scripts/r2_asset_gc.py self-test
python3 -S scripts/r2_asset_gc.py plan --report /tmp/r2-retention-plan.json
python3 -S scripts/r2_asset_gc.py apply --report /tmp/r2-retention-report.json
```

The collector is fail-closed. It never deletes a key referenced by the reviewed manifest, a hard-coded runtime R2 URL found in application/runtime source, a stable `current.*` alias, or a configured protected prefix. Objects younger than the grace window or objects it cannot classify safely are also retained. The general immutable grace is seven days; configured release bundles keep their own shorter grace while still retaining the active and previous releases.

Its audit output classifies hard-coded repo URL pins by authority. Runtime references remain distinct from objects retained only by operational tooling (`scripts/`, `e2e/`, `.github/`); this is reporting only and does not make those tooling-only objects deletable automatically.

Eligible cleanup includes expired smoke objects, explicitly deprecated prefixes, duplicate content-addressed payloads, excess staging/runtime revision history, old immutable generations beyond the rollback window, fully unreferenced hash families older than 45 days, and finally old rollback copies when bucket pressure exceeds the configured soft ceiling.

The current policy targets 7.0 GB and starts pressure cleanup at 7.5 GB, leaving materially more headroom below the 10 GB-month free-storage allowance. Each run is guarded by a maximum object count and maximum fraction of the bucket so one bad classification cannot empty the bucket in a single execution.

Godot Web releases are treated as atomic directories rather than unrelated files. The collector validates each configured `current.json`, protects the full active release and one previous release, then retires older release directories after their grace period. A missing or malformed pointer protects that whole release family for the run.

## Matthias Pawn Slug canonical master

For the approved handoff master:

```bash
python3 -S scripts/r2_asset_publish.py publish \
  ./matthias_canonical_sprite_sheet_v1.png \
  --logical-id pawnSlug.matthias.canonicalMaster \
  --prefix pawn-slug/matthias/master
```

Runtime atlases derived from that master should use separate logical IDs, for example:

```text
pawnSlug.matthias.pistol
pawnSlug.matthias.machinegun
pawnSlug.matthias.shotgun
pawnSlug.matthias.panzerfaust
pawnSlug.matthias.motion
```

Do not overwrite the canonical master in-place. A changed master receives a new hash/object key and the manifest becomes the atomic pointer to the new version.

## CI

PRs execute only local validation and do not receive Cloudflare credentials.

On `main`, `Infra · R2 assets` reconciles the bucket/domain/CORS and performs a tiny remote upload/get/delete smoke test using the raw PUT transport. This confirms that the existing Cloudflare API token can perform real object operations without adding an S3 credential pair.
