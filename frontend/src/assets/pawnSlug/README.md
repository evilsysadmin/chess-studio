# Pawn Slug runtime art

Matthias' approved source sheet is the visual authority, but runtime delivery is Cloudflare R2/CDN rather than Git blobs.

The runtime resolves stable logical IDs through `../r2-assets-manifest.json`:

- `pawnSlug.matthias.pistol`
- `pawnSlug.matthias.machinegun`
- `pawnSlug.matthias.shotgun`
- `pawnSlug.matthias.panzerfaust`
- `pawnSlug.matthias.motion`
- `pawnSlug.matthias.canonicalMaster` (source/master archive; not loaded as a gameplay atlas)

Published objects use content-addressed keys. Update the R2 object first, then review the manifest pointer. Do not replace an existing immutable object in place.

During the migration window the old local assets may remain only as rollback/fallback material. Once CDN browser smoke is proven, remove those legacy payloads from the current Git tree instead of adding new binary variants here.
