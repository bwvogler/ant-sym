# Strategic backfill

A soil carrier can sense evidence of recent passage at an adjacent candidate fill cell, and its doctrine chooses whether to place the pellet. In the first gameplay version, the existing stale-branch walker still chooses which branch to inspect. The experimental question goes through the existing `drop` response after the usual candidate, habitat, food, occupancy and no-cut checks.

## Try it in the game

Open the game with `?backfill=1` and start a new game. The switch enables it for the starting colonies and is stored with the game. A save retains the setting it was made with. Open **Colonies** and look at its soil column to see how many eligible fills were declined when a fresh mark was sensed. That counter counts decisions, so a single passage may account for several declines. It does not count unique protected passage cells.

The local fallback keeps hauling when it senses recent traffic. Where the existing response lanes are enabled, the cached Jev `drop` answer may make a different choice. For example, a doctrine can say “When placing soil, keep hauling if the adjacent cell has recent traffic, and otherwise put the pellet down.” Other drop questions still use their usual keys and wording. An experimental backfill question adds the `quiet` or `recent` input to its own versioned cache key. `quiet` means no mark was sensed on that candidate, and is weak evidence of disuse.

Only ordinary cell transitions by living workers with no soil pellet leave a mark, on their colony's home curtain. Marks are sparse timestamps, expire after 12 simulated seconds, and are pruned once per simulated second. The same fungal mark-perception gain used for floor cues can suppress perception of the trace below 0.5. Nothing changes the cell's terrain before an eligible placement. A placement consumes one carried pellet and clears the mark on that cell. The existing no-cut check limits this slice to ordinary backfill, including tip-first pruning, without introducing passage sealing.

## Research and pilot

Lenoir et al. found cuticular hydrocarbons on surfaces used by walking black garden ants, consistent with passive transfer from their feet. Heyman et al. moved marked flooring between carpenter ant chambers and workers tended to follow its new location. Tschinkel and Seal documented backfilled chambers and shafts using colored sand. The observed behaviors support a local chemical cue and soil reuse. A rule that treats that cue as evidence against placing soil is a game hypothesis. Its 12-second duration comes from the assay.

In the earlier scheduled-traffic fixture, a 12-second passage trace preserved the reserve branch in 40/40 runs at 2- and 6-second worker intervals, and 32/40 at 14 seconds. Direct encounter memory preserved it in 6/40, 1/40, and 0/40, respectively. The trace still pruned the abandoned spur in all 40 runs at each cadence. This was a controlled comparison. The workflow below measures the whole nest when workers move without a schedule.

## Nest function assay

The **Nest function assay** workflow compares current backfill, the trace fallback, and an assay-only floor-repair variant using paired world and random-stream starting seeds. The first colony gets the treatment, and the rival keeps the current rules. Both use the bounded one-world map, with no live Jev calls or fungus intervention. The PR workflow plays all three variants for 600 simulated seconds on seeds 7, 17, 29 and 43. Each colony starts with 600 workers, using the same starting-count constant as the browser game. Once the workflow is available on the default branch, manual dispatch offers 300, 600 or 1,200 seconds. Each seed and variant gets its own runner and uploads one JSON file with minute checkpoints, and the summary compares final checkpoints.

Run a pair locally with Node 22.18 or newer:

```sh
node scripts/lab/nest-function.mjs 17 600 > nest-17.json
```

| Metric | How to read it |
| --- | --- |
| Food delivered, internal port trips, and food carried below | Compare throughput and possible underground backlog. These measures count events or stocks, not route length. |
| Reachable cells, dead ends, branch cells, chambers, and floor | The geometry walk starts at the first colony's entrance. Adjacent cells inside a chamber also contribute to graph degree, so branch-cell count includes room geometry. |
| Visited cells and later-used dug cells | Worker positions sampled every 0.2 simulated seconds. Later use means a non-soil carrier was sampled at least five seconds after the cell was dug. |
| Soil dug, filled and hauled, and observed re-digs | A re-dig is counted when a cell recorded as filled at one checkpoint is open later. The minute sampling misses faster fill/reopen cycles. |
| Sampled reversals | Adjacent sampled cell changes that immediately reverse the prior adjacent change. A proxy for local backtracking that also includes intentional returns. |
| Population, brood starvation, and hunger deaths | Colony outcomes that can show unintended costs of changing the nest. |
| Tick timings and trace decisions | Compare engine cost and check whether the policy received fresh evidence. A measured tick excludes assay observation and rendering. |
| Unique experimental drop situations and example batch bytes | Workload and request-size diagnostics. The assay spends no live tokens. Default behavior introduces zero new Jev situations. |

The initial lower-population runs were pilots. Interpret their results in that context. The workflow evaluates typical starting population on a bounded map, with fungus intervention disabled to isolate the worker response.

Analyses should retain paired seed results. Trajectories and random draws can diverge after a different move. Compare food and useful access together, since lower soil hauling or faster travel could come at the cost of an effectively smaller nest.

## Floor repair and repeated fill checks

At 600 workers per colony, the first trace sweep saw less usable chamber floor on seeds 7 and 43. Food delivery fell on three seeds. Seed 29 also finished with more food held below and fewer internal port trips. These observations motivate a closer look at both repair and logistics.

The `trace-repair` variant uses the normal soil drop question for eligible candidates that the existing geometry classifies as chamber-floor support. Non-floor candidates still use the trace cue. Occupancy, food, brood and no-cut checks apply as usual. This variant is currently in the assay. The playable URL still uses the original trace policy.

The expanded assay records cumulative worker-seconds spent carrying food underground, the peak number of such workers, and peak and final counts observed holding food below for at least 30 seconds. These are sampled every 0.2 simulated seconds, and loss, delivery and exit all end an observed interval. Hold counts are workload markers rather than a measurement of delivery time. It also counts eligible placement decisions, unique cells considered, the maximum decisions at one cell, and successful floor repairs. A high repeat count warrants tracing individual jobs. Tick mean and p95 measure headless execution, and comparisons across runners are approximate.

## Trace food from entry to first handoff

The assay observes incoming food when a non-porter uses its own entrance. It records the first time the carrier reaches an eligible handoff site, then a real chamber deposit or the decision to continue as a porter at reception. It reports p50 and p95 for completed trips, separately for travel and time after the first eligible site. Those stage percentiles need not add up. An interrupted trip leaves the tracked state without a handoff, for example when its carrier exits, loses the load, or dies. An outstanding trip is still being tracked at the checkpoint. The artifact reports its age and whether it is near the entrance, in a chamber, or elsewhere, and whether it has ever reached an eligible handoff site. This separates inbound trips from subsequent internal porter trips.

Placement instrumentation also reports the eight busiest fill sites. It distinguishes the number of slots involved from the largest count for one worker slot at each site. Slots can be reused, so this is an upper bound on repeat checks by an individual at that site.

## Sources

- [Lenoir et al. (2009), hydrocarbons in nest and home-range marking](https://doi.org/10.1007/s10886-009-9669-6)
- [Heyman et al. (2017), chemical road signs inside nests](https://doi.org/10.1038/ncomms15414)
- [Tschinkel and Seal (2016), underground deposition and backfilled chambers and shafts](https://doi.org/10.1371/journal.pone.0158920)
