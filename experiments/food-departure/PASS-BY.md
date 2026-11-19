# Bounded pass-by: first candidate does not meet promotion gates

PRD §85, `ja-ygs9.2`. Engine prototype only: `enableDeparture(colony, seconds)` plus an optional `Responses.depart` returning continue/pass-by. No page flag, live lane, cache-key change or paid request. The default behavior remains unchanged.

An action holds the heading at a refused food encounter for a bounded time, before fleeing/alarm steering and normal collision resolution. Food sensors and fungal gains are untouched. Continue creates no persistent state. Active actions and exhausted episode latches save/load separately. Contact loss, combat, return, loads, layer transfer, death and slot reuse cancel them. A timeout does not rearm a continuously contacting ant.

## Development and held-out test

Same four single-ant geometries as D1; 30 seconds at 30 Hz. Development seeds 1–10 tested 0.5, 1 and 2 seconds. Half a second left five broad-patch ants without a first exit; one and two seconds eliminated those non-exiters. Both longer candidates had a worst first exit of 1.333 seconds. One second was fixed as the shorter useful candidate, then evaluated on seeds 11–20. No subsequent parameter tuning used those results.

| Held-out geometry | Capped mean first exit, baseline → candidate | Worst completed-episode p95, baseline → candidate | Candidate p95 regressed on seeds |
|---|---:|---:|---|
| Open | 0.377 → 0.373 s | 0.967 → 0.800 s | 11 |
| Corridor | 0.893 → 0.703 s | 2.233 → 1.767 s | 11, 12, 14, 16, 17, 19 |
| Broad | 10.027 → 1.103 s | 5.267 → 2.700 s | 14, 16, 18 |
| Blocked | 30 → 30 s | No completed exits | None; no exit is expected |

**Gate failed:** open seed 11 increases from 0.767 to 0.800 seconds, one simulation tick. The predefined gate allows no per-seed increase. Aggregate improvements do not erase that failure. Corridor regressions are a further caution. These exact deterministic outcomes are not statistical significance claims.

Broad first-exit non-exiters fall from 3/10 to 0/10 on validation, but **9/10 runs still end with an active food-contact episode in both arms** after possible reentry. Faster initial departure does not establish that repeated lingering is solved. Completed-episode p95 omits those censored episodes. Neither it nor first-exit time should be reported alone.

All 160 geometry/seed/duration pairs preserve exact off-versus-continue saved state and next RNG draw. All candidate runs preserve food and have zero rock/out-of-bounds samples. All blocked runs have zero exits. This is a synthetic deterministic response, not a test of Jev's decisions, weighted cached answers, doctrine handling or colony fitness.

## Decision

Keep this candidate experimental. No live lane is promoted; token estimates and the 5% tick-overhead gate remain pending. Investigate cancellation using local collision feedback and failure after reentry, preserving these results. Any revised candidate needs a preregistered fresh validation set; do not retune against seeds 11–20. Follow-up: `ja-ygs9.3`.

## Reproduction

```sh
node scripts/lab/food-pass-by.mjs 1-10 0.5,1,2 > pass-by-development.jsonl
node scripts/lab/food-pass-by.mjs 11-20 1 > pass-by-validation.jsonl
node --test web/src/colony/tests/unit/departure.test.ts web/src/colony/tests/int/save.test.ts
npm run test:unit
npm run test:golden
npm run typecheck
npm run lint
git diff --check
```

[Development data](pass-by-development.jsonl) · [Fixed-candidate validation data](pass-by-validation.jsonl). No Jev spend.

Validation: 596 unit tests, 10 focused action/save tests (overlapping unit coverage), and four bit-exact golden tests pass. Typecheck, lint (seven existing warnings), changed-code formatting and diff checks pass. Both experiment files reproduce byte-for-byte after the final implementation cleanup. No browser, slow guard, live-policy or CPU-overhead acceptance run was performed; promotion already failed the movement gate.
