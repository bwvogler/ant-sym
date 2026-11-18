# Pickup policy: paired game validation

Base: `196deaf3f14c688f2b32d0d3f19118ef897e8fde` (main fetched 2026-11-18). Work remains local in an isolated worktree.

Twenty seeds, three arms per seed, two colonies of 120 ants, a 160 × 100 plane, 120 simulated seconds at 30 ticks/s. No tuning between seeds 1–10 and held-out seeds 11–20. All other policies remain the game's local policies. The cache answers are synthetic fixtures, not live Jev judgments.

| Arm | Median food home, seeds 1–10 | Median food home, seeds 11–20 | Food offers, all seeds | Distinct get keys, all seeds |
|---|---:|---:|---:|---:|
| Default/off | 326.5 | 438 | 167–769 | 2–4 |
| Cached local rule | 326.5 | 438 | 167–769 | 2–4 |
| Cached refusal | 0 | 0 | 5,083–49,441 | 4–6 |

Food home is summed across both colonies. Default/off and cached-local have identical complete saved-state SHA-256 hashes on **20/20 seeds**, not merely equal food totals. Refusal accepts zero offers in every seed. Refusing pickup greatly increases repeated offers; this alone does not prove ants stand still. Bead `ja-nhin` tracks measuring per-ant dwell and offer streaks before changing movement behavior.

## Request cost

No live requests were sent; the harness asserts zero for every arm. Under a hypothetical cold cache, the observed eligible situations in the enabled runs would cost approximately **$0.00008988–$0.000502656** across an envelope of full batches versus singleton requests, without retries. The fixture doctrine and the existing token-size estimator are used. Disabled pickup always adds zero cost; warm pickup caches add zero requests. These are two-minute scenario estimates, not hourly forecasts or ledger measurements.

## Reproduce

From the repository root:

```sh
npm --prefix web ci
node scripts/lab/pickup-policy.mjs 1-20 120 > pickup-policy-results.jsonl
npm run test:unit
node --test web/src/ui/tests/pickupPolicy.test.ts web/src/colony/tests/int/responseDraw.test.ts web/src/colony/tests/int/responseCallSites.test.ts
npm run test:golden
npm run typecheck
npm run lint
git diff --check
```

Results: **588 unit tests**, **22 focused tests** (some overlap with unit), and **4 golden tests** passed. Typecheck, changed-file formatting and diff checks passed. Lint passed with seven existing warnings in unchanged files. No golden recordings changed. Browser end-to-end, soak, slow guards and paid live-policy checks were not run.

Two additional regression cases cover shared pending questions across colonies and invalid live noul answers. The experiment harness preloads all eligible cache keys; its encountered-key counts estimate what would need answering in that run. It does not model response latency or changing live decisions. The next useful measurement is whether refusing food needs a corresponding movement decision, rather than expanding to another action immediately.

Enable the page experiment with `?pickupPolicy=1`, or `&pickupPolicy=1` after another parameter. It remains off by default, food-only, with the original response as fallback and all fungal sensory controls intact.

Follow-up completed: [What ants do after refusing food](DWELL.md), with [instrumented per-seed results](dwell-results.jsonl). This separates moving over food from stationary ants and verifies that adding the probe leaves all 40 runs unchanged.
