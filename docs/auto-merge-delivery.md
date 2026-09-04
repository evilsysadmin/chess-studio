# Auto-merge delivery invariant

`PR · auto-merge` authenticates with the repository `GITHUB_TOKEN`. GitHub suppresses workflow runs caused by ordinary events emitted by that token, including the `push` produced by the merge.

Therefore the auto-merge workflow must explicitly dispatch `cicd.yml` on `main` after a successful squash merge. `workflow_dispatch` is an allowed GitHub exception and keeps the normal delivery chain intact:

`Quality · CI gate` → `Staging · deploy` → staging accreditation → `Production · promote`.

The static contract in `scripts/auto_merge_delivery_contract.py` guards this wiring.
