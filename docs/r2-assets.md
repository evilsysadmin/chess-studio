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
