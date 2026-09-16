# OCI staging secret lifecycle

Status: **target contract for retiring Render staging as a runtime-config dependency**.

Issue: #2306.

## Decision

OCI Vault is the editable source of truth for staging secrets. `/etc/chess-studio/backend.env` is only a generated runtime artifact and must never become the human-maintained secret store.

Terraform creates the staging Vault, its master encryption key and read-only runtime IAM. Terraform deliberately does **not** create secret values or secret versions: plaintext secret material must never enter Terraform variables, plans or state.

The normal application deploy must eventually stop reading Render staging entirely. Render production remains untouched by this migration.

## Terraform-owned infrastructure

`infra/oci/staging` owns:

- Vault `chess-studio-staging`, type `DEFAULT`;
- HSM-backed AES-256 key `chess-studio-staging-secrets`;
- lifecycle protection against accidental Terraform destruction of the Vault/key;
- the A1 dynamic group and read-only `secret-bundles` permission;
- outputs containing the Vault/key OCIDs for operator handoff.

A Virtual Private Vault is intentionally not used: Chess Studio staging does not need a dedicated HSM partition, and the shared `DEFAULT` Vault avoids that unnecessary cost/isolation tier.

## Operator workflow

Initial population is deliberately explicit and boring:

1. Apply the staging Terraform so the Vault/key exist.
2. Open OCI Console → Identity & Security → Secret Management.
3. Create each staging runtime value using the Terraform-managed Vault and key.
4. Paste the value manually; do not pass it through Terraform.
5. Run `OCI staging · service control` → `vault-validate` to prove the A1 can read every `CURRENT` value.

For a later rotation:

1. Create a new version of exactly one runtime value as `PENDING`.
2. Run `vault-validate-pending` and select that environment key. The A1 reads `PENDING` only for the selected key and `CURRENT` for every other key.
3. A later transactional apply gate will exercise that candidate against the backend before promotion.
4. Promote the proven version to `CURRENT` only after the target runtime accepts it.

Until the transactional apply gate lands, `vault-validate-pending` is validation-only and never rewrites `/etc/chess-studio/backend.env`.

No SSH edit of `/etc/chess-studio/backend.env` is part of normal secret lifecycle.

## Vault runtime inventory

The migration uses one Vault entry per independently rotatable or environment-specific runtime value. Stable names:

| Environment key | OCI secret name | Notes |
| --- | --- | --- |
| `MONGO_URL` | `chess-studio-staging-mongo-url` | Secret connection string. |
| `JWT_SECRET` | `chess-studio-staging-jwt-secret` | Authentication signing secret. Rotation requires compatibility planning for existing tokens. |
| `INVITE_CODE` | `chess-studio-staging-invite-code` | Keep secret while invite-gated registration exists. |
| `CHESS_AI_SHARED_SECRET` | `chess-studio-staging-ai-shared-secret` | Coordinate rotation with the staging AI Worker. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `chess-studio-staging-otel-endpoint` | Not credential material, but kept with the Grafana runtime pair so staging no longer depends on Render for an environment-specific endpoint. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `chess-studio-staging-otel-headers` | Grafana Cloud authorization header(s). |

If a future value belongs in the Vault runtime contract, add it explicitly to this table and to the strict runtime mapping. Do not dump arbitrary environment keys into Vault.

## Declarative non-secret runtime configuration

These values are configuration, not secrets, and should remain declarative/versioned rather than being hidden in Vault:

- `MONGO_DB_NAME`
- `ENVIRONMENT`
- `EXPOSE_API_DOCS`
- `ALLOW_REGISTRATION`
- `ENABLE_EMAIL_RECOVERY`
- `ADMIN_USERNAMES`
- `CF_AI_WORKER_URL`
- `CORS_ORIGINS`
- `OTEL_SERVICE_NAME`
- `OTEL_TRACES_ENABLED`
- `OTEL_METRICS_ENABLED`
- `OTEL_LOGS_ENABLED`
- `OTEL_EXPORTER_OTLP_PROTOCOL`

The exact declarative source will be introduced before the Render dependency is removed. Until then the existing Render runtime-sync remains the temporary migration bridge.

## Runtime materialization contract

The target flow is:

```text
Git/config (non-secret values)        OCI Vault (CURRENT secret versions)
              \                         /
               \                       /
                +-- A1 Instance Principal --+
                              |
                              v
                  validated temporary env
                              |
                              v
                 /etc/chess-studio/backend.env
                    root:root · mode 0600
                              |
                    +---------+---------+
                    |                   |
                  FastAPI              Alloy
```

Requirements:

- The A1 reads Vault through its existing instance-principal dynamic group.
- Secret values never enter GitHub Run Command payloads, Terraform variables/state, workflow summaries or logs.
- Generated runtime files are written to a temporary path, validated against a strict allowlist, then atomically installed as root-owned mode `0600`.
- Deploying a new application SHA does not implicitly rotate or rewrite secrets.
- Runtime sync and application deploy are separate operations.
- A candidate rotation is tested from `PENDING` while the known-good values remain `CURRENT`; promotion is the commit point.

## IAM boundary

The staging instance dynamic group may read secret bundles only inside the staging compartment. It does not receive `manage secret-family`, key-management rights, or permission to create/rotate secrets.

Human/operator secret editing remains outside the VM. The VM is a consumer only.

## Migration sequence

1. Land the Terraform-managed Vault/key and Vault read IAM contract with no runtime cutover.
2. Add CURRENT and selective-PENDING Vault validation with self-tests and strict key/name mapping.
3. Add a transactional candidate apply that restores CURRENT on failed backend/telemetry attestation.
4. Manually create/populate the staging Vault values.
5. Compare generated runtime shape with the current Render-derived runtime without logging values.
6. Switch normal staging deploy to consume Vault-derived runtime without querying Render.
7. Prove backend, Mongo, Cloudflare Tunnel and Grafana OTLP with Render staging stopped.
8. Keep Render staging stopped for a reversible observation period.
9. Remove obsolete Render staging integration and delete the service only after repository-wide dependency search is clean.

## Exit criteria

Render staging can be considered retired only when:

- a clean OCI staging deploy succeeds while Render staging is stopped;
- secret rotation is PENDING candidate → verified apply → CURRENT promotion, with no host editing;
- a failed candidate restores the known-good CURRENT runtime automatically;
- Mongo readiness, exact release SHA and Grafana telemetry remain accredited;
- no secret value is present in Git, Terraform state, Run Command payloads or CI logs;
- Render production remains independent and unchanged.
