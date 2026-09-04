# Auto-merge delivery invariant

`PR · auto-merge` authenticates with the repository `GITHUB_TOKEN`. GitHub suppresses workflow runs caused by ordinary events emitted by that token, including the `push` produced by the merge.

The merge workflow therefore owns only one thing: wait for the protected checks and squash exactly the PR head it observed. It does **not** dispatch delivery itself.

`Delivery · main handoff` is the independent continuation owner. It is triggered by a successful PR run of `Quality · CI gate`, waits for that exact approved head to appear merged into `main`, validates the PR base/head, coalesces to the current `main` HEAD if several merges land together, and then:

- reuses an already-created `push`/`workflow_dispatch` Quality run for that main SHA when one exists;
- otherwise dispatches `cicd.yml` on `main` explicitly.

This makes delivery independent from the actor that performed the merge: GitHub UI/manual merges keep the normal `push -> Quality` path, while merges performed with `GITHUB_TOKEN` are recovered by the handoff through the allowed `workflow_dispatch` exception.

The normal release chain remains:

`Quality · CI gate` → `Staging · deploy` → staging accreditation → `Production · promote`.

The static contract in `scripts/auto_merge_delivery_contract.py` guards ownership, deduplication and the downstream wiring.
