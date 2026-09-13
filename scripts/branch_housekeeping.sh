#!/usr/bin/env bash
set -euo pipefail

protected_branch() {
  case "$1" in
    main|artifact/*) return 0 ;;
    *) return 1 ;;
  esac
}

valid_branch() {
  [[ "$1" =~ ^[A-Za-z0-9._/-]+$ ]]
}

self_test() {
  protected_branch main
  protected_branch artifact/visual-123
  ! protected_branch techdebt/workflow-cleanup

  valid_branch techdebt/workflow-cleanup
  valid_branch feature/foo.bar_1
  ! valid_branch 'bad branch'
  ! valid_branch 'bad@{branch'

  echo 'branch housekeeping self-test: OK'
}

if [[ "${1:-}" == '--self-test' ]]; then
  self_test
  exit 0
fi

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
owner="${repo%%/*}"

delete_branch_if_safe() {
  local branch="$1"

  if ! valid_branch "$branch"; then
    echo "::warning::Rama con nombre inesperado; se omite: $branch"
    return 0
  fi

  if protected_branch "$branch"; then
    echo "Protegida por política: $branch"
    return 0
  fi

  if ! gh api "repos/$repo/git/ref/heads/$branch" >/dev/null 2>&1; then
    return 0
  fi

  local open_count
  open_count="$(gh api "repos/$repo/pulls?state=open&head=${owner}:${branch}&per_page=1" --jq 'length')"
  if [[ "$open_count" != '0' ]]; then
    echo "Con PR abierta; se conserva: $branch"
    return 0
  fi

  gh api --method DELETE "repos/$repo/git/refs/heads/$branch" >/dev/null
  echo "Eliminada: $branch"
}

while IFS=$'\t' read -r head_repo branch; do
  [[ "$head_repo" == "$repo" ]] || continue
  delete_branch_if_safe "$branch"
done < <(
  gh api --paginate \
    "repos/$repo/pulls?state=closed&per_page=100&sort=updated&direction=desc" \
    --jq '.[] | select(.merged_at != null) | [.head.repo.full_name, .head.ref] | @tsv'
)
