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

## War Room GLB CDN Cache Rule · dedicated credential

The `War Room · immutable GLB edge cache rule` GitHub workflow manages **one narrowly scoped Cache Rule** for precisely two content-addressed V3/V4 `.glb` URLs on the R2 custom domain. The rule does not cover mutable `current.glb`, JSON, APIs or other asset paths. It requires the Cloudflare **zone Rulesets/Cache Rules** API, which is a different permission surface from R2 object publishing.

**Verified incident:** #5743 `main` run [39018340871](https://github.com/evilsysadmin/chess-studio/actions/runs/39018340871) failed with `GET /zones/{zone}/rulesets/phases/http_request_cache_settings/entrypoint → HTTP 403 / code 10000 Authentication error`. The Cloudflare variables were present; the existing token simply lacked authority for that request. The public edge probe still returned `DYNAMIC → DYNAMIC` for V3 and V4.

**Least-privilege setup (a Cloudflare/GitHub administrator must do this):**

1. In Cloudflare, create an API token for **Zone → Cache Rules → Edit**, restricted to the `shadowops.dpdns.org` zone. Allow the zone-read access necessary to resolve that zone. Consult Cloudflare's current Cache Rules API permission reference if this account also requires Account Rulesets/Filter Lists permissions. Do not grant access to other zones unnecessarily.
2. In the repository's **Settings → Secrets and variables → Actions**, create/update the repository secret **`CLOUDFLARE_CACHE_RULES_TOKEN`** using that token. **Never** paste its value into an issue, a PR, application logs or a chat.
3. The dedicated token now takes precedence over `CLOUDFLARE_API_TOKEN` **only in this one workflow**. If the dedicated secret is absent, the previous shared token remains a fallback for backwards compatibility; it will still fail until it has sufficient privileges.
4. From GitHub **Actions → War Room · immutable GLB edge cache rule → Run workflow** (main branch), verify the `Reconcile narrow Cloudflare GLB Cache Rule` job fully succeeds. The job reads the managed rule back and requires a second true **`CF-Cache-Status: HIT`** from real uncached GET requests to **both** exact V3/V4 URLs.
5. Do not close [issue #5739](https://github.com/evilsysadmin/chess-studio/issues/5739) or claim edge savings until the above checks pass. GitHub's cache-rule PR self-test passing is not evidence that the `main` mutation succeeded.

Official reference: https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/.

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
- The five exact historical Matthias repair inputs use `retention.protectedKeys` (exact object keys), not broad protected prefixes. This preserves any existing archival source with an approved SHA without retaining every unrelated generation in the same directory. They are composed dynamically by Python and may escape literal-URL scanning. An exact pin cannot restore a missing R2 object; historical source recovery is tracked in #5259.
- The Pawn Slug sprite-smoke CI audits **published runtime** atlas bytes using content-addressed SHA-256, 8×18 geometry, complete frame coverage, and pistol head-cut metrics. It does not automatically republish derived pose-semantics or head-integrity historical generations on routine main pushes. The original head-integrity reconstruction tool remains available for explicit, reviewed archival rebuilds, but its pinned historical R2 sources must first be recovered if missing (tracked in #5259).
- A single pass is limited to 1,000 objects and 70% of observed bucket bytes.

`scripts/r2_asset_gc.py` inventories R2, protects the reviewed manifest, hard-coded runtime R2 URLs and stable `current.*` aliases, then prunes only safely classified stale objects. Capacity pressure may prune old rollback copies, but never active pins.

The audit report also separates hard-coded URL pins that are referenced by runtime source from objects kept alive only by operational surfaces such as `scripts/`, `e2e/` or `.github/`. That classification is observational only: tooling-only pins remain protected until a dedicated reviewed cleanup explicitly retires them.

`Infra · R2 assets` runs the retention pass daily and when the R2 surface changes on `main`, and publishes a JSON audit report and a measured-storage summary. From 5 GB it opens/updates one deduplicated GitHub issue (`[R2] Storage capacity warning`), auto-closing it below 5 GB. At 7 GB remaining after the cleanup pass the governance check fails. The collector always protects active assets and will fail closed if safe candidates are exhausted.

Normal `scripts/r2_asset_publish.py publish` checks the live R2 inventory **before PUT** and rejects uploads projected above 7 GB. Re-uploading an existing content-addressed object counts only the net size difference. In a local emergency, an operator may explicitly use `R2_STORAGE_BUDGET_OVERRIDE=1`; this prints a warning and should never be enabled as a CI default. The check also protects Pawn Slug and Chess Football Godot Web bundles: it budgets the **entire release plus current pointer** before uploading its first object. Other direct/manual R2 upload paths can still bypass admission, so scheduled inventory alerts remain essential. Admission is a preflight, not an atomic cross-workflow reservation; concurrent publishers must still be controlled operationally. A malformed/unavailable inventory blocks the guarded publication rather than assuming free space.

**Billing note:** Cloudflare GB-months are calculated from daily storage measurements, not the instantaneous bucket size; a later cleanup cannot undo an earlier day's high-water mark. The live 5/7 GB thresholds control future growth but cannot guarantee that an already-accumulated billing period remains inside the free allowance.


### Immutable Godot Web bundles

`pawn-slug-godot/current.json` and `chess-football-godot/current.json` are authoritative pointers for their current Web exports. Before deleting release directories, the GC reads and validates those pointers directly from R2.

The active release directory and **two previous complete releases** are retained for rollback and open tabs. Any additional release remains intact for **at least seven days** after its most recent object publication. Duplicate-hash cleanup, revision cleanup and capacity-pressure pruning must not delete individual files from these protected release bundles; if this means R2 remains above its soft limit, the retention audit reports the pressure rather than breaking a running Godot game. This is a bounded compatibility window, not an indefinite promise for tabs kept open for weeks. If a pointer cannot be fetched or validated, the entire corresponding release root is protected for that run instead of guessing.
