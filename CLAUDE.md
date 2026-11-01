# jev-ants — agent instructions

Ants that form the picture you type or upload, each ant steered by a Jev decision. Single user, localhost, no auth, no database. Read `docs/PRD.md` first: it holds every product decision and the measured Jev numbers.

## Patterns to copy, not reinvent
- Sibling apps: `../lingo-dojo` (closest: `web/server/api.ts` same-origin `wrap()`, Tailwind v4 `@theme inline` tokens in `web/src/index.css`, `.oxlintrc.json`), `../jev-router` (the only other Jev caller: `hooks/policy.ts` has the wire shape and a pure request-builder / response-reader split worth copying).
- Port **38500**, `strictPort`, `usePolling` watcher (FSEvents is unreliable on this machine). Lingo Dojo is 38400, Atlas 38300, Wine Guide 38200, Basecamp 38100.
- Every API route goes through `wrap()` with the same-origin check. No exceptions.
- `JEV_API_KEY` comes from the shell environment. Never read it in the browser, never commit it, never log it.
- `web/src/sim/` (picture) and `web/src/colony/` (colony, fungus) are pure TypeScript with no DOM; `node --test` covers them directly. The one exception is `sim/targets.ts` (rasterises text and images in the browser). The canvas renderer and React are thin layers over them.
- Jev requests go through the server's connection pool. A single Node `fetch` dispatcher serialises parallel requests (measured: 10 × 50 ants stacked to 2.9 s; separate connections 0.65 s). Keep the test that proves overlap.
- Spend is real, at $0.042/M input tokens (`USD_PER_INPUT_TOKEN`). Picture: ~296 tokens per ant decision (compass schema, PRD §8.1b). Colony: tokens per question (~450–560 as asked live, `npm run colony-cost`); fungus lane ~315 per fungal situation (PRD §19). Every change to a state schema, legend or question changes the hourly cost; note the new figure for that lane in the PR.

## Work tracking
Beads: `bd ready` for unblocked work, `bd show <id>` for context, `bd close <id>` when done. Prefix `ja`. One PR per milestone, agent review before merge. File new work as beads, not TODO comments.

The `ja` database syncs to this repo's `refs/dolt/data` (`bd dolt pull` / `bd dolt push`); it was started fresh on 2026-11-01, and issues before that stay in the original jev-ants tracker. Until that ref has been pushed (cloud sessions can't push it: their git proxy only allows branches), the issues live in `.beads/issues.jsonl` (auto-exported): bootstrap with `bd init --prefix ja --from-jsonl`, and `bd dolt push` from a machine with normal GitHub access. bd 1.3.2 builds with `apt-get install -y libicu-dev && go install github.com/steveyegge/beads/cmd/bd@v1.3.2` (needs Go ≥ 1.26.5, fetched automatically). `AGENTS.md` carries the full beads workflow block.

## Build & test
```sh
npm --prefix web install
npm run dev                    # http://localhost:38500
npm test                       # node --test
node scripts/probe.mjs 20 100  # live-API probe: latency, tokens, burst
```

The test script must not use `--test-force-exit`. On Node 22, combined with `--test-timeout`, it sometimes ends a test file early and drops its remaining tests without a failure; runs reported 216 or 224 tests, all green (2026-11-01). Schedulers are disposed in `afterEach`, so nothing keeps the process alive without it.

Editing `web/server/*.ts` does **not** restart the running Vite (measured 2026-10-25: the old ledger kept serving after a branch switch). Restart `npm run dev` after server changes; `/api/health` shows the live run summary shape, so check it has the field you added.

Worktrees: never symlink `web/node_modules` into a worktree. A symlink is not a directory, so it slips past the ignore rule and `git add -A` commits it; checking that commit out elsewhere replaces the real folder with the link (happened 2026-10-25). Run `npm --prefix web ci` in the worktree instead (the only lockfile is `web/package-lock.json`).
