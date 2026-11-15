---
name: running-assays
description: "Runs jev-ants behaviour assays (npm run exp, scripts/experiment.mjs) over many seeds or settings, on GitHub's runners (assays.yml, one runner per seed) or locally, and reads the result. Use whenever you tune a parameter, sweep --set values, compare settings or a branch with main over seeds 1-10 or 1-20, bisect a behaviour change, check G1 or another assay on many seeds, or a run would take more than a few minutes on this machine. Not for one game's events (watching-a-game), the slow test guards (slow.yml, the steward skill) or live Jev checks (colony-live)."
---

# Running assays

`npm run exp` plays the local rule: no Jev, no spend. A G1 game is 3-5 minutes on one core, so a sweep or seeds 1-20 locally takes 30-60 minutes on 4 cores and dies with the container. On GitHub, `.github/workflows/assays.yml` runs one runner per seed and prints the merged table, the same one `npm run exp` prints, in its `report` job's log (ja-w7ef.12, from #183's sweeps).

## Which

| The run | Where |
|---|---|
| One seed, a quick look, `--log` journals | here: `npm run exp -- <assay> --seeds 1` (seconds to minutes) |
| A `--policy cache:` replay over many seeds | GitHub, with `policy` (the cache must be committed under `experiments/caches/`) |
| 10+ seeds of a whole game (`game`, `game1`, `--one`), a `--set` sweep, a bisect over commits | GitHub: `assays.yml` |
| Something in between | here if under ~5 minutes; else GitHub |

Several GitHub runs can go at once (one per setting or commit): each is its own workflow run.

## On GitHub

1. **The branch must have `assays.yml`** (merged into `main` with #224). A branch cut earlier merges `main` first. To measure a past commit, push a branch at it with the workflow file added.
2. **Start it**: `mcp__github__actions_run_trigger` with `method: run_workflow`, `workflow_id: assays.yml`, `ref` the branch, and `inputs` as strings:
   - `assays`: ids, space-separated, or `all` (`node scripts/experiment.mjs --help` lists them)
   - `one`: `"true"` for one world (`--one`)
   - `seeds`: `"1-10"`, `"11-20"` or `"1-5,11"` (1-40 seeds)
   - `set`: space-separated `path=v1,v2` overrides, e.g. `"colony.routeStep=3,4 colony.routeSee=3"` (their cross product runs on each runner)
   - `seconds`, `species`: optional
   - `policy`: a cache committed under `experiments/caches/`, e.g. `"experiments/caches/draw-top-forage.json"` (`--policy cache:`; Jev's saved answers for the first colony, no spend)
3. **Find the run**: `mcp__github__actions_list` (`list_workflow_runs`, `resource_id: assays.yml`, `workflow_runs_filter.branch`); the newest with `event: workflow_dispatch` is yours. It doesn't wake the session: set a `send_later` check-in for about the slowest seed's time plus 5 minutes (G1: ~15), and don't poll.
4. **Read it**: `list_workflow_jobs` on the run, then `get_job_logs` on the `report` job (whole, not `tail_lines`: the table sits before the upload and clean-up lines). The table is markdown: `## <assay>`, then per setting `pass n/N (failing seeds: …)` and median, min and max per metric. A seed whose runner failed is named in an `::error` there, and its own `seed <n>` job has the cause.
5. **Per-seed figures**: the `assays` artifact (`assays.json`, every run's metrics), via `list_workflow_run_artifacts` and `download_workflow_run_artifact`, then `curl` the URL it gives (the session's network allows `*.blob.core.windows.net`) and `unzip`.

## Judging the result

- Tune by the worst seed, confirm on seeds 11-20, and compare with `main` measured the same way the same day (CLAUDE.md; PRD §42). Measure the baseline in the same run: put the current value in the `set` list beside the candidates.
- A seed's figure is one game, and whole-game figures swing with any change to play (G1, PRD §59): read the spread over seeds before a single seed's number.
- Write the figures, the run's URL and the inputs into the PR or the PRD section, so a reader can rerun it.
