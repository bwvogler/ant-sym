#!/usr/bin/env bash
# PreToolUse hook, registered by the adding-mechanics skill when it is invoked (it then stays on for the
# rest of the session). It denies Edit/Write/NotebookEdit under web/ and scripts/ until check-plan.sh has
# passed (or the owner waived it) for this session. Everything else (docs/, .claude/, beads) stays open.
# The deny reason tells Claude how to unblock, so it reads as guidance, not a wall.
# Fails open: if it cannot read its input, it allows the edit rather than wedge the session.
set -u

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null) || exit 0
session=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null) || exit 0
[ -n "$file" ] || exit 0

case "$file" in /*) ;; *) file="$root/$file" ;; esac
file=$(realpath -m -- "$file")
root=$(realpath -m -- "$root")
case "$file" in "$root"/*) rel="${file#"$root"/}" ;; *) exit 0 ;; esac
case "$rel" in web/* | scripts/*) ;; *) exit 0 ;; esac

gitdir=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
dir="$gitdir/mechanic-gate"
[ -n "$session" ] && [ -f "$dir/$session" ] && exit 0

# Remember the session, so check-plan.sh can open the gate for it without being told.
mkdir -p "$dir" && [ -n "$session" ] && printf '%s\n' "$session" >"$dir/last-session"

reason="The adding-mechanics skill gates code until the mechanic's plan is written: a research note with sources and a Play section, its docs/README.md row, a PRD section and a bead epic with children, committed. Run .claude/skills/adding-mechanics/scripts/check-plan.sh docs/<note>.md <epic-id> and fix what it lists. If this edit is not part of the mechanic and the owner said to go ahead, run check-plan.sh --waive \"<their reason>\". (Blocked: $rel)"
jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
