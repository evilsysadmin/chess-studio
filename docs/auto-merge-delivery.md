# Native auto-merge delivery invariant

Chess Studio uses GitHub's **native auto-merge** for the PR -> `main` transition. The repository has auto-merge enabled, and the protected required checks decide when a PR is eligible to merge.

There is deliberately no repository workflow that waits for checks and executes `gh pr merge`, and there is no custom handoff that redispatches the expensive quality suite after merge. Those layers were removed because merges performed from an Actions `GITHUB_TOKEN` can suppress the normal follow-up `push` workflow and because rerunning the same browser/backend/security suites on `main` wastes runner time after an already-accredited PR.

The normal release chain is intentionally boring:

`Quality · CI gate (PR)` -> GitHub native auto-merge -> `push main` -> `Main · admission` -> `Deploy to staging` -> staging accreditation -> `Production · promote`.

## Ownership

- `cicd.yml` validates PRs. It does **not** rerun the full quality suite on ordinary pushes to `main`.
- Each PR Quality run publishes an immutable `quality-provenance` receipt for the exact synthetic merge SHA it tested, including its real base and head parents.
- GitHub branch protection + native auto-merge own the merge decision.
- `main-admission.yml` runs on the final `main` SHA and reuses the green PR gate only when the receipt proves that the tested base is exactly the final commit's first parent and the required checks are accredited. Ambiguity fails closed.
- `staging-deploy.yml` starts only from a successful `Main · admission` run and deploys that approved SHA.
- `workflow_dispatch` on `cicd.yml` remains only as a manual operator escape hatch; it is not part of the normal PR delivery path.

When tooling or an operator opens a PR that should merge automatically, it enables GitHub native auto-merge on that PR. No Actions runner needs to stay alive waiting for required checks, and the expensive Quality suite is paid once per normal change rather than once on the PR and again on `main`.

The static delivery contracts protect this topology and the staging exact-SHA handoff. `Main · admission` is intentionally fail-closed: a direct push, stale provenance receipt, missing required check, ambiguous PR association, or unreadable artifact blocks staging instead of silently deploying an unaccredited generation.


## Operator / agent workflow

Repository automation and human/agent workflow deliberately complement each other:

- Open every new PR as **Draft**.
- Keep it Draft while required checks are pending, cancelled or red. Fix failures in the same PR instead of opening a replacement just to obtain a fresh CI run.
- Do not busy-wait on Actions. Once a Draft PR is functionally complete and CI is running, move to the next useful, naturally related slice. Up to five PRs may be rotated in one chat/work session before a mandatory review pass.
- Before pushing the next PR, take a small checkpoint on the previous ones: metadata/check status only. Green required checks allow **Ready for review**; red checks require a targeted fix; pending remains Draft.
- Enable/verify native auto-merge only after the PR is Ready for review.
- After merge, inspect the relevant post-merge chain (Main admission, staging deployment/accreditation and any surface-specific smoke). A PR is not operationally finished merely because GitHub merged it.

### GitHub access discipline

The preferred repository path is the GitHub/git connector. If it is not initially exposed, **rediscover it before declaring repository access unavailable**.

Keep connector traffic intentionally small:

- reuse locally downloaded/cached artifacts and source already read;
- prefer metadata, checks, SHA, compare stats and exact small files;
- avoid repeated large `fetch_file`, full diffs/patches and broad searches that return the same context again;
- prepare the change locally/in memory, then perform the minimum write needed for commit/PR;
- use targeted job/step logs only after a check actually fails.

This is an operational efficiency rule, not a reason to skip evidence. Exact-SHA delivery, required checks and artifact review remain mandatory.
