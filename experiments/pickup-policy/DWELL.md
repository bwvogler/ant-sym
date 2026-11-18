# What ants do after refusing food

2026-11-18, local worktree on main `196deaf3`; Bead `ja-nhin`.

**Finding:** the large number of repeated pickup offers is not stationary ants. Ants move across food-bearing cells, usually leave food quickly, and sometimes continue local movement over food for tens of seconds. Refusing pickup alone does not express a decision to disengage.

## Measurement

Same worlds and random streams as the paired pickup experiment: seeds 1–20, two colonies of 120 ants, 120 simulated seconds at 30 ticks/s. This run measures default/off and synthetic cached refusal. The earlier cached-local arm already matched off exactly.

An episode is consecutive simulation ticks with an eligible food offer to the same colony/ant slot/generation. Multiple calls in one tick do not increase its duration. A tick without an offer ends the episode. Layer changes split episodes so a transfer between maps cannot masquerade as distance traveled. Movement is measured at food-offer positions; it is not a record of every subsequent step.

At the first tick without an offer, the probe distinguishes food absent under the ant, carrying food, and death/slot reuse. “Off-food” means there is no food under the ant then; it does not, by itself, distinguish movement from food disappearing. Episodes still active at the observation boundary are censored, not completed departures. Durations below are observed tick counts divided by 30, with one tick of temporal resolution. Per-seed p50/p95 values use nearest-rank quantiles.

## Results

| Measure, seeds 1–20 combined | Default/off | Cached refusal |
|---|---:|---:|
| Food-offer episodes | 8,891 | 6,299 |
| Episodes crossing multiple hexes | 0 | 6,084 (96.6%) |
| End with food in jaws | 8,891 | 0 |
| End with no food under the ant | 0 | 6,199 |
| End with death/slot reuse | 0 | 23 |
| Still active at observation end | 0 | 77 |
| Per-seed p50 completed episode duration | 0.033 s | 0.667–1.100 s |
| Per-seed p95 completed episode duration | 0.033 s | 1.633–36.000 s |
| Longest observed episode | 0.067 s | 57.467 s |
| Longest consecutive offer streak in one hex | 0.067 s | 0.733 s |

These quantiles describe completed episodes, excluding the 77 censored ones. They are not a survival-adjusted estimate of total dwell. Episode counts and pooled proportions weight seeds by their number of episodes. Refusal episodes are fewer than the default's because one refusal episode can contain many offers.

The longest refusal episode was seed 20, colony 1, ant slot 71, generation 1: 1,724 consecutive ticks, 31 distinct food hexes, 495 cell transitions, approximately 402.03 world units of path, and a maximum displacement of 6.71 world units from its initial offer position. It ended off food. This is consistent with sustained circling/local search rather than immobility; identifying the exact steering cause needs an intervention experiment.

## Interpretation and next step

The current code has no “disengage” meaning for `get=false`. In `arrive.ts`, refusal skips the pickup branch; in `sense.ts`, reachable food continues to be sensed. No refusal history or movement instruction is added by the pickup policy. The fungus's sensory controls remain unchanged.

Keep `get` as a pickup decision. The next mechanics proposal should evaluate a separate movement decision after a refused encounter: continue inspecting/foraging versus leave/reorient, including whether any short-lived local rejection memory is justified. Research and the repository's mechanics plan come before that behavioral change. A fixed forced turn or unconditional move-away inside `get` would silently collapse these two decisions and is not implemented here.

## Verification and reproduction

The new probe is observational only. **All 40 runs** (two arms × 20 seeds) match the earlier saved-state hashes and the earlier food, loss, encounter, accepted-offer, distinct-key and request counters. All runs sent zero live Jev requests; the previous request-cost result is unchanged.

Four probe tests pass: duplicate calls within a tick, within-hex motion and end censoring, gaps and ant-generation identity, and layer transitions. Formatting, explicit lint over the four experiment files, and `git diff --check` pass. Production code did not change in this measurement round; the earlier 588 unit / 22 focused / 4 golden results were not rerun merely for adding the observer.

```sh
node --test scripts/lab/pickup-dwell.test.mjs
node scripts/lab/pickup-policy.mjs 1-20 120 off,cached-refuse > dwell-results.jsonl
node scripts/lab/check-pickup-observation.mjs experiments/pickup-policy/results.jsonl dwell-results.jsonl
```

[Per-seed results, including the ten longest episodes per arm](dwell-results.jsonl). [Original paired-game report](README.md).
