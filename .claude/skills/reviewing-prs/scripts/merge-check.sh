#!/usr/bin/env bash
# Merge mechanics for a PR review: does PR <n> merge into main, into its base, and alongside every other
# open PR? Read-only apart from fetching refs/pr/<n> refs; never merges, commits or pushes.
#
# Usage: merge-check.sh <n> [--base <branch>] [<other open PR number> ...]
#   Get the open PR numbers and the base branch from mcp__github__list_pull_requests; git alone can't tell
#   open from closed. --base defaults to main.
# Needs git >= 2.38 (merge-tree --write-tree). Portable: bash 3.2, BSD and GNU tools.
set -u

[ $# -ge 1 ] || { sed -n '5,6p' "$0" >&2; exit 2; }
n=$1; shift
base=main
others=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base=${2:?--base needs a branch}; shift 2 ;;
    *) [ "$1" = "$n" ] || others="$others $1"; shift ;;
  esac
done

refs="+refs/heads/main:refs/remotes/origin/main +pull/$n/head:refs/pr/$n"
[ "$base" = main ] || refs="$refs +refs/heads/$base:refs/remotes/origin/$base"
for o in $others; do refs="$refs +pull/$o/head:refs/pr/$o"; done
# shellcheck disable=SC2086 # word splitting is the point
git fetch -q origin $refs || { echo "fetch failed" >&2; exit 1; }

head="refs/pr/$n"
echo "PR #$n head $(git rev-parse --short "$head"), base $base ($(git rev-parse --short "origin/$base")), main $(git rev-parse --short origin/main)"

# The files this PR itself changes (against its base, so a stacked PR doesn't claim its base's files).
mine=$(git diff --name-only "$(git merge-base "origin/$base" "$head")" "$head" | sort)

# merge <label> <ours> <theirs>: one line, clean or the conflicted files. Merging two PR heads also
# replays each one's differences from main; conflicts in files this PR doesn't change are the other
# PR's with main, not this PR's, so they are counted apart.
merge() {
  local out files real note theirs
  if out=$(git merge-tree --write-tree --name-only --no-messages "$2" "$3" 2>&1); then
    echo "  $1: clean"
  else
    files=$(echo "$out" | sed -n '2,$p' | sed '/^$/d' | grep -v '^\.beads/issues\.jsonl$' | sort -u)
    real=$(comm -12 <(echo "$files") <(echo "$mine") | sed '/^$/d' | tr '\n' ' ')
    theirs=$(comm -23 <(echo "$files") <(echo "$mine") | sed '/^$/d' | wc -l | tr -d ' ')
    note=""; echo "$out" | grep -q '^\.beads/issues\.jsonl$' && note=" (+ .beads/issues.jsonl, the bd export: not a real conflict)"
    [ "$theirs" -gt 0 ] && note="$note (+ $theirs in files this PR doesn't change: the other side's own conflicts, not this PR's)"
    if [ -n "$real" ]; then echo "  $1: CONFLICTS in $real$note"; else echo "  $1: clean$note"; fi
  fi
}

echo "Merges:"
merge "into main" origin/main "$head"
[ "$base" = main ] || merge "into base $base" "origin/$base" "$head"
for o in $others; do merge "with #$o ($(git rev-parse --short "refs/pr/$o"))" "refs/pr/$o" "$head"; done

if [ "$base" != main ]; then
  if git merge-base --is-ancestor "origin/$base" origin/main; then
    echo "Stack: base $base is already in main; the PR should be retargeted to main."
  else
    echo "Stack: base $base is not in main yet; merge its PR first, then retarget this one to main."
  fi
fi

# Files this PR changes that main has also changed since they split: a clean textual merge can still break here.
mb=$(git merge-base origin/main "$head")
ours=$(git diff --name-only "$mb" "$head" | sort)
theirs=$(git diff --name-only "$mb" origin/main | sort)
both=$(comm -12 <(echo "$ours") <(echo "$theirs") | sed '/^$/d')
behind=$(git rev-list --count "$head..origin/main")
echo "Main is $behind commits ahead of the PR's merge base."
if [ -n "$both" ]; then
  echo "Changed on both sides (trial-merge and run the tests if any is code):"
  echo "$both" | sed 's/^/  /'
else
  echo "No file changed on both sides."
fi
