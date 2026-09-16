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

`docker-compose.yml` resolves that exact artifact through the minimal `backend-image.Dockerfile` and retags it locally as:

`chess-studio-backend:oci-<SHA>`

The local tag deliberately preserves the existing rollback contract while moving the expensive Python image build off the A1. A missing remote image fails during image preparation before the currently served backend is replaced.

The host port defaults to `127.0.0.1:4000`; no public backend ingress is introduced here. Runtime secrets stay in `/etc/chess-studio/backend.env` (or `CHESS_STUDIO_ENV_FILE`) and never enter Git, Compose, Terraform state, registry images, or Run Command payloads.

The Compose project defaults to `chess-studio-staging`. `CHESS_STUDIO_COMPOSE_PROJECT`, `CHESS_STUDIO_BACKEND_PORT`, and `CHESS_STUDIO_ENV_FILE` are parameterized so a later production stack can coexist without changing the application image.

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

The wrapper prepares the exact prebuilt GHCR image before replacement, starts the new Compose service, requires Mongo readiness and exact build identity, persists the successful SHA, and attempts rollback to the previous immutable local image if the new deployment fails attestation.
