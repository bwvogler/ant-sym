# D1: geometric departure baseline

2026-11-18, `ja-ygs9.1`, PRD §85. No departure actuator or policy lane is implemented.

One ant starts at the center of a fixed food footprint in a 60 × 36 hex arena. Its mode is held at explore, its get response refuses every offer, and normal movement/collisions remain active. Food is never consumed or replenished. Four geometries: an open 5 × 5 patch, that patch clipped to a three-row corridor, an open 15 × 15 broad patch, and a 7 × 7 food-filled enclosure with no exit. This is a single-ant motor baseline, not a whole-world fitness experiment or a biological fit.

Each observed run has a paired run with the observer disabled. The script asserts exact colony saved-state equality, identical next RNG draw and offer count, unchanged food, and zero rock/out-of-bounds samples. All **80 pairs pass** (20 seeds × four geometries). No Jev calls occur.

The footprint is fixed at construction and independent of remaining food. Every tick, the observer records membership, exits, reentries, path and radius. Death and observation end are separate censoring reasons. Sampling restores the shared CELL scratch. Durations have 1/30-second resolution; paths sample tick endpoints, not continuous collision trajectories.

| Geometry | Seeds | Completed exits, including revisits | Active at end | Seeds with no exit | Mean first-exit time, capped at 30 s |
|---|---|---:|---:|---:|---:|
| Open | 1–10 | 26 | 0 | 0 | 0.387 s |
| Open | 11–20 | 23 | 0 | 0 | 0.377 s |
| Corridor | 1–10 | 55 | 0 | 0 | 0.753 s |
| Corridor | 11–20 | 45 | 0 | 0 | 0.893 s |
| Broad | 1–10 | 9 | 9 | 5 | 15.747 s |
| Broad | 11–20 | 11 | 9 | 3 | 10.027 s |
| Blocked | 1–10 | 0 | 10 | 10 | 30.000 s |
| Blocked | 11–20 | 0 | 10 | 10 | 30.000 s |

No deaths occurred. Broad-patch seeds with no exit: **2, 3, 6, 7, 10, 11, 12, 15**. Raw data retain every seed and episode. Some ants exit and reenter, so active-at-end and never-exited are different counts. The capped mean estimates time spent before first exit within this fixed 30-second window; it is not an estimate of eventual departure time.

Completed-episode p95 alone is misleading when many runs never exit. Retain it as a secondary measure; the actuator comparison must also report capped first-exit time and no-exit counts. The broad patch supplies the stronger test of departure; the blocked patch is a negative control, never a target for forced escape. These baseline numbers do not select an actuator duration; future parameter selection remains on seeds 1–10 only, then evaluates 11–20 once.

Three focused tests cover exit/reentry/boundary classification, death without teleport-like path inflation, and observer parity across geometries. The original pickup parity remains covered separately. There is no cached-continue action yet, so this stage cannot test its parity; that gate belongs to `ja-ygs9.2`.

Reproduce from the repo root:

```sh
node --test web/src/colony/tests/unit/departureAssays.test.ts
node scripts/lab/food-departure.mjs 1-20 30 > departure-baseline.jsonl
npm run test:unit
npm run test:golden
npm run typecheck
npm run lint
git diff --check
```

The pure assay is exported through `colony/experiment.ts`; its dedicated runner emits [per-seed data](baseline.jsonl). It is intentionally not a pass/fail behavior target in the global assay catalogue before an actuator exists.

Validation: all 591 unit tests pass; four golden recordings remain bit-exact. Typecheck and lint pass (seven existing no-unused-expressions warnings); changed-code formatting and diff checks pass. No browser, slow-guard or paid live-policy run was performed for this observational assay addition.
