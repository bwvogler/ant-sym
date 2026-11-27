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

The **Nest function assay** workflow compares current backfill and the trace fallback using paired world and random-stream starting seeds. The first colony gets the treatment, and the rival keeps the current rules. Both use the bounded one-world map, with no live Jev calls or fungus intervention. The PR workflow plays both variants for 600 simulated seconds. Seeds 17 and 29 start with 100 workers per colony, and seeds 7 and 43 with 300. Once the workflow is available on the default branch, manual dispatch offers 300, 600 or 1,200 seconds. Each runner uploads one JSON file with minute checkpoints, and the summary compares final checkpoints.

Run a pair locally with Node 22.18 or newer:

```sh
node scripts/lab/nest-function.mjs 17 600 100 nest-17.json
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

An initial local ten-minute run at 100 workers per colony found no eligible placements in seeds 17 and 29. Both policies delivered the same amounts (353 and 852 food units) on those seeds. Those runs verify the long-game metric path and do not establish an effect on nest function.

Analyses should retain paired seed results. Trajectories and random draws can diverge after a different move. Compare food and useful access together, since lower soil hauling or faster travel could come at the cost of an effectively smaller nest.

## Sources

- [Lenoir et al. (2009), hydrocarbons in nest and home-range marking](https://doi.org/10.1007/s10886-009-9669-6)
- [Heyman et al. (2017), chemical road signs inside nests](https://doi.org/10.1038/ncomms15414)
- [Tschinkel and Seal (2016), underground deposition and backfilled chambers and shafts](https://doi.org/10.1371/journal.pone.0158920)
