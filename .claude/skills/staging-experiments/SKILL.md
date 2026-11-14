---
name: staging-experiments
description: "Runs an idea on the long-lived `staging` branch before it goes to `main`: brings `main` in, builds and measures the experiment, checks its deploy at /ant-sym/pr-preview/staging/, and promotes what the owner keeps to `main` in a PR of its own. Use whenever the user wants to try, test or play an idea on staging, says 'staging', asks to sync or update staging with main, asks where staging is deployed, or asks to merge or promote a staging change to main. Not for ordinary work that goes straight to main."
---

# Staging experiments

`staging` is where the owner tries ideas in play before deciding (first one: ants drawing their mode from Jev's probabilities, `ja-nan3`, PRD §68). Rules from the owner (beads memory `staging-branch`):

- Never delete `staging`, never rebase it, never force-push it. It takes `main` in by merge only.
- `staging` is never merged into `main`. What the owner keeps goes to `main` in a PR of its own, from a branch cut from `main`.

## The deploy

Every push to `staging` runs `.github/workflows/staging.yml` (a file only `staging` has): it builds and publishes to `https://bwvogler.github.io/ant-sym/pr-preview/staging/` in about 30 s. No test gates it: a broken idea still deploys, so it can be played. It sits under `pr-preview/` because `main`'s deploy (`pages.yml`) clears everything else on `gh-pages`. Same Jev proxy, passphrase and $2 daily cap as `main`; answers under words that changed on `staging` are asked live. Check a run with the GitHub MCP `actions_list` (`list_workflow_runs`, resource `staging.yml`).

## 1. Bring `main` in first

```sh
git fetch origin main staging && git checkout staging && git merge --ff-only origin/staging
git merge origin/main        # a merge commit, never a rebase
```

Conflicts seen so far, and their fix:

| File | Fix |
|---|---|
| `.beads/issues.jsonl` | take `main`'s (`git checkout --theirs`): it is only an export |
| `colony/ants.ts` with `tests/unit/fixtures/antReset.json` and `ants.test.ts`'s count | both sides added per-ant fields: keep `main`'s first, then `staging`'s; a field's `asIs` scribble is `7 + index × 0.25` (rounded by its array type) |
| `web/public/precache/*.json` | take `main`'s, then redo `staging`'s change to them (for `ja-nan3`: `node scripts/precache.mjs --reweigh`, a small spend: ask the owner) |
| lines a promoted experiment reworded on `main` | take `main`'s |

Then the goldens and the unit tier (`npm run test:golden`, `npm run test:unit`) before pushing.

## 2. Build the experiment

- A bead for it, labelled `staging`. CLAUDE.md still holds: a new sense, action or lane goes through `adding-mechanics`; spend only what the owner approved.
- Keep the local rule's game bit-exact where you can (the golden masters), so the experiment is a switch, not a drift. A knob the owner may want to feel goes in Details → Lab, not on the main screen.
- PRD sections on `staging` are numbered S1, S2, …, appended at the end, so they never collide with `main`'s numbers.
- Measure before reporting: the assays (`npm run exp`) or a scratch comparison in the scratchpad, choice against experiment, on the same seeds. Say what got worse as well as better.
- Commit and push to `staging`, then confirm the deploy run succeeded before telling the owner it is live.

## 3. Promote what the owner keeps

Only when the owner says so.

1. On the session's branch from `origin/main` (merge `main` into it if it is behind), apply the experiment's diff without the staging-only files:
   `git diff <main as last merged into staging> origin/staging -- . ':!.github/workflows/staging.yml' ':!.beads' > x.patch && git apply --3way x.patch`
   (`<main as last merged>` is the second parent of `staging`'s last "Merge main" commit, `git rev-parse <merge>^2`.)
2. Drop "staging" from comments and renumber its PRD section S*n* to `main`'s next §, with a line saying it was tried on `staging` first.
3. The full gate for a colony change: `npm test`, `npm run test:slow`, `npm run e2e`, lint, typecheck, `format:check`.
4. A PR to `main`, a fresh `pr-reviewer` subagent, and merge as the beads memories `pr-reviews-by-subagent` and `merge-after-approval` say.
5. After it merges, bring `main` into `staging` (step 1): its lines win.
