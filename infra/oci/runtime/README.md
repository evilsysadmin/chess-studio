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

The default target remains `staging`. The host deploy contract also accepts an explicit `production` target so the same A1 can run a second isolated Compose stack without changing the application image. Production defaults to project `chess-studio-production`, loopback port `4100`, runtime file `/etc/chess-studio/production/backend.env`, and state directory `/var/lib/chess-studio-production`. Staging remains on project `chess-studio-staging`, port `4000`, `/etc/chess-studio/backend.env`, and `/var/lib/chess-studio`. A single host deploy lock serializes both targets because they intentionally share the immutable Git checkout. Staging waits for that lock cooperatively in short intervals: while queued it revalidates `origin/main` and exits cleanly as superseded as soon as a newer generation wins, while production keeps the same bounded lock wait without staging lineage semantics.

## Staging exposure

The P0 public path is Cloudflare Tunnel, not direct A1 ingress. `api-staging.chess-studio.shadowops.dpdns.org` is reconciled only after the backend is locally ready and Cloudflare reports a live connector. The tunnel routes the API to `http://127.0.0.1:4000` and operator SSH at `ssh-chess-studio-staging.shadowops.dpdns.org` to `ssh://127.0.0.1:22`. The A1 public IPv4 is not an application or SSH origin: ports 22, 4000 and 4100 remain closed externally.

The staging Pages reconciler owns only the frontend DNS. `scripts/oci_cloudflare_tunnel.py` owns staging API/SSH tunnel DNS, preventing later frontend deploys from silently reverting those hostnames. Human SSH uses `cloudflared access ssh` plus the host SSH key; automated operations continue to use OCI Run Command. The SSH hostname intentionally stays exactly one label below `shadowops.dpdns.org` so it is covered by the zone's Universal SSL wildcard; tunnel reconciliation proves the edge TLS handshake before reporting success.

## Operator SSH key authorization

Tunnel reachability and host-user authentication are separate contracts. `make oci-a1-ssh-check` proves the Cloudflare DNS/TLS edge, while the already-created A1 must also trust the operator's SSH public key.

Authorize or rotate a local operator key through the existing OCI Run Command control plane:

```bash
make oci-a1-authorize-ssh
```

The helper selects `OCI_SSH_PUBLIC_KEY`, then `${OCI_SSH_KEY}.pub`, then the standard `~/.ssh/id_ed25519.pub`, `id_ecdsa.pub` or `id_rsa.pub`. A non-standard pair can be explicit:

```bash
make oci-a1-authorize-ssh OCI_SSH_PUBLIC_KEY=~/.ssh/chess-studio.pub
make oci-a1-ssh OCI_SSH_KEY=~/.ssh/chess-studio
```

Only the public key crosses OCI Run Command. The private key remains on the operator workstation, public TCP/22 remains closed, and the host-side root capability accepts only a validated public-key file in the fixed `/tmp/chess-studio-operator-key.*` namespace before updating `ubuntu/.ssh/authorized_keys`.

Terraform's optional `ssh_authorized_key` metadata is useful only when an instance is launched with a key. Post-launch authorization and rotation use this Run Command path so repairing human access never requires exposing SSH directly to the Internet.

## Operator Docker access

The human operator account is `ubuntu`. Bootstrap, one-time adoption and every immutable deploy reconcile `ubuntu` into the host `docker` group, so routine diagnostics such as `docker ps` and `docker compose ps` do not require a `sudo` prefix.

Membership in the Docker group is effectively root-equivalent on the host. This access is therefore deliberate only for the trusted operator account; application/service users do not receive it. A session that was already open before the group change must reconnect (or otherwise refresh supplementary groups) before the new membership is visible.


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


## Shared Cloudflare Tunnel route

The existing outbound-only Cloudflare Tunnel now owns two explicit ingress rules on the same A1 connector: staging API -> `127.0.0.1:4000` and temporary production API -> `127.0.0.1:4100`. Adding the production ingress does not switch traffic by itself. `scripts/oci_production_tunnel.py prepare` only reconciles tunnel configuration and proves a live connector; `activate --sha <SHA>` performs the production CNAME cutover only after the exact OCI backend is already healthy, while `render --sha <SHA>` restores the production CNAME to Render and re-attests the known-good SHA.


## Production backup durability

Production Mongo dumps do not depend only on the A1 block volume. Terraform provisions a private, versioned `chess-studio-production-backups` Object Storage bucket and grants the A1 Instance Principal object access only to that bucket. The backup wrapper first creates the local archive, validates it with `mongorestore --dryRun`, writes the SHA-256 manifest, then uploads `dump.archive.gz`, `SHA256SUMS` and `manifest.json` under an immutable timestamped prefix. The archive PUT carries an OCI SHA-256 checksum so Object Storage rejects corrupted transfer; the wrapper then verifies remote size, metadata and manifest before any local generation is pruned. Local retention remains 2 successful copies; remote retention keeps 8 weekly generations and deletes exact historical version IDs for expired prefixes so bucket versioning cannot silently retain unbounded old dumps. A restore drill is still required before backup/restore readiness is considered closed.
