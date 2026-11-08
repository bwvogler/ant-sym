#!/usr/bin/env bash
# Checks that a mechanic's plan is in place before code (the adding-mechanics skill, stage 5), and on a
# pass opens the code gate (gate.sh) for this Claude session.
#
#   check-plan.sh docs/<note>.md <epic-id> [--session <id>]
#   check-plan.sh --waive "<the owner's reason>" [--session <id>]
#
# Without --session it uses the last session the gate blocked. Exit 0 = pass, 1 = something missing
# (each listed), 2 = usage. It checks what a script can see; the owner still reviews the plan.
set -u

usage() { sed -n '5,6p' "$0" | sed 's/^# *//' >&2; exit 2; }
note="" epic="" waive="" session=""
while [ $# -gt 0 ]; do
  case "$1" in
    --waive) waive="${2:-}"; [ -n "$waive" ] || usage; shift 2 ;;
    --session) session="${2:-}"; shift 2 ;;
    -h | --help) usage ;;
    *) if [ -z "$note" ]; then note="$1"; elif [ -z "$epic" ]; then epic="$1"; else usage; fi; shift ;;
  esac
done
[ -n "$waive" ] || { [ -n "$note" ] && [ -n "$epic" ]; } || usage

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not in a git repository" >&2; exit 2; }
cd "$root" || exit 2
dir="$(git rev-parse --path-format=absolute --git-common-dir)/mechanic-gate"
mkdir -p "$dir"
[ -n "$session" ] || session=$(cat "$dir/last-session" 2>/dev/null || true)

open_gate() {
  if [ -z "$session" ]; then
    echo "Passed, but no session to open the gate for: pass --session <id> (the skill gives it)." >&2
    return 0
  fi
  printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$1" >"$dir/$session"
  printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$session" "$1" >>"$dir/log"
  echo "Code gate open for session $session."
}

if [ -n "$waive" ]; then
  open_gate "waived: $waive"
  exit 0
fi

fails=0 warns=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  MISSING %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf '  warn  %s\n' "$1"; warns=$((warns + 1)); }

note="${note#./}"
base=$(basename "$note")
echo "Plan check: $note, epic $epic"

# 1. The note: in docs/, committed, with the parts the skill asks for.
case "$note" in docs/*.md) ;; *) bad "the note should be a Markdown file in docs/ (got $note)" ;; esac
if [ ! -f "$note" ]; then
  bad "$note does not exist"
else
  if git ls-files --error-unmatch -- "$note" >/dev/null 2>&1; then ok "note tracked by git"; else bad "$note is not committed (git add + commit it)"; fi
  links=$(awk '/^## ([0-9.]+ )?Sources/{s=1; next} /^## /{s=0} s' "$note" | grep -c 'https\?://' || true)
  if [ "$links" -ge 2 ]; then ok "Sources: $links linked entries"; else bad "a '## Sources' section with at least two linked sources (found $links)"; fi
  if grep -qE '^\*\*(In the game|For the model)[^*]*:\*\*' "$note"; then ok "findings translated (In the game / For the model)"; else bad "at least one bold 'In the game:' paragraph turning a finding into a rule"; fi
  play=$(awk '/^## ([0-9.]+ )?Play/{s=1; next} /^## /{s=0} s && NF' "$note" | wc -l)
  if [ "$play" -ge 3 ]; then ok "Play section ($play lines)"; else bad "a '## Play' section (see reference/play.md; found $play lines)"; fi
  grep -qiE '^## ([0-9.]+ )?.*(open questions|still open)' "$note" && ok "open questions listed" || warn "no '## Open questions' section: list the owner's calls and what is still to measure"
  grep -q "unverified\|Unverified" "$note" || warn "nothing marked unverified: were all numbers read in full text?"
fi

# 2. The index, the vision, the PRD.
grep -q "($base)" docs/README.md && ok "docs/README.md links $base" || bad "a row for $base in docs/README.md's notes table"
grep -q "$base" docs/vision.md && ok "docs/vision.md links $base" || warn "docs/vision.md does not link $base: fine unless it adds a sense or closes/opens a gap row"
if grep -q "$base" docs/PRD.md && grep -q "$epic" docs/PRD.md; then ok "docs/PRD.md cites $base and $epic"; else bad "a PRD section that cites both $base and $epic"; fi

# 3. The beads: an epic with children, each with a gate or acceptance.
if ! command -v bd >/dev/null 2>&1; then
  bad "bd is not installed, so the beads cannot be checked"
elif ! type=$(bd show "$epic" --json 2>/dev/null | jq -r '.[0].issue_type // empty') || [ -z "$type" ]; then
  bad "bead $epic not found"
else
  [ "$type" = epic ] && ok "$epic is an epic" || bad "$epic should be an epic (it is a $type)"
  kids=$(bd list --parent "$epic" --all --json 2>/dev/null || echo '[]')
  n=$(jq 'length' <<<"$kids")
  if [ "$n" -ge 1 ]; then ok "$n child beads"; else bad "child beads under $epic, in build order"; fi
  loose=$(jq -r '.[] | select(((.acceptance_criteria // "") == "") and ((.description // "") | test("[Gg]ate|[Tt]arget|[Gg]uard|[Bb]udget|[Aa]cceptance") | not)) | .id' <<<"$kids")
  if [ -n "$loose" ]; then bad "acceptance (or a Gate/Target line) on: $(echo $loose)"; elif [ "$n" -ge 1 ]; then ok "every child has acceptance or a gate"; fi
  deps=$(jq '[.[] | (.dependencies // [])[] | select(.type != "parent-child")] | length' <<<"$kids")
  [ "$n" -lt 2 ] || [ "$deps" -ge 1 ] || warn "no dependencies between the children: research and assays should block the build"
fi

# 4. Committed before code.
dirty=$(git status --porcelain -- docs .beads/issues.jsonl)
[ -z "$dirty" ] && ok "docs and beads export committed" || bad "uncommitted docs or beads export (commit them before code):
$(sed 's/^/          /' <<<"$dirty")"

echo
if [ "$fails" -gt 0 ]; then
  echo "Not ready: $fails missing, $warns warnings. Fix the missing items and run this again."
  exit 1
fi
echo "Ready: $warns warnings. Now show the owner the plan before building."
open_gate "plan: $note $epic"
