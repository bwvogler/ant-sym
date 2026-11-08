#!/usr/bin/env bash
# Stop / SubagentStop hook for the reviewing-prs skill: before a reviewer finishes, the tree is back as it
# was. It blocks the stop once, with the reason, when
#   - a detached worktree is left (the skill's scratch checkouts are all --detach), or
#   - .beads/issues.jsonl has uncommitted changes (bd's export: revert it, never commit it).
# It never blocks twice in a row (stop_hook_active), so a worktree a running helper still needs, or one
# the user keeps on purpose, costs one reminder, not a loop.
# Fails open: without jq, git or readable input it allows the stop.
set -u

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
[ "$(jq -r '.stop_hook_active // false' <<<"$input" 2>/dev/null)" = true ] && exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
repo=${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}
top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || exit 0

problems=""
left=$(git -C "$top" worktree list --porcelain 2>/dev/null |
  awk '/^worktree /{p=substr($0,10)} /^detached$/{print p}')
if [ -n "$left" ]; then
  problems="Scratch worktrees are still there (remove each with git worktree remove --force <path>, then check git worktree list; skip this if a helper you started is still using one):
$(printf '%s\n' "$left" | sed 's/^/  /')"
fi
if ! git -C "$top" diff --quiet -- .beads/issues.jsonl 2>/dev/null; then
  problems="${problems:+$problems
}.beads/issues.jsonl has changes: it is bd's export, so revert it (git checkout -- .beads/issues.jsonl) and never commit it."
fi
[ -n "$problems" ] || exit 0

jq -n --arg r "reviewing-prs clean-up (stage 8) before you finish:
$problems" '{decision: "block", reason: $r}'
exit 0
