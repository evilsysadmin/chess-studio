# Native auto-merge delivery invariant

Chess Studio uses GitHub's **native auto-merge** for the PR -> `main` transition. The repository has auto-merge enabled, and the protected required checks decide when a PR is eligible to merge.

There is deliberately no repository workflow that waits for checks and executes `gh pr merge`, and there is no `workflow_run` handoff that redispatches CI. Those layers were removed because merges performed from an Actions `GITHUB_TOKEN` can suppress the normal follow-up `push` workflow and force extra recovery plumbing.

The normal release chain is intentionally boring:

`Quality · CI gate (PR)` -> GitHub native auto-merge -> `push main` -> `Quality · CI gate (main)` -> `Staging · deploy` -> staging accreditation -> `Production · promote`.

## Ownership

- `cicd.yml` validates PRs and normal pushes to `main`.
- GitHub branch protection + native auto-merge own the merge decision.
- `staging-deploy.yml` starts only from a successful `Quality · CI gate` run on `main` and deploys that approved SHA.
- `workflow_dispatch` on `cicd.yml` remains only as a manual operator escape hatch; it is not part of the normal PR delivery path.

When tooling or an operator opens a PR that should merge automatically, it enables GitHub native auto-merge on that PR. No Actions runner needs to stay alive waiting for required checks.

The static contract in `scripts/auto_merge_delivery_contract.py` protects this topology and fails if the retired custom auto-merge or main-handoff workflows are reintroduced.
