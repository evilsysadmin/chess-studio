# Native auto-merge delivery invariant

Chess Studio uses GitHub's **native auto-merge** for the PR -> `main` transition. The repository has auto-merge enabled, and the protected required checks decide when a PR is eligible to merge.

There is deliberately no repository workflow that waits for checks and executes `gh pr merge`, and there is no custom handoff that redispatches the expensive quality suite after merge. Those layers were removed because merges performed from an Actions `GITHUB_TOKEN` can suppress the normal follow-up `push` workflow and because rerunning the same browser/backend/security suites on `main` wastes runner time after an already-accredited PR.

The normal release chain is intentionally boring:

`Quality · CI gate (PR)` -> GitHub native auto-merge -> `push main` -> `Main · admission` -> `Staging · deploy` -> staging accreditation -> `Production · promote`.

## Ownership

- `cicd.yml` validates PRs. It does **not** rerun the full quality suite on ordinary pushes to `main`.
- Each PR Quality run publishes an immutable `quality-provenance` receipt for the exact synthetic merge SHA it tested, including its real base and head parents.
- GitHub branch protection + native auto-merge own the merge decision.
- `main-admission.yml` runs on the final `main` SHA and reuses the green PR gate only when the receipt proves that the tested base is exactly the final commit's first parent and the required checks are accredited. Ambiguity fails closed.
- `staging-deploy.yml` starts only from a successful `Main · admission` run and deploys that approved SHA.
- `workflow_dispatch` on `cicd.yml` remains only as a manual operator escape hatch; it is not part of the normal PR delivery path.

When tooling or an operator opens a PR that should merge automatically, it enables GitHub native auto-merge on that PR. No Actions runner needs to stay alive waiting for required checks, and the expensive Quality suite is paid once per normal change rather than once on the PR and again on `main`.

The static delivery contracts protect this topology and the staging exact-SHA handoff. `Main · admission` is intentionally fail-closed: a direct push, stale provenance receipt, missing required check, ambiguous PR association, or unreadable artifact blocks staging instead of silently deploying an unaccredited generation.
