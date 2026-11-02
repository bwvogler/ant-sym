# jev-ants — agent instructions

Ants that form the picture you type or upload, each ant steered by a Jev decision. Single user, localhost, no auth, no database. Read `docs/PRD.md` first: it holds every product decision and the measured Jev numbers.

## Patterns to copy, not reinvent
- Sibling apps: `../lingo-dojo` (closest: `web/server/api.ts` same-origin `wrap()`, Tailwind v4 `@theme inline` tokens in `web/src/index.css`, `.oxlintrc.json`), `../jev-router` (the only other Jev caller: `hooks/policy.ts` has the wire shape and a pure request-builder / response-reader split worth copying).
- Port **38500**, `strictPort`, `usePolling` watcher (FSEvents is unreliable on this machine). Lingo Dojo is 38400, Atlas 38300, Wine Guide 38200, Basecamp 38100.
- Every API route goes through `wrap()` with the same-origin check. No exceptions.
- `JEV_API_KEY` comes from the shell environment. Never read it in the browser, never commit it, never log it.
- `web/src/sim/` (picture) and `web/src/colony/` (colony, fungus) are pure TypeScript with no DOM; `node --test` covers them directly. The one exception is `sim/targets.ts` (rasterises text and images in the browser). The canvas renderer and React are thin layers over them.
- Jev requests go through the server's connection pool. A single Node `fetch` dispatcher serialises parallel requests (measured: 10 × 50 ants stacked to 2.9 s; separate connections 0.65 s). Keep the test that proves overlap.
- Spend is real, at $0.042/M input tokens (`USD_PER_INPUT_TOKEN`). Picture: ~296 tokens per ant decision (compass schema, PRD §8.1b). Colony: tokens per question (~450–560 as asked live, `npm run colony-cost`; the side view, `-- --side`, ~589 estimated, ~$0.11/h, PRD §39); fungus lane 276–343 per fungal situation at 100 to a request (Bloom with every intervention 343), ~530–570 per question as a game asks them, 44–81 situations a 5-minute game (`node scripts/fungus-cost.mjs`, PRD §37, §39). Every change to a state schema, legend or question changes the hourly cost; note the new figure for that lane in the PR.

## Work tracking
Beads: `bd ready` for unblocked work, `bd show <id>` for context, `bd close <id>` when done. Prefix `ja`. One PR per milestone, agent review before merge. File new work as beads, not TODO comments.

The `ja` database syncs through the **`beads-dolt` branch**, not `refs/dolt/data`: the cloud-session git proxy rejects pushes to `refs/dolt/*` (403) but accepts branches, so the Dolt remote's data ref (`git_ref`) points at `refs/heads/beads-dolt`. Don't merge, rebase or delete that branch (or `__dolt_remote_info__`, which Dolt creates beside it); they hold Dolt objects, not code. `scripts/beads-sync.sh` handles it and the hooks in `.claude/settings.json` run it: `start` on SessionStart (bootstraps a fresh clone from the branch, then pulls; a local database with its own history, from `bd init` or a JSONL import, is moved to `.git/beads-sync/` and replaced by the shared one, with its newer or extra issues replayed on top and pushed), `push` on Stop (async; skips if nothing changed; pull-merge-retry on rejection). Neither creates the branch; only `scripts/beads-sync.sh seed` does, by hand. The branch was seeded on 2026-11-02 from a three-way merge of `.beads/issues.jsonl` across every branch (90 issues), so from now on the Dolt database is the record: change issues with `bd`, never by editing `issues.jsonl`, which is only an export. Run `scripts/beads-sync.sh push` by hand before ending a session that filed or closed beads; plain `bd dolt push` also works once `start` has run. The database was started fresh on 2026-11-01, and issues before that stay in the original jev-ants tracker. Cloud sessions need bd installed by the environment setup script: `apt-get install -y libicu-dev && go install github.com/steveyegge/beads/cmd/bd@v1.3.2 && ln -sf "$(go env GOPATH)/bin/bd" /usr/local/bin/bd` (needs Go ≥ 1.26.5, fetched automatically; ~3 min). `AGENTS.md` carries the full beads workflow block; where it says `refs/dolt/data`, read `beads-dolt`.

## Build & test
```sh
npm --prefix web install
npm run dev                    # http://localhost:38500
npm test                       # node --test, 60 s per file
npm run test:slow              # whole-game guards (web/src/colony/tests/slow): ~5 min; run before merging colony changes
node scripts/probe.mjs 20 100  # live-API probe: latency, tokens, burst
npm run exp -- all --seeds 1-10   # behaviour assays (web/src/colony/experiment.ts), offline; --set sweeps, --policy cache:<file> replays Jev
node scripts/colony-live.mjs all --budget 0.10   # live: Jev against the local rule per lane; saves replayable caches (experiments/out/)
```

A change that should not alter behaviour must keep the golden masters bit-exact (`tests/golden.test.ts`, `tests/slow/golden.test.ts`); one that should re-records them (`GOLDEN_WRITE=1`) and says so in its PR. Tune behaviour against the assays: compare `npm run exp` with the baseline (PRD §42), choose by the worst seed, confirm on seeds 11–20.

The test script must not use `--test-force-exit`. On Node 22, combined with `--test-timeout`, it sometimes ends a test file early and drops its remaining tests without a failure; runs reported 216 or 224 tests, all green (2026-11-01). Schedulers are disposed in `afterEach`, so nothing keeps the process alive without it.

Editing `web/server/*.ts` does **not** restart the running Vite (measured 2026-10-25: the old ledger kept serving after a branch switch). Restart `npm run dev` after server changes; `/api/health` shows the live run summary shape, so check it has the field you added.

Worktrees: never symlink `web/node_modules` into a worktree. A symlink is not a directory, so it slips past the ignore rule and `git add -A` commits it; checking that commit out elsewhere replaces the real folder with the link (happened 2026-10-25). Run `npm --prefix web ci` in the worktree instead (the only lockfile is `web/package-lock.json`).
