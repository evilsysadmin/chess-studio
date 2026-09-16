# OCI staging secret lifecycle

Status: **target contract for retiring Render staging as a runtime-config dependency**.

Issue: #2306.

## Decision

OCI Vault is the editable source of truth for staging secrets. `/etc/chess-studio/backend.env` is only a generated runtime artifact and must never become the human-maintained secret store.

The normal application deploy must eventually stop reading Render staging entirely. Render production remains untouched by this migration.

## Operator workflow

Initial operation is deliberately explicit and boring:

1. Open OCI Console → Vault → Secrets.
2. Select the staging secret.
3. Create a new secret version.
4. For risky rotations, create it as `PENDING` first.
5. Validate the dependent external service when required.
6. Promote the intended version to `CURRENT`.
7. Run the staging runtime-sync workflow.
8. Let automation regenerate `/etc/chess-studio/backend.env`, restart only the required services and verify readiness/telemetry.

Rollback is the inverse: promote the previous version back to `CURRENT`, then runtime-sync again.

No SSH edit of `/etc/chess-studio/backend.env` is part of normal secret lifecycle.

## Secret inventory

The migration uses one Vault secret per independently rotatable value. Stable names:

| Environment key | OCI secret name | Notes |
| --- | --- | --- |
| `MONGO_URL` | `chess-studio-staging-mongo-url` | Secret connection string. |
| `JWT_SECRET` | `chess-studio-staging-jwt-secret` | Authentication signing secret. Rotation requires compatibility planning for existing tokens. |
| `INVITE_CODE` | `chess-studio-staging-invite-code` | Keep secret while invite-gated registration exists. |
| `CHESS_AI_SHARED_SECRET` | `chess-studio-staging-ai-shared-secret` | Coordinate rotation with the staging AI Worker. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `chess-studio-staging-otel-headers` | Grafana Cloud authorization header(s). |

If a future value is genuinely secret, add it explicitly to this table and to the runtime allowlist. Do not dump arbitrary environment keys into Vault.

## Non-secret runtime configuration

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
- `OTEL_EXPORTER_OTLP_ENDPOINT`

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

## IAM boundary

The staging instance dynamic group may read secret bundles only inside the staging compartment. It does not receive `manage secret-family`, key-management rights, or permission to create/rotate secrets.

Human/operator secret editing remains outside the VM. The VM is a consumer only.

## Migration sequence

1. Land the Vault read IAM contract with no runtime cutover.
2. Add a Vault reader/runtime renderer with self-tests and strict key/name mapping.
3. Add explicit `validate` and `apply` runtime-sync operations.
4. Manually create/populate the staging secrets in OCI Vault.
5. Compare generated runtime shape with the current Render-derived runtime without logging values.
6. Switch normal staging deploy to consume the existing generated runtime without querying Render.
7. Prove backend, Mongo, Cloudflare Tunnel and Grafana OTLP with Render staging stopped.
8. Keep Render staging stopped for a reversible observation period.
9. Remove obsolete Render staging integration and delete the service only after repository-wide dependency search is clean.

## Exit criteria

Render staging can be considered retired only when:

- a clean OCI staging deploy succeeds while Render staging is stopped;
- secret rotation is Vault version change + runtime-sync, with no host editing;
- previous secret versions can be restored safely;
- Mongo readiness, exact release SHA and Grafana telemetry remain accredited;
- no secret value is present in Git, Terraform state, Run Command payloads or CI logs;
- Render production remains independent and unchanged.
