#!/usr/bin/env bash
# Tests for gate.sh and check-plan.sh, in a throwaway git repo with a stub `bd`. No network, no real beads.
#   .claude/skills/adding-mechanics/scripts/test.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0 fail=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL %s: expected %s, got %s\n' "$1" "$2" "$3"; fi
}

repo="$tmp/repo"
mkdir -p "$repo/docs" "$repo/web/src" "$repo/.beads" "$tmp/bin"
git -C "$repo" init -q
git -C "$repo" config user.email t@t && git -C "$repo" config user.name t
export CLAUDE_PROJECT_DIR="$repo"

# --- gate.sh -----------------------------------------------------------------------------------------
gate() { # file_path, session -> "deny" or "allow"
  out=$(jq -n --arg f "$1" --arg s "$2" '{session_id: $s, tool_name: "Edit", tool_input: {file_path: $f}}' | "$here/gate.sh")
  [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$out" 2>/dev/null)" = deny ] && echo deny || echo allow
}
check "code is gated" deny "$(gate "$repo/web/src/colony.ts" s1)"
check "scripts are gated" deny "$(gate "$repo/scripts/x.mjs" s1)"
check "docs stay open" allow "$(gate "$repo/docs/note.md" s1)"
check "the skill itself stays open" allow "$(gate "$repo/.claude/skills/x/SKILL.md" s1)"
check "relative path is resolved" deny "$(gate "web/src/a.ts" s1)"
check "dot-dot cannot escape the gate" deny "$(gate "$repo/docs/../web/src/a.ts" s1)"
check "outside the project is not ours" allow "$(gate "/etc/hosts" s1)"
check "the gate remembers the session" s1 "$(cat "$repo/.git/mechanic-gate/last-session")"
check "garbage input fails open" 0 "$(echo 'not json' | "$here/gate.sh" >/dev/null 2>&1; echo $?)"

# --- check-plan.sh -----------------------------------------------------------------------------------
cat >"$tmp/bin/bd" <<'EOF'
#!/usr/bin/env bash
# stub: ja-e is an epic with two children; ja-t is a task
case "$1 $2" in
  "show ja-e") echo '[{"id":"ja-e","issue_type":"epic"}]' ;;
  "show ja-t") echo '[{"id":"ja-t","issue_type":"task"}]' ;;
  "show "*) exit 1 ;;
  "list --parent")
    if [ "${STUB_LOOSE:-}" = 1 ]; then
      echo '[{"id":"ja-e.1","description":"assay","dependencies":[]},{"id":"ja-e.2","description":"build","dependencies":[]}]'
    else
      echo '[{"id":"ja-e.1","acceptance_criteria":"assay lands","dependencies":[{"type":"parent-child"}]},{"id":"ja-e.2","description":"Gate: A5 passes","dependencies":[{"type":"blocks"}]}]'
    fi ;;
esac
EOF
chmod +x "$tmp/bin/bd"
export PATH="$tmp/bin:$PATH"

cat >"$repo/docs/foo.md" <<'EOF'
# Foo: ants do foo

## Finding

- A number. **Unverified.**

**In the game:** the cue and the response.

## Play

- **See:** foo on the field.
- **Choose:** the fungus lever.
- **Cost:** none.

## Open questions

- one

## Sources

- A 2001 [doi](https://doi.org/1)
- B 2002 https://pmc.ncbi.nlm.nih.gov/articles/PMC1
EOF
printf '| [foo.md](foo.md) | research |\n' >"$repo/docs/README.md"
printf 'vision\n' >"$repo/docs/vision.md"
printf '## 9. Foo (ja-e) docs/foo.md\n' >"$repo/docs/PRD.md"
: >"$repo/.beads/issues.jsonl"
git -C "$repo" add -A && git -C "$repo" commit -qm plan

plan() { (cd "$repo" && "$here/check-plan.sh" "$@" >"$tmp/out" 2>&1; echo $?); }
check "a complete plan passes" 0 "$(plan docs/foo.md ja-e --session s2)"
check "passing opens the gate for that session" allow "$(gate "$repo/web/src/a.ts" s2)"
check "and not for another" deny "$(gate "$repo/web/src/a.ts" s3)"
check "a task is not an epic" 1 "$(plan docs/foo.md ja-t --session s4)"
check "a missing bead fails" 1 "$(plan docs/foo.md ja-nope --session s4)"
check "children without acceptance fail" 1 "$(STUB_LOOSE=1 plan docs/foo.md ja-e --session s4)"
grep -q "ja-e.1 ja-e.2" "$tmp/out"; check "and are named" 0 $?
check "a failed check leaves the gate shut" deny "$(gate "$repo/web/src/a.ts" s4)"

sed -i '/^## Play/,/^## Open/{/^## Open/!d}' "$repo/docs/foo.md"
check "uncommitted docs fail" 1 "$(plan docs/foo.md ja-e --session s5)"
git -C "$repo" commit -qam "drop play"
check "no Play section fails" 1 "$(plan docs/foo.md ja-e --session s5)"
grep -q "MISSING a '## Play' section" "$tmp/out"; check "and says so" 0 $?
check "a note outside docs/ fails" 1 "$(plan README.md ja-e --session s5)"

check "usage error without an epic" 2 "$(plan docs/foo.md)"
check "a waiver needs a reason" 2 "$(plan --waive)"
check "a waiver opens the gate" 0 "$(plan --waive "owner: hotfix" --session s6)"
check "for that session" allow "$(gate "$repo/web/src/a.ts" s6)"
grep -q "waived: owner: hotfix" "$repo/.git/mechanic-gate/log"; check "and is logged" 0 $?
gate "$repo/web/src/a.ts" s7 >/dev/null
check "without --session it uses the last blocked session" 0 "$(plan --waive "owner: x")"
check "which is then open" allow "$(gate "$repo/web/src/a.ts" s7)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
