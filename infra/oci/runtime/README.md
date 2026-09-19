# OCI existing A1 runtime · P0

This runtime is the emergency path away from Render build-minute exhaustion. It deliberately **adopts the existing OCI Ampere A1** instead of provisioning, replacing, or destroying compute.

## P0 order

1. Adopt the existing A1 with Docker Compose.
2. Deploy the current backend unchanged from an immutable CI-approved SHA.
3. Keep FastAPI on host loopback only and preserve the existing private runtime environment.
4. Prove `/api/ready` (`storage=mongo`) and `/api/release` (`build=<SHA>`).
5. Move staging traffic from Render to OCI.
6. Move production only after staging is green and rollback is exercised.

A second A1 for pragmatic host redundancy is a later iteration. k3s/Argo CD is also post-cutover work; neither is allowed to delay this P0.

## Runtime

`Main · admission` publishes the CI-approved backend for `linux/arm64` as an immutable GHCR tag:

`ghcr.io/evilsysadmin/chess-studio-backend:oci-<SHA>`

The A1 no longer invokes BuildKit merely to retag that already-built artifact. The deploy wrapper performs one explicit `docker pull` of the immutable SHA-tag **before** touching the serving container. `docker-compose.yml` then references that same GHCR image directly with `pull_policy: never`, so `docker compose up` is an offline/fail-closed replacement step rather than a second network mutation.

A missing remote image therefore fails before the currently served backend is replaced. Successful images remain in the local Docker cache and are valid rollback targets. The rollback helper also recognizes the older local `chess-studio-backend:oci-<SHA>` tags so the migration from the previous retagging flow remains backwards-compatible.

The host port defaults to `127.0.0.1:4000`; no public backend ingress is introduced here. Runtime secrets stay in `/etc/chess-studio/backend.env` (or `CHESS_STUDIO_ENV_FILE`) and never enter Git, Compose, Terraform state, registry images, or Run Command payloads.

The default target remains `staging`. The host deploy contract also accepts an explicit `production` target so the same A1 can run a second isolated Compose stack without changing the application image. Production defaults to project `chess-studio-production`, loopback port `4100`, runtime file `/etc/chess-studio/production/backend.env`, and state directory `/var/lib/chess-studio-production`. Staging remains on project `chess-studio-staging`, port `4000`, `/etc/chess-studio/backend.env`, and `/var/lib/chess-studio`. A single host deploy lock serializes both targets because they intentionally share the immutable Git checkout.

## Staging exposure

The P0 public path is Cloudflare Tunnel, not direct A1 ingress. `api-staging.chess-studio.shadowops.dpdns.org` is reconciled only after the backend is locally ready and Cloudflare reports a live connector. The tunnel routes to `http://127.0.0.1:4000`; the A1 public IPv4 is not an application origin and port 4000 stays closed externally.

The staging Pages reconciler owns only the frontend DNS. `scripts/oci_cloudflare_tunnel.py` owns staging API DNS, preventing later frontend deploys from silently reverting the API hostname to Render.

## One-time adoption of the existing A1

Cloud-init does not rerun on an already-created VM, so the legacy systemd + `docker run` host needs one explicit adoption step after this PR is merged:

```bash
cd /opt/chess-studio/repo
sudo bash scripts/oci_existing_a1_install.sh <CI_APPROVED_40_CHAR_SHA>
```

The installer:

- requires the existing private backend env;
- installs Docker Compose v2 only if absent;
- preserves the currently served build/image as the first rollback target when its SHA is known;
- disables the legacy `chess-studio-backend.service` without deleting it;
- installs `/usr/local/sbin/chess-studio-deploy` as the new Compose deploy wrapper;
- immediately deploys and attests the requested immutable SHA.

Existing OCI Run Command orchestration keeps working because it already invokes `/usr/local/sbin/chess-studio-deploy <SHA>` through the restricted sudoers rule.

## Normal deploy

After adoption, the existing GitHub/OCI Run Command path can continue calling:

```bash
sudo /usr/local/sbin/chess-studio-deploy <CI_APPROVED_40_CHAR_SHA>
```

The wrapper checks out the exact runtime contract, pulls the exact prebuilt GHCR image, starts the new Compose service without building or pulling during `up`, requires Mongo readiness plus exact build identity and CORS, persists the successful SHA, and attempts rollback to the previous immutable cached image if the new deployment fails attestation.


## Temporary production target

The installed wrapper remains backwards compatible:

```bash
sudo /usr/local/sbin/chess-studio-deploy <SHA>                 # staging
sudo /usr/local/sbin/chess-studio-deploy production <SHA>      # production
```

A staging deploy refreshes the stable wrapper from the accredited repository revision, so the host can learn the target-aware contract without reprovisioning the A1. Production deployment in this layer is deliberately local-only: it validates Mongo readiness, exact build identity and production CORS on loopback, but does not mutate the staging tunnel, staging deploy watcher, staging signal timer or K3s assets. Public production cutover is a separate guarded step.


## Isolated production runtime snapshot

Temporary production uses a separate root-owned env file at `/etc/chess-studio/production/backend.env`. The one-time `production-runtime-bootstrap` operation reads the already-guarded Render production service and stores only the allow-listed backend runtime as the encrypted Vault secret `chess-studio-production-runtime-env`. The plaintext payload is never written to Git, Terraform state, GitHub output, or OCI Run Command.

`production-runtime-sync` asks the A1 to fetch that CURRENT secret with its Instance Principal, validates `MONGO_DB_NAME=chess_study`, `ENVIRONMENT=production`, production CORS and the absence of staging targets, then installs it mode 0600 through the narrow root-owned installer. Staging remains at `/etc/chess-studio/backend.env` with `MONGO_DB_NAME=chess_study_staging`.
