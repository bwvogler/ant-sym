# Review recipes

Commands that worked in past reviews. Run from the repo root unless a path says otherwise. Every command that runs code runs under `env -u JEV_API_KEY`.

## Worktree

```sh
S=/tmp/claude-…/scratchpad            # the session scratchpad: absolute, never empty
git fetch origin pull/57/head:refs/pr/57
W="${S:?}/pr57"                       # ${S:?} aborts if S is empty; a bare $S once made /r53m
git worktree add --detach "$W" refs/pr/57
npm --prefix "$W/web" ci              # never symlink node_modules
```

Remove it at the end (`git worktree remove --force "$W"; git worktree list`). A helper reports `git worktree list` in its last message.

## Fast checks

`scripts/fast-checks.sh "$W" [main-lint-count]` runs these one after another:

```sh
cd "$W/web"
env -u JEV_API_KEY npx tsc -b                     # typecheck, must be clean
env -u JEV_API_KEY npm test 2>&1 | tail -12       # "# pass N", "# fail 0"
npx oxlint 2>&1 | grep -c ': warning '          # warning count
env -u JEV_API_KEY npx vite build 2>&1 | tail -3
git -C "$W" diff --stat origin/main...HEAD -- web/src/colony/tests/golden.json web/src/colony/tests/slow/golden.json web/public/precache
```

**Lint baseline**: compare with main's count *now*, not a remembered number. The script counts it on a temporary checkout of `origin/main` with the PR's oxlint and removes it; pass the count as the second argument to skip that. oxlint prints one `file:line:col: warning …` line per warning; there is no summary line to read. A PR that adds a warning gets a nit with the `file:line`.

**Timeouts**: a test file failing at exactly 60 s under load is suspect. Re-run that one file alone (`cd web && env -u JEV_API_KEY node --test --test-timeout=60000 src/colony/tests/<file>.test.ts`) before calling it a failure; on #47 every "failure" passed alone in under 60 s.

## Trial merge

When `merge-check.sh` shows conflicts, or main changed files the PR touches:

```sh
git worktree add --detach "${S:?}/m57" origin/main
git -C "${S:?}/m57" merge --no-edit --no-commit refs/pr/57    # resolve as the author would; note each resolution
npm --prefix "${S:?}/m57/web" ci && .claude/skills/reviewing-prs/scripts/fast-checks.sh "${S:?}/m57"
```

Report the resolutions and the test result under Merge mechanics. Nothing from this worktree is committed or pushed. For a stacked PR, say what changes when its base merges and it is retargeted to main.

## Mutation check

For each fix and each new test: find the line that makes it work, break it, run the one test file that should catch it, restore.

```sh
cd "$W"
sed -i 's/if ((this.founding || this.incipient) \&\& nurses === 0/if (this.founding \&\& nurses === 0/' web/src/colony/colony.ts
(cd web && env -u JEV_API_KEY node --test --test-timeout=60000 src/colony/tests/royal.test.ts 2>&1 | grep -E '^# (pass|fail)')
git checkout -- .
```

Good mutations: drop a condition, flip a comparison, set a new constant to 0 or to its old value, never clear a flag, skip the new call. Report:

| mutation | caught by |
|---|---|
| `HOLE_GAP` 16 → 8 | `world.test` "holes 16 apart" |
| drop `incipient` from nursing | **not caught** |

## Instrumenting a suspected bug

Count it, don't argue it. In the scratch worktree only:

```ts
// in the code under suspicion
((globalThis as any).__probe ??= { rolls: 0, ticks: 0 }).rolls++;
```

The simplest driver: print `globalThis.__probe` at the end of the assay's `score` in `experiment.ts` and run `npm run exp -- <assay> --seeds 1` (~7–15 s). For a custom driver, write a script file in the scratchpad (or `node --input-type=module -e '…'`; plain `-e` is CommonJS and has no top-level await, and its extra argv starts at `process.argv[1]`, not `[2]`). A trial fix measured the same way shows whether the fix does what it claims. Throw the worktree away after.

## Assays and Jev cache hits

`npm run exp -- <assay ...> --seeds 1` runs offline with no key and no spend; assay ids are in `ASSAYS` at the end of `web/src/colony/experiment.ts`. Each run ends with:

```
Jev's answers (cache hits; the rest the local rule): mode 12/12, get 340/401, …
```

That line says how much of a result was Jev's cached answers and how much the local rule. Use it whenever a PR's numbers depend on cached answers, and compare the same lanes on main. One seed is a smoke test, not a sweep: say so. Sweeps over seeds 1–10 or 1–20 are slow; list them under "Not re-measured" unless the owner asks.

## Like-for-like replay

Compare only what differs by the change. If the PR's cached answers differ from main's (new lanes, a version bump), a raw comparison measures the cache, not the code. Graft: copy the PR's answers for the extra lane into main's cache in a scratch worktree, replay the same seed on main, and compare. (#41: the Warlike loss reproduced on main with the grafted mode answers, so it predated the PR.)

## Jev ask path and cost

Before any cost claim, read the path: what triggers a request (a cache miss, a policy change, page load, a timer), what is cached and where (`web/public/precache`, `policyCache.ts`), what the budget gate is (`web/server/ledger.ts`, `DAILY_BUDGET_USD` in `web/shared/jev.ts`). Then cost = misses × tokens per question × `USD_PER_INPUT_TOKEN`. An open run spends nothing until a miss. The owner's rules: ask Jev only for situations with no cached answer; nothing starts a run by itself; one daily budget server-side, no per-run time cap.

## Focus list

What reviews of this codebase have caught. Check the ones the diff touches.

- **Sensed state.** Choices come from what the ant senses. A rule that reads another nest's position, the chamber table or a colony-wide count is a scripted gap: it needs a `docs/vision.md` gap-table row and a `ja-k4k.*` bead, or it's a should-fix. (#47 `#wanted` scanned every ant's energy colony-wide.)
- **Conservation.** Food and ants are neither created nor lost by bookkeeping. Follow every `+=` to `foodTotal`, stores and reserves to where it is written off. (#47: a 24-food founding reserve against ≤ 10 written off conjured 14.)
- **Once per tick, once per event.** Two code paths that each roll the same chance in one tick double it (#39 `#leaves`). Handlers that can run twice need a guard (#47 `found()` was not idempotent).
- **Saves.** New public fields are saved by `saveFields`; private fields need the guard test in `save.test.ts`. A save shape change bumps `SAVE_VERSION`, and older saves still load (`newestReadable`) or fail into a fresh game with a toast, never a blank page.
- **Determinism and goldens.** `golden.json` and `slow/golden.json` stay bit-exact unless the PR says why they moved and re-records them. New randomness draws from the seeded RNG, not `Math.random`.
- **Jev keys and versions.** Changing a legend, question or Touch bumps that lane's `*_VERSION` (`colonyBrain.ts`, `fungusBrain.ts`), or old cached answers are served to a new question. A lane's key holds only that lane's senses. The PR states the new per-lane cost (CLAUDE.md).
- **Gates.** A new behaviour's "off" setting matches main bit for bit. A behaviour that needs a target checks the target exists (#53: no raid recruitment without a living rival).
- **Tests that test it.** Every new branch has a test that fails without it; see the mutation check.
- **Cost of scans.** O(n²) over ants or brood per tick is a nit at today's sizes and a bead if it will grow (#54 `#royalNear`).
- **Docs.** Stale comments (#54 "Env override" that no longer exists), PRD sections and the Learn guide updated with the behaviour.
