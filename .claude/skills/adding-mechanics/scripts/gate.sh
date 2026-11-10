#!/usr/bin/env bash
# PreToolUse hook, registered by the adding-mechanics skill when it is invoked (it then stays on for the
# rest of the session). It denies Edit/Write/NotebookEdit under web/ and scripts/ of any worktree of this
# repository until check-plan.sh has passed, the owner waived it, or stage 0 found the ask is not a
# mechanic, for this session. Everything else (docs/, .claude/, beads) stays open. The deny reason tells
# Claude how to unblock, so it reads as guidance, not a wall.
# Fails open: if it cannot read its input, it allows the edit rather than wedge the session.
# Portable: bash 3.2 and BSD tools (macOS) as well as GNU; no realpath -m.
set -u

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null) || exit 0
session=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null) || exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null) || exit 0
[ -n "$file" ] || exit 0

# Absolute, then lexically normalised (".", "..", "//").
case "$file" in /*) ;; *) file="${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}/$file" ;; esac
norm=""
IFS=/ read -r -a parts <<<"$file"
for p in "${parts[@]}"; do
  case "$p" in "" | .) ;; ..) norm="${norm%/*}" ;; *) norm="$norm/$p" ;; esac
done
file="${norm:-/}"

# Resolve symlinks in the part that exists, and find the worktree that holds the file.
dir="$file" rest=""
while [ ! -d "$dir" ]; do rest="/${dir##*/}$rest"; dir="${dir%/*}"; [ -n "$dir" ] || dir=/; done
real=$(cd "$dir" 2>/dev/null && pwd -P) || exit 0
top=$(git -C "$real" rev-parse --show-toplevel 2>/dev/null) || exit 0
top=$(cd "$top" && pwd -P) || exit 0
file="$real$rest"
case "$file" in "$top"/*) rel="${file#"$top"/}" ;; *) exit 0 ;; esac
shopt -s nocasematch # case-insensitive file systems: Web/ is web/
case "$rel" in web/* | scripts/*) ;; *) exit 0 ;; esac
shopt -u nocasematch

gitdir=$(git -C "$top" rev-parse --git-common-dir 2>/dev/null) || exit 0
case "$gitdir" in /*) ;; *) gitdir="$top/$gitdir" ;; esac
gate="$gitdir/mechanic-gate"
[ -n "$session" ] && [ -f "$gate/$session" ] && exit 0

# Remember the session, so check-plan.sh can open the gate for it without being told.
mkdir -p "$gate" && [ -n "$session" ] && printf '%s\n' "$session" >"$gate/last-session"

reason="The adding-mechanics skill gates code until the mechanic's plan is written: a research note with sources and a Play section, its docs/README.md row, a PRD section and a bead epic with children, committed. Run .claude/skills/adding-mechanics/scripts/check-plan.sh docs/<note>.md <epic-id> and fix what it lists. If the ask turned out not to be a new mechanic (a bug fix, tuning), run check-plan.sh --not-a-mechanic \"<why>\". If this edit is outside the mechanic and the owner said to go ahead, run check-plan.sh --waive \"<their reason>\". Don't write the file another way (Bash) meanwhile. (Blocked: $rel)"
jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
