# Chess Football — mandatory merge gate

The stable GitHub Actions check is **`Football · required visual gate`** in
[`chess-football-godot-poc.yml`](../../.github/workflows/chess-football-godot-poc.yml).
Its workflow runs on every pull request so the check never disappears because
of `pull_request.paths`.

## Behavior

- When a PR changes `games/chess-football-godot/**`, the canonical football art
  scripts, the Godot bundle publisher or the Football CI workflow, run **both**
  the Godot validation (including the camera/tonal capture) and real Chromium
  WebAssembly boot. Both must succeed.
- For unrelated PRs, the lightweight changed-file detector succeeds and
  Godot/Chromium are **skipped**; the stable final check is successful.
- On diff-discovery errors, truncated PR lists, cancelled, skipped, pending or
  failing Football tests, the final gate **fails closed**.

## One-time repository administrator action

The active ruleset [**Protect main**](https://github.com/evilsysadmin/chess-studio/rules/23068505)
was observed with `required_status_checks: []` on 2026-10-10. GitHub will
still permit an early merge until a repository administrator edits that
ruleset:

1. Open **Settings → Rules → Rulesets → Protect main**.
2. In **Require status checks to pass**, add the exact status check
   **`Football · required visual gate`**. Preserve all existing rules.
3. Save the ruleset and verify it lists that check under
   `required_status_checks`. Do not require the conditional `validate` or
   `Real Chromium · Godot Web boot` jobs directly: they intentionally do not
   run on unrelated PRs.
4. Verify a Football PR with a deliberately failing visual check cannot merge
   or automerge, while an unrelated PR can merge with the final gate green.

**A passing CI workflow alone is not branch protection.** The check is not
enforced until step 3 is confirmed. Issue #5322 tracks that final activation.
