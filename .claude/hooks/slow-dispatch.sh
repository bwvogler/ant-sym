#!/usr/bin/env bash
# PreToolUse hook, registered in .claude/settings.json so it holds in every session and subagent (a skill's hook holds
# only where the skill was loaded, and most sessions never loaded the steward skill: ja-w7ef.17, ja-w7ef.19).
#
# Refuses mcp__github__actions_run_trigger on slow.yml when the ref is a branch with an open PR, and says what to do
# instead: a PR gets the slow guards by the `slow-guards` label. A dispatched run attaches to no PR, wakes no session and
# doesn't test the head merged into main (16 such runs between #224 and 2026-11-15). Dispatch stays free for main and
# staging, for a branch with no PR, and for every other workflow (assays.yml has no PR trigger). The owner can still run
# slow.yml from the Actions tab; this guards the agent's tool only.
#
# Fails open: without jq or gh, a failed search, an odd ref or missing owner/repo it allows the call rather than wedge a
# session. The PR is found with a search by head branch (gh api -X GET search/issues), read-only.
# Portable: bash 3.2 and BSD tools (macOS) as well as GNU. Tests: .claude/hooks/test.sh.
set -u

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
field() { jq -r ".tool_input.$1 // empty" <<<"$input" 2>/dev/null; }

[ "$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)" = mcp__github__actions_run_trigger ] || exit 0
[ "$(field method)" = run_workflow ] || exit 0
case "$(field workflow_id)" in slow.yml | .github/workflows/slow.yml) ;; *) exit 0 ;; esac

ref=$(field ref)
ref=${ref#refs/heads/}
case "$ref" in "" | main | staging) exit 0 ;; esac
case "$ref" in *[!A-Za-z0-9._/-]*) exit 0 ;; esac # the search qualifier takes a plain branch name only

owner=$(field owner) repo=$(field repo)
[ -n "$owner" ] && [ -n "$repo" ] || exit 0
command -v gh >/dev/null 2>&1 || exit 0

pr=$(gh api -X GET search/issues -f q="repo:$owner/$repo is:pr is:open head:$ref" --jq '.items[0].number // empty' 2>/dev/null) || exit 0
[ -n "$pr" ] || exit 0

jq -n --arg r "slow-guards: $ref has an open PR (#$pr). A PR gets the slow guards by the slow-guards label, not a dispatch: add it with mcp__github__issue_write (method update, labels: the PR's labels plus \"slow-guards\"). Add it once the review approves, or earlier only to look, and take it off before your next push (steward skill). The label's checks attach to the PR and wake you; a dispatched run attaches to no PR, wakes no session and doesn't test the head merged into main. The owner can still run it from the Actions tab." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
