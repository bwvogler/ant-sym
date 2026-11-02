# jev-ants — agent instructions

Ants that form the picture you type or upload, each ant steered by a Jev decision. Single user, localhost, no auth, no database. Read `docs/PRD.md` first: it holds every product decision and the measured Jev numbers.

## Patterns to copy, not reinvent
- Sibling apps: `../lingo-dojo` (closest: `web/server/api.ts` same-origin `wrap()`, Tailwind v4 `@theme inline` tokens in `web/src/index.css`, `.oxlintrc.json`), `../jev-router` (the only other Jev caller: `hooks/policy.ts` has the wire shape and a pure request-builder / response-reader split worth copying).
- Port **38500**, `strictPort`, `usePolling` watcher (FSEvents is unreliable on this machine). Lingo Dojo is 38400, Atlas 38300, Wine Guide 38200, Basecamp 38100.
- Every API route goes through `wrap()` with the same-origin check. No exceptions.
- `JEV_API_KEY` comes from the shell environment. Never read it in the browser, never commit it, never log it.
- `web/src/sim/` is pure TypeScript with no DOM: grid, ants, packing, applying answers, the local rule. `node --test` covers it directly. The canvas renderer and React are thin layers over it.
- Jev requests go through the server's connection pool. A single Node `fetch` dispatcher serialises parallel requests (measured: 10 × 50 ants stacked to 2.9 s; separate connections 0.65 s). Keep the test that proves overlap.
- Spend is real: ~376 input tokens per ant decision, $0.042/M. Every change to the ant state schema changes the hourly cost; note the new tokens/ant in the PR.

## Work tracking
Beads: `bd ready` for unblocked work, `bd show <id>` for context, `bd close <id>` when done. Prefix `ja`. One PR per milestone, agent review before merge. File new work as beads, not TODO comments.

The `ja` database syncs through the **`beads-dolt` branch**, not `refs/dolt/data`: the cloud-session git proxy rejects pushes to `refs/dolt/*` (403) but accepts branches, so the Dolt remote's data ref (`git_ref`) points at `refs/heads/beads-dolt`. Don't merge, rebase or delete that branch; it holds Dolt objects, not code. `scripts/beads-sync.sh` handles it and the hooks in `.claude/settings.json` run it: `start` on SessionStart (bootstraps a fresh clone from the branch, or seeds the branch from `.beads/issues.jsonl` if it doesn't exist yet, then pulls), `push` on Stop (async; skips if nothing changed; pull-merge-retry on rejection). Run `scripts/beads-sync.sh push` by hand before ending a session that filed or closed beads; plain `bd dolt push` also works once `start` has run. The database was started fresh on 2026-11-01, and issues before that stay in the original jev-ants tracker. Cloud sessions need bd installed by the environment setup script: `apt-get install -y libicu-dev && go install github.com/steveyegge/beads/cmd/bd@v1.3.2 && ln -sf "$(go env GOPATH)/bin/bd" /usr/local/bin/bd` (needs Go ≥ 1.26.5, fetched automatically; ~3 min). `AGENTS.md` carries the full beads workflow block; where it says `refs/dolt/data`, read `beads-dolt`.

## Build & test
```sh
npm install && npm --prefix web install
npm run dev                    # http://localhost:38500
npm test                       # node --test
node scripts/probe.mjs 20 100  # live-API probe: latency, tokens, burst
```

Editing `web/server/*.ts` does **not** restart the running Vite (measured 2026-10-25: the old ledger kept serving after a branch switch). Restart `npm run dev` after server changes; `/api/health` shows the live run summary shape, so check it has the field you added.

Worktrees: never symlink `web/node_modules` into a worktree. A symlink is not a directory, so it slips past the ignore rule and `git add -A` commits it; checking that commit out elsewhere replaces the real folder with the link (happened 2026-10-25). Run `npm ci` in the worktree instead.
