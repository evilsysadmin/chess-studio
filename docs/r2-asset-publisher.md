# R2 asset publisher

Chess Studio stores large derived binary assets in Cloudflare R2 instead of Git history.

## Contract

- Bucket: `chess-studio-assets`
- Public origin: `https://assets.chess-studio.shadowops.dpdns.org`
- Storage class: `Standard`
- Object names are content-addressed with the first 16 hex characters of SHA-256.
- Git keeps only code and the small `frontend/src/assets/r2-assets-manifest.json` mapping logical IDs to immutable URLs.
- No automatic garbage collection. Old hashed objects remain available for rollback until an explicit retention policy is added.
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
