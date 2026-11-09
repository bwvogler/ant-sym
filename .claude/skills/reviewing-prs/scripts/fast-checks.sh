#!/usr/bin/env bash
# Fast checks for a PR review, run one after another (never in parallel: parallel load makes test files hit
# the 60 s timeout). Never starts slow runs (test:slow, sweeps, game runs). No Jev key in any run.
#
# Usage: fast-checks.sh <worktree> [main-lint-warnings]
#   <worktree>: a checkout of the PR head (or a trial merge) with `npm --prefix <worktree>/web ci` done.
#   main-lint-warnings: main's oxlint warning count; if omitted it is measured on origin/main in a
#   temporary worktree beside <worktree>, using the PR's oxlint binary (no npm ci needed), then removed.
# Portable: bash 3.2, BSD and GNU tools.
set -u

W=${1:?usage: fast-checks.sh <worktree> [main-lint-warnings]}
W=$(cd "$W" && pwd -P) || exit 2
[ -d "$W/web/node_modules" ] || { echo "no $W/web/node_modules: run npm --prefix \"$W/web\" ci first" >&2; exit 2; }
main_lint=${2:-}
run() { env -u JEV_API_KEY "$@"; }
warnings() { grep -c ': warning ' || true; }   # oxlint prints one "file:line:col: warning …" line each

cd "$W/web" || exit 2
echo "== $W at $(git -C "$W" rev-parse --short HEAD) (main $(git -C "$W" rev-parse --short origin/main))"

if out=$(run npx tsc -b 2>&1); then echo "typecheck: clean"; else echo "typecheck: FAILED"; echo "$out" | head -20; fi

out=$(run npm test 2>&1)
pass=$(echo "$out" | sed -n 's/^[#ℹ] pass \([0-9]*\).*/\1/p' | tail -1)
fail=$(echo "$out" | sed -n 's/^[#ℹ] fail \([0-9]*\).*/\1/p' | tail -1)
echo "tests: pass ${pass:-?}, fail ${fail:-?}"
if [ "${fail:-1}" != 0 ]; then
  echo "$out" | grep -E '^not ok|✖|timed out|cancelled' | head -20
  echo "  (a file failing at exactly 60 s may be load: re-run it alone before calling it a failure)"
fi

pr_lint=$(npx oxlint 2>&1 | warnings)
if [ -z "$main_lint" ]; then
  M="$(dirname "$W")/.main-lint-$$"
  if git -C "$W" worktree add -q --detach "$M" origin/main 2>/dev/null; then
    main_lint=$( (cd "$M/web" && "$W/web/node_modules/.bin/oxlint" 2>&1) | warnings)
    git -C "$W" worktree remove --force "$M"
  fi
fi
echo "lint: ${pr_lint:-?} warnings (main ${main_lint:-?})"
if [ -n "$pr_lint" ] && [ -n "$main_lint" ] && [ "$pr_lint" -gt "$main_lint" ]; then
  echo "  more than main: find the new one(s) among these"; npx oxlint 2>&1 | grep ': warning ' | head -20
fi
npx oxlint 2>&1 | grep -q ': error ' && { echo "  lint ERRORS:"; npx oxlint 2>&1 | grep ': error ' | head -10; }

if out=$(run npx vite build 2>&1); then echo "build: ok"; else echo "build: FAILED"; echo "$out" | tail -15; fi

mb=$(git -C "$W" merge-base origin/main HEAD)
g=$(git -C "$W" diff --stat "$mb" HEAD -- web/src/colony/tests/golden.json web/src/colony/tests/slow/golden.json web/public/precache | tail -1)
echo "goldens/precache since merge base: ${g:-unchanged}"

brains=$(git -C "$W" diff --name-only "$mb" HEAD -- web/src/colony/colonyBrain.ts web/src/colony/fungusBrain.ts web/src/colony/responses.ts web/src/colony/fungalPolicy.ts web/src/colony/levers.ts web/shared/jev.ts)
versions=$(git -C "$W" diff "$mb" HEAD -- web/src web/shared | grep -E '^[+-][^+-].*_VERSION = ' || true)
if [ -n "$brains" ]; then
  echo "Jev lane files changed: $(echo "$brains" | tr '\n' ' ')"
  if [ -n "$versions" ]; then echo "$versions" | sed 's/^/  /'
  else echo "  no *_VERSION changed: if a legend, question or Touch changed, that lane's version must bump"; fi
elif [ -n "$versions" ]; then
  echo "versions changed:"; echo "$versions" | sed 's/^/  /'
fi
