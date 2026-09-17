# Flux seam for OCI staging

This directory defines the **dormant** GitOps seam for the single-node OCI/K3s staging host. It does not install Flux and must not mutate the cluster from CI merely because these files change.

Ownership stays deliberately split:

- Terraform owns OCI infrastructure and machine selection.
- K3s owns the Kubernetes runtime on the A1 host.
- This Flux seam will own Kubernetes desired state only after an explicit activation PR.
- Docker/systemd staging remains the fallback until the GitOps path passes repeated restore and rollback drills.

## Minimal controller profile

The pinned profile is intentionally limited to:

- `source-controller`
- `kustomize-controller`

No Helm controller, notification controller, image automation controller, source-watcher, Headlamp or cloudflared workload is admitted by this seam yet.

`versions.env` is the source of truth for the Flux CLI version, Linux amd64/ARM64 archive checksums, exact controller list, namespace and resource admission thresholds.

Changes to this dormant seam are validated by the protected static preflight: `scripts/workflow_static_contracts.py` runs the Flux contract and admission self-test before any conditional OCI/Terraform work. The seam is deliberately **not** wired into `oci-readiness.yml`, so changing pins, documentation or pure admission logic does not trigger the ARM64 backend smoke or any K3s publication path.

## Protected export contract

The protected static preflight also invokes `scripts/oci_flux_export.py --ci-if-required`. It stays offline and exits immediately for unrelated/local runs, but on a pull request that changes the Flux seam it:

- downloads the pinned Flux CLI archive for the runner architecture and verifies the pinned SHA-256 before extraction;
- runs `flux install --export` for exactly `source-controller,kustomize-controller` in `flux-system`;
- uses an intentionally missing `KUBECONFIG`, proving this step does not require cluster access;
- exports twice and requires byte-identical output;
- rejects extra Flux controllers, Secrets or any component profile outside the minimal seam;
- never runs `kubectl`, never installs Flux and never mutates the A1 host.

The amd64 checksum exists for protected GitHub-hosted CI. The ARM64 checksum remains the target-host pin for the OCI A1 path.

## Admission before any future install

A later activation workflow must first obtain the read-only `OCI_K3S_STATUS_OK` snapshot and pass it through `scripts/oci_flux_admission.py`. The cluster is eligible only when:

- K3s is active and enabled.
- the lifecycle approval is valid.
- the node is Ready.
- required system deployments are Ready.
- at least 4096 MiB of memory is available.
- at least 32768 MiB of disk is free.

Failure is fail-closed: no Flux mutation should occur.

## Future activation contract

When activation is introduced in a separate PR, the intended shape is:

1. obtain the pinned Flux Linux ARM64 CLI and verify its SHA-256;
2. reuse the proven minimal export profile for exactly `source-controller,kustomize-controller` in `flux-system`;
3. validate the exported manifests against the live K3s API in a separate no-write gate;
4. install only from an explicit, serialized OCI staging mutation path;
5. re-run the K3s status/resource probe and Docker staging accreditation;
6. keep rollback independent of Terraform lifecycle.

Do not add Terraform Kubernetes/Helm providers, plaintext secrets, public Kubernetes API exposure, NodePorts or LoadBalancers as part of this seam.
