#!/usr/bin/env bash
# Tests for slow-dispatch.sh, with sample hook input and a fake `gh` first on PATH (it records its arguments and prints
# what the test says a PR search returns). No network.
#   .claude/hooks/test.sh      (web/src/ui/tests/slowDispatchHook.test.ts runs it in CI)
set -u
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0 fail=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL %s: expected %s, got %s\n' "$1" "$2" "$3"; fi
}

mkdir "$tmp/bin"
cat >"$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_GH_LOG"
[ "${FAKE_GH_FAIL:-0}" = 1 ] && exit 1
printf '%s' "${FAKE_GH_PR:-}"
EOF
chmod +x "$tmp/bin/gh"
export FAKE_GH_LOG="$tmp/gh.log"

decision() { # hook output on stdin -> deny | allow (no output is an allow); the output itself is kept in $tmp/out
  tee "$tmp/out" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null | { read -r d; echo "${d:-allow}"; }
}
hook() { # tool, tool_input json, [pr number the search finds] -> deny | allow
  : >"$FAKE_GH_LOG"
  jq -n --arg t "$1" --argjson i "$2" '{tool_name: $t, tool_input: $i}' | FAKE_GH_PR="${3:-}" PATH="$tmp/bin:$PATH" "$here/slow-dispatch.sh" | decision
}
run() { jq -n --arg w "$1" --arg r "$2" '{method: "run_workflow", owner: "bwvogler", repo: "ant-sym", workflow_id: $w, ref: $r, inputs: {}}'; }
calls() { wc -l <"$FAKE_GH_LOG" | tr -d ' '; }
T=mcp__github__actions_run_trigger

check "slow.yml on a PR branch is refused" deny "$(hook $T "$(run slow.yml ccr-de1a166a-2u2o6p)" 249)"
hook $T "$(run slow.yml ccr-de1a166a-2u2o6p)" 249 >/dev/null
reason=$(jq -r '.hookSpecificOutput.permissionDecisionReason' "$tmp/out")
case "$reason" in *'#249'*) check "the reason names the PR" ok ok ;; *) check "the reason names the PR" ok "$reason" ;; esac
case "$reason" in *slow-guards*issue_write* | *issue_write*slow-guards*) check "the reason says how: the label, through issue_write" ok ok ;; *) check "the reason says how" ok "$reason" ;; esac
check "the search asks for an open PR on that head, in that repo" "api -X GET search/issues -f q=repo:bwvogler/ant-sym is:pr is:open head:ccr-de1a166a-2u2o6p --jq .items[0].number // empty" "$(cat "$FAKE_GH_LOG")"
check "refs/heads/ is stripped" deny "$(hook $T "$(run slow.yml refs/heads/ccr-x)" 12)"
case "$(cat "$FAKE_GH_LOG")" in *"head:ccr-x "*) check "and the search is for the plain branch name" ok ok ;; *) check "and the search is for the plain branch name" ok "$(cat "$FAKE_GH_LOG")" ;; esac
check "the full workflow path is slow.yml too" deny "$(hook $T "$(run .github/workflows/slow.yml ccr-x)" 12)"

check "slow.yml on a branch with no PR" allow "$(hook $T "$(run slow.yml experiment-1)" "")"
check "slow.yml on main" allow "$(hook $T "$(run slow.yml main)" 249)"
check "main asks gh nothing" 0 "$(calls)"
check "slow.yml on staging" allow "$(hook $T "$(run slow.yml staging)" 249)"
check "slow.yml with no ref (the default branch)" allow "$(hook $T "$(jq -n '{method: "run_workflow", owner: "bwvogler", repo: "ant-sym", workflow_id: "slow.yml"}')" 249)"
check "assays.yml on a PR branch (it has no PR trigger)" allow "$(hook $T "$(run assays.yml ccr-de1a166a-2u2o6p)" 249)"
check "e2e.yml on a PR branch" allow "$(hook $T "$(run e2e.yml ccr-x)" 249)"
check "re-running a PR's failed jobs is not a dispatch" allow "$(hook $T "$(jq -n '{method: "rerun_failed_jobs", owner: "bwvogler", repo: "ant-sym", workflow_id: "slow.yml", ref: "ccr-x", run_id: 1}')" 249)"
check "listing workflows" allow "$(hook $T '{"method":"list_workflows","owner":"bwvogler","repo":"ant-sym"}' 249)"
check "another tool" allow "$(hook mcp__github__issue_write "$(run slow.yml ccr-x)" 249)"

check "a failed search lets it through" allow "$(FAKE_GH_FAIL=1 hook $T "$(run slow.yml ccr-x)" 249)"
check "a ref with a space is not searched" allow "$(hook $T "$(run slow.yml 'ccr-x head:main')" 249)"
check "a ref with a space asks gh nothing" 0 "$(calls)"
check "no owner or repo" allow "$(hook $T '{"method":"run_workflow","workflow_id":"slow.yml","ref":"ccr-x"}' 249)"
check "no gh at all" allow "$(
  mkdir -p "$tmp/nogh"
  for c in jq cat bash; do ln -sf "$(command -v $c)" "$tmp/nogh/$c"; done
  jq -n --argjson i "$(run slow.yml ccr-x)" '{tool_name: "mcp__github__actions_run_trigger", tool_input: $i}' | PATH="$tmp/nogh" "$(command -v bash)" "$here/slow-dispatch.sh" | PATH="$PATH" decision
)"
check "unreadable input" allow "$(printf 'not json' | PATH="$tmp/bin:$PATH" "$here/slow-dispatch.sh" | decision)"

printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]
