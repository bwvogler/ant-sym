# jev-ants — agent instructions

Two ant colonies and a fungus on one map, each ant steered by a Jev decision. (The picture mode was removed on 2026-11-02; PRD §1–8 keep its history.) Single user, localhost, no auth, no database. Read `docs/vision.md` first for the goal (one policy per species fed only by the senses; a fungus that works through them), then `docs/PRD.md`: it holds every product decision and the measured Jev numbers. Research notes are indexed in `docs/README.md`.

## Writing for agents
`docs/agent-guide.md`: what goes in this file, skills, hooks or docs (the size budget a test holds), and the code style beyond Prettier and oxlint. Read it before changing this file.

## Patterns to copy, not reinvent
- Sibling apps: `../lingo-dojo` (closest: `web/server/api.ts` same-origin `wrap()`, Tailwind v4 `@theme inline` tokens in `web/src/index.css`, `.oxlintrc.json`), `../jev-router` (the only other Jev caller: `hooks/policy.ts` has the wire shape and a pure request-builder / response-reader split worth copying).
- Port **38500**, `strictPort`, `usePolling` watcher (FSEvents is unreliable on this machine). Lingo Dojo is 38400, Atlas 38300, Wine Guide 38200, Basecamp 38100.
- Every API route goes through `wrap()` with the same-origin check. No exceptions.
- `JEV_API_KEY` comes from the shell environment. Never read it in the browser, never commit it, never log it.
- New ant behaviour comes from the policy over **sensed** state (see the sense table in `docs/vision.md`). Don't add scripted choices that read global state an ant can't sense: the chamber table, other nests' coordinates, colony-wide counts. Removing one is progress; strike its row in the vision gap table and close its `ja-k4k` bead. A sense not in the table needs a research note with primary sources first.
- `web/src/colony/` (colony, nest, fungus) is pure TypeScript with no DOM; `node --test` covers it directly. The canvas renderer and React are thin layers over it. Code outside it (the page, the server, the maintained scripts) imports from `web/src/colony/index.ts`, never from a module file (`ui/tests/colonyIndex.test.ts` holds that line; `experiment.ts`, the assay harness, is imported by name). Shared words (modes, stances, situations, trail levels) live in `colony/vocab.ts`, a leaf that imports no colony code.
- Jev requests go through the server's connection pool. A single Node `fetch` dispatcher serialises parallel requests (measured: 10 × 50 ants stacked to 2.9 s; separate connections 0.65 s). Keep the test that proves overlap.
- Spend is real, at $0.042/M input tokens (`USD_PER_INPUT_TOKEN`). Spend nothing while answers are cached: Jev is asked only for a situation with no answer under the words in force; the first such miss starts a run, which stays open until the page closes. The ceiling is one daily budget in the server's ledger (`JEV_DAILY_USD`, default $0.10 a UTC day, `data/jev-budget.json`; PRD §50.11). Measured tokens per question and $/h of each lane are in PRD §50.19 and §54.4–54.5; `npm run colony-cost` and `node scripts/fungus-cost.mjs` estimate them offline. Every change to a state schema, legend or question changes the hourly cost: note the new figure for that lane in the PR.

## New mechanics
A new mechanic or behaviour (a sense, an action, a lever, a lane) goes through the `adding-mechanics` skill (`.claude/skills/adding-mechanics/`, or `/adding-mechanics <idea>`): primary research, the translation to sensed cues, the case for play, then a committed note, PRD section and bead epic before code. While it is active, a hook blocks edits under `web/` and `scripts/` until `check-plan.sh` passes. Bug fixes and tuning don't need it.

## Work tracking
Beads: `bd ready` for unblocked work, `bd show <id>` for context, `bd close <id>` when done. Prefix `ja`. One PR per milestone, agent review before merge (the `reviewing-prs` skill or the `pr-reviewer` agent: one posted review, measured findings, decisions to beads). File new work as beads, not TODO comments.

The `ja` database syncs through the `beads-dolt` branch, not `refs/dolt/data` (the cloud-session git proxy rejects `refs/dolt/*`). Never merge, rebase or delete that branch or `__dolt_remote_info__`; they hold Dolt objects, not code. Change issues with `bd` (the Dolt database is the record; `issues.jsonl` is a local export), and run `scripts/beads-sync.sh push` by hand before ending a session that filed or closed beads. The hooks, bootstrap and the bd install line for cloud sessions are in `docs/beads-sync.md`; `AGENTS.md` carries the workflow block (where it says `refs/dolt/data`, read `beads-dolt`).

## Build & test
```sh
npm --prefix web install
npm run dev                    # http://localhost:38500
npm test                       # every tier, ~4 min on 4 cores; node --test, 120 s per file (60 s in unit, int, golden); files run side by side: split a file before it nears the limit
npm run test:unit              # the quick tier (ui, server, worker, colony/tests/unit), ~9 s
npm run test:watch             # the unit tier on every save (node --test --watch)
npm run test:int               # every int/ folder: files of 1.5-12 s
npm run test:soak              # colony/tests/soak: files over 12 s and the long games
npm run test:golden            # the fast golden masters (colony/tests/golden)
node --test --test-name-pattern='stranger' web/src/colony/tests/int/colony.test.ts   # one file, or the tests of it whose name matches
npm run format                 # Prettier over web/src, server, worker, shared and the scripts; CI runs `format:check`; a bulk reformat commit goes in .git-blame-ignore-revs
npm run test:slow              # whole-game guards (colony/tests/slow): ~16 min; a PR gets them by the `slow-guards` label once approved, not a dispatch (steward skill)
npm run e2e                    # one world in Chromium (scripts/e2e-one-world.mjs), the page's guard; ~150 s; spends nothing
node scripts/colony-cost.mjs   # offline estimate of a game's cost: tokens per question, $/h (no key, no spend)
npm run exp -- all --seeds 1-10   # assays (colony/experiment.ts), offline; many seeds: skill `running-assays`
npm run exp -- game --seeds 1 --log summary   # watch a game, offline (skill `watching-a-game`); every scripts/*.mjs answers --help
node scripts/colony-live.mjs all --budget 0.10   # live: Jev against the local rule per lane; saves replayable caches
node scripts/precache.mjs --import experiments/caches/<live-check>-*.json   # no spend: ship a live check's answers as the presets' precache; do this when precache.test fails
```

`scripts/*.mjs` are the maintained tools: `npm run typecheck` checks them as JavaScript against the colony's types and `npm run lint` lints them, so a rename in the core fails there. `scripts/lab` holds one-off measurements that fed a PRD section: not checked, run from the repo root.

The page ships Jev's answers (`web/public/precache/`) and plays cached answers whether or not a run is on; a lane whose words changed plays the local rule until new answers arrive; earlier words' answers play, stale, only while Jev can't run (`ColonyJev.canAsk`). A change to a colony legend, question or brain version must re-ship them in the same PR: `--import` the answers its live check got (free), never ask every situation (`scripts/precache.mjs` without `--import`, ~$0.12 for the mode lane: only when the owner asks).

A change that should not alter behaviour must keep the golden masters bit-exact (every `tests/golden/*.test.ts` and `tests/slow/golden.test.ts`); one that should re-records them (`GOLDEN_WRITE=1`) and says so in its PR. Tune behaviour against the assays: compare `npm run exp` with the baseline (PRD §42), choose by the worst seed, confirm on seeds 11–20.

Merges to `main` deploy `web/dist` to `gh-pages` (`BASE_PATH=/ant-sym/`); every PR gets a preview at `/ant-sym/pr-preview/pr-<n>/`. A Pages build calls the hosted proxy `web/worker` only when built with `VITE_JEV_API`; otherwise `ui/backend.ts` finds no backend and Jev is off. New fetches to the API go through `apiUrl()` with `apiHeaders()`, never a bare `/api/...`. `server/replies.ts` (shared with the Worker) stays free of `node:fs` and module-load file paths, and the Worker is the one place that accepts a cross-origin request, only from `ALLOWED_ORIGINS`. Passphrase, allowlist, daily cap, deploy and secrets: `docs/hosting.md`.

The test script must not use `--test-force-exit`: on Node 22 with `--test-timeout` it sometimes drops a file's remaining tests without a failure (2026-11-01). Schedulers are disposed in `afterEach` so nothing keeps the process alive.

Editing `web/server/*.ts` does **not** restart the running Vite: restart `npm run dev` after server changes, and check `/api/health` has the field you added.

Worktrees: never symlink `web/node_modules` into a worktree (a symlink slips past the ignore rule and `git add -A` commits it; happened 2026-10-25). Run `npm --prefix web ci` there instead.
