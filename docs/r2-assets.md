# R2 assets

Chess Studio keeps large, generated runtime assets out of normal Git history. The public asset origin is reconciled from `infra/cloudflare/r2-assets.json` by `scripts/cloudflare_r2_assets.py`.

## Provisioned surface

- Bucket: `chess-studio-assets`
- Public custom domain: `https://assets.chess-studio.shadowops.dpdns.org`
- Location hint: Western Europe (`weur`)
- Storage class: `Standard`
- Public `r2.dev` endpoint: disabled
- CORS: public read (`GET`, `HEAD`); this is intentional because these are public static game assets.

`weur` is only a placement hint, not an EU data-residency guarantee. These assets are public application content, not user data. If a future private/source bucket needs residency guarantees, create it separately with an explicit R2 jurisdiction.

## Authentication and permissions

The infra reconciler reuses the existing GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

No R2 Access Key/Secret is needed to create or configure the bucket. The Cloudflare API token must include account-level `Workers R2 Storage Write`; resolving the existing `shadowops.dpdns.org` zone also needs the zone-read permission already used by the production Cloudflare workflow.

Cloudflare R2 must be enabled for the account. If the account/token is not ready, the workflow fails before pretending the infrastructure is healthy.

## Why this is not a Terraform custom-domain resource yet

The current production Cloudflare Terraform job rebuilds local state on each Actions run and imports existing resources before planning. R2 buckets support Terraform import, but R2 custom domains currently do not. A state-less Terraform custom-domain resource would therefore work on first creation and then try to create the same domain again on later runs.

The small reconciler is deliberately idempotent and uses Cloudflare's REST API for this resource set. If Cloudflare state is moved to a durable remote backend later, these resources can be migrated into Terraform without changing the public origin.

## Upload credentials come in the next layer

Provisioning and object publishing are separate concerns. For bulk/large object publishing, prefer a dedicated bucket-scoped R2 token with Object Read & Write permission rather than reusing the broad Terraform token. Store it as CI/local publisher credentials, never in Git or Terraform state.

The publisher should use content-addressed object names and immutable cache headers, for example:

`images/home/castle-a82d761c.avif`

with `Cache-Control: public, max-age=31536000, immutable`. A small manifest in Git can then map logical asset names to immutable R2 objects.


## Storage budget and retention

The repository owns an automatic retention policy for the public asset bucket.

- Early-warning threshold: **5.0 GB** (GitHub issue + Actions warning).
- Cleanup target after pressure: **5.5 GB**.
- Soft ceiling / new CLI publication guard: **7.0 GB**.
- Immutable assets receive a **7-day** grace period.
- Keep one rollback generation per ordinary content-addressed family.
- Fully unreferenced content-addressed families age out completely after **45 days**.
- Keep one staging revision and two runtime revisions per revision journal.
- Old `_smoke/` objects expire after one day.
- Prefixes explicitly marked `deprecated/` or `_deprecated/` age out after the grace period unless they are still runtime-pinned.
- Matthias repair source families (`pose-semantics-v1/` and the `machinegun/run13/` continuity input) have explicit protected prefixes. These older source URLs are composed through Python constants, so a scanner that only recognizes complete literal URLs may miss them. This protects existing objects from future GC runs; it **cannot restore** an object already missing from R2.
- A single pass is limited to 1,000 objects and 70% of observed bucket bytes.

`scripts/r2_asset_gc.py` inventories R2, protects the reviewed manifest, hard-coded runtime R2 URLs and stable `current.*` aliases, then prunes only safely classified stale objects. Capacity pressure may prune old rollback copies, but never active pins.

The audit report also separates hard-coded URL pins that are referenced by runtime source from objects kept alive only by operational surfaces such as `scripts/`, `e2e/` or `.github/`. That classification is observational only: tooling-only pins remain protected until a dedicated reviewed cleanup explicitly retires them.

`Infra · R2 assets` runs the retention pass daily and when the R2 surface changes on `main`, and publishes a JSON audit report and a measured-storage summary. From 5 GB it opens/updates one deduplicated GitHub issue (`[R2] Storage capacity warning`), auto-closing it below 5 GB. At 7 GB remaining after the cleanup pass the governance check fails. The collector always protects active assets and will fail closed if safe candidates are exhausted.

Normal `scripts/r2_asset_publish.py publish` checks the live R2 inventory **before PUT** and rejects uploads projected above 7 GB. Re-uploading an existing content-addressed object counts only the net size difference. In a local emergency, an operator may explicitly use `R2_STORAGE_BUDGET_OVERRIDE=1`; this prints a warning and should never be enabled as a CI default. The check also protects Pawn Slug and Chess Football Godot Web bundles: it budgets the **entire release plus current pointer** before uploading its first object. Other direct/manual R2 upload paths can still bypass admission, so scheduled inventory alerts remain essential. Admission is a preflight, not an atomic cross-workflow reservation; concurrent publishers must still be controlled operationally. A malformed/unavailable inventory blocks the guarded publication rather than assuming free space.

**Billing note:** Cloudflare GB-months are calculated from daily storage measurements, not the instantaneous bucket size; a later cleanup cannot undo an earlier day's high-water mark. The live 5/7 GB thresholds control future growth but cannot guarantee that an already-accumulated billing period remains inside the free allowance.


### Immutable Godot Web bundles

`pawn-slug-godot/current.json` and `chess-football-godot/current.json` are authoritative pointers for their current Web exports. Before deleting release directories, the GC reads and validates those pointers directly from R2.

The active release directory is protected in full, and one previous release is retained for rollback. Older releases become eligible after one day. If a pointer cannot be fetched or validated, the entire corresponding release root is protected for that run instead of guessing.
