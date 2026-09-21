# Visual asset flow · Pawn Slug / Chess Studio

This project stores large generated visual assets in Cloudflare R2 and keeps Git focused on code, manifests, and contracts.

## Canonical source of truth

- Every significant visual family starts from an approved canonical master or handoff.
- The canonical master is the source of truth for identity, proportions, palette, and style.
- Large approved masters should not be casually committed to `main` as heavyweight blobs.

## Deterministic derivation

Runtime atlases, sheets, and other production-ready assets are derived from the canonical source via deterministic scripts. The derivation pipeline must define the exact input, script, output, dimensions, byte size, and SHA-256.

## Git vs R2 responsibilities

Git stores derivation scripts, runtime wiring, tests and contracts, manifest entries, and concise documentation. Cloudflare R2 stores large masters when needed externally, generated runtime atlases, and immutable content-addressed binary assets.

## Publication model

1. Generate and validate the visual asset.
2. Verify dimensions, transparency, file size, and SHA-256.
3. Publish the binary to R2 as an immutable content-addressed object.
4. Update the reviewed manifest in Git with the final object metadata.
5. Keep asset publication and product cutover separate when practical.

## Preferred operational pattern

When CI credentials are required to publish assets, use two phases.

### Phase A — publishing branch / operational flow

- Publish generated assets to R2.
- Capture resulting bytes, hashes, keys, and public URLs.
- Do not merge heavyweight operational transport into `main`.

### Phase B — clean product PR

- Update manifest entries.
- Update runtime wiring if needed.
- Update integrity tests and contracts.
- Verify CI and staging.

## Content-addressed naming

Runtime visual assets published to R2 use stable logical IDs and immutable object keys. Example:

- logical ID: `pawnSlug.matthias.machinegun`
- object key: `pawn-slug/matthias/machinegun/matthias_machinegun_canonical_sheet_v3-<sha16>.webp`

## Pawn Slug character families

For multi-weapon characters, first establish one approved visual authority and derive every weapon variant from that same family.

For Matthias specifically:

- the approved pistol-family canonical look is the visual authority;
- machinegun, shotgun, and panzerfaust each use a complete per-weapon atlas;
- every atlas must preserve the same Matthias identity, proportions, uniform, face, cap, and silhouette;
- only the weapon, grip, recoil, and weapon-dependent poses may differ;
- style drift across weapons is a regression even when the runtime technically loads the atlas.


## Runtime promotion is not the same as authoring

For Blender scenes and other large runtime assets, merging the generator/source does **not** mean users are already seeing the new asset.

The application resolves stable logical IDs through `frontend/src/assets/r2-assets-manifest.json`. Until that manifest points to the newly published immutable object, runtime may continue to load an older GLB/atlas even though newer Blender renders or CI artifacts exist.

Therefore treat asset delivery as two distinct proofs:

1. **authored/published**: the generator produced the intended binary and R2 contains it;
2. **promoted/consumed**: the manifest points to that exact object and the real application loaded it.

Never infer the second from the first.

## Exact-byte promotion gate

Before changing a runtime manifest pointer:

- prove the public R2 object exists;
- record byte size and SHA-256;
- when practical, download/read it back and verify the SHA matches the manifest;
- keep the old content-addressed object for rollback;
- update integrity tests that pin the logical ID/hash;
- capture the real application after promotion.

For PR-scoped Blender assets, use the pull-request **head SHA** as the authored revision identity. Do not use an ephemeral synthetic merge SHA as the publication/capture key unless the publishing workflow explicitly created an object for it.

## Visual scenes

Home and War Room require both authoring and runtime evidence:

- Blender preview proves authored geometry/material/light intent;
- application PNG proves GLTF loading, CSP, Three.js material/tone-mapping, framing and overlays;
- mobile capture is required when composition or camera can change.

A render can be correct while runtime is white, dark, mis-pivoted or still loading an older manifest object. Treat those as separate failure domains.
