# Delivery actions: choose a destination without a chamber address

Question: how does a carrier find and recognise a place to leave food?

## Evidence

Heyman et al. (2017) found chemical road signs affecting movement within laboratory nests of *Camponotus fellah*. This supports using local floor cues; it does not establish a universal set of four labelled destinations. Retrieved article summary; quantitative measurements remain **unverified** here.

Tschinkel, Rink and Kwapich (2015) describe staged transport of incoming seeds into deeper chambers in *Pogonomyrmex badius*. Keeping food, moving it and handing it off can be distinct acts. This does not show that ants know every chamber's unmet need or address. Retrieved abstract and indexed article text; no numerical calibration is inferred.

**In the game:** extend the existing carry response with `to reception`, `to store`, `to brood`, and `to royal`. These choose a kind of place, never a chamber ID or coordinates. With `deliveryLane` enabled, a food carrier commits to that role, follows the existing floor-mark cues, and asks the existing drop response only while physically inside a matching perceived chamber. The four labels and commitment semantics are **design**. Other load types retain their existing transport rules. The default carry answer remains `take`.

## Contract and assays

The owner approved decomposing delivery decisions and continuing the workplan. This is ja-g7nz.3's first implementation slice; the broader interruption and congestion experiments remain separate work.

- `deliveryLane: 0` preserves legacy execution and RNG consumption; it is the default. `1` permits explicit destination answers. No extra policy lane or situation field is added.
- `take` retains an already selected destination. A new explicit destination replaces it and invalidates its previous movement step. `put down` cancels only when the load was actually released. Losing or delivering the food ends the commitment; new loads cannot inherit it. Contact retreat retains the food and goal.
- On the surface the ant still homes to its familiar entrance. Underground in its own nest, it follows neighbouring walkable cells' destination marks; without marks it searches by local wall-following. It never falls back to a vector to an unseen destination. Missing/erased cues mean continued search with the load, not automatic disposal or selecting a hidden chamber.
- Completion requires standing in a chamber of its own colony and perceiving the chosen role, then a positive drop response. A swapped store/brood cue can cause a real misdelivery. Blunted cues prevent recognition. Depositing preserves food and porter accounting.
- Trace the current destination and last outcome without querying the policy or drawing randomness. Test forks, moved/deleted chambers, cue swaps/erasure, repeated retention, changed destination, drop refusal, emergency release, slot reuse and JSON saves. These are design-contract tests, not biological calibration.

## Play

Carriers can pass a nearby chamber to seek another kind of destination, or leave food where misleading floor cues suggest it belongs.
The fungus's existing floor-mark strength and brood/store swap gain consequences for an explicit ant choice; the player gets no direct ant-command button.
Inspection names the requested destination and why the carrier is still searching or keeping food. No magical destination is drawn on the map.
Cached execution still spends nothing. The carry question gains four answers but no situation dimensions or additional calls; response-cache version must change.
The risk is stranded food when signs disappear, or an impoverished brood chamber under a bad doctrine. Default promotion needs colony-scale food and survival assays; bounded search/replanning is follow-up work, not a hidden timer in this slice.

## Open questions

When should a failed search trigger another destination choice? What local evidence should suggest feeding larvae versus stocking a store? This slice exposes executable role choices; it does not replace all porter recruitment and hunger-table decisions, or implement meal interruption and doorway congestion policy.

## Sources

- Heyman et al. 2017: https://doi.org/10.1038/ncomms15414
- Tschinkel, Rink and Kwapich 2015: https://doi.org/10.1371/journal.pone.0139922

## Implemented and measured, 2026-11-18

The explicit role path is implemented behind `colony.deliveryLane` (default 0). Existing `carry` and `drop` hooks remain separate; no extra response call is added. Response brain version 14 invalidates older response caches. The selected role and inspection outcome add two bytes per ant and survive saves; spawn resets both. Underground routing follows only walkable neighbour cells and locally sensed role marks; the prior chamber-ID and stalled-vector shortcuts are bypassed while this action is active. Surface travel retains the familiar entrance route.

The ant card now explains its current destination, missing cues, drop refusal, or last successful/interrupted delivery. Reading this explanation makes no policy or RNG call. Old default behavior and all four simulation golden recordings remain unchanged.

The reproducible fork experiment is `web/src/colony/tests/int/deliveryAction.test.ts`: a fixed small-world nest fixture with a store and brood chamber, 20 game RNG seeds, both requested destinations, and healthy versus swapped cues. All **80/80** trials physically delivered within the three-second test limit; every cue swap reversed which actual chamber received the food. This is a controlled design-contract experiment, not a colony-scale food/survival result or a biological timing claim.

Other checks cover explicit drop refusal, passing the wrong chamber, foreign-chamber rejection, absent/changed roles, erased cues, portal homing, held-food and porter accounting, stale movement targets, retreat/release, slot reuse, read-only inspection and JSON continuation. The final focused run passed 33 tests.

### Trying the experiment

In an offline harness, set the colony's `deliveryLane` to 1 and supply a carry response returning a role answer. For example, using the existing `responses` helper:

```ts
game.player.params.deliveryLane = 1;
game.player.responses = responses({
  carry: t => t.carrying === "food" ? "to brood" : "take",
});
```

This is an experimental ant doctrine, not a direct player command. The default local carry answer stays `take`, so enabling the setting alone does not invent a new doctrine. No new player lever or automatic default promotion is included.

### Remaining work

ja-g7nz.3.2 tracks bounded search/replanning, interrupted meals, congestion and broader counterfactual traces. A missing cue currently means searching with the food indefinitely unless the carry policy changes its answer or releases the load. Legacy porter recruitment still consults colony-wide need tables; the explicit delivery route bypasses those tables only after a destination is chosen. Colony-scale throughput and survival remain prerequisites for enabling a new default doctrine.

### Validation record

Typecheck, lint (existing warnings only), formatting and production build passed. The broad run started before the final search-state fix: 1,353 passed, two failed, four TODOs. One failure caught the delivery search-state assignment in the wrong tunnel branch; moving it to the delivery cue choice fixed it, and the final 33-test focused run passed, including the 80 fork trials. The remaining broad-run failure is the previously reproduced Node 24 CI-report timeout-fixture mismatch tracked in ja-dkgo; it is unrelated to delivery. All four ant/fungus simulation goldens passed unchanged. The full suite was not repeated after the focused fix.

## Recovery assays, 2026-11-18 (ja-g7nz.3.2.1)

`tests/int/deliveryRecovery.test.ts` characterizes the existing action before introducing another sense or choice. Six tests passed:

| Intervention | Result | Limit of the claim |
|---|---|---|
| Fill the chosen next cell with rock | The movement step is reconsidered locally; the role and food remain | Does not prove eventual escape from every maze |
| Remove the brood role, then change the carry policy to store after one second | 20/20 RNG seeds deposit in the store within the following five seconds | The harness schedules the replacement; the ant cannot yet sense failed-search duration |
| Hungry carrier feeds beside stocked store | Energy rises, jaws retain the load, brood delivery resumes; stock + eaten + carried food conserved | Feeding is instantaneous in `body`, not a timed interruptible meal |
| Save during failed delivery, reload, apply identical replacement | Subsequent game saves match exactly | Policies must be reattached to both games |
| Inspect the search explanation 100 times | Next 50 RNG draws and saved state match an uninspected control | Observability guard, not a behavioral intervention |
| Send 1, 8 or 24 carriers through the same one-cell passage | All loads arrive in three ticks in each case; none duplicated and all carriers alive | This fixture produces no congestion penalty; it cannot validate queuing or yielding |

These are synthetic contract assays, not biological timing calibration or colony-scale survival evidence. No production behavior, question wording, cache key, or default setting changes in this slice; incremental Jev cost is zero. The same-seed trace comparison holds random draws equal only while inspection is the sole intervention; diverging trajectories must not be described as having identical subsequent draws merely because their seeds match.

The broader ja-g7nz.3.2 remains open. Its children separate the remaining decisions: ja-g7nz.3.2.2 researches locally sensed failed-search evidence and bounded policy commitment; ja-g7nz.3.2.3 researches timed feeding and passage congestion. A hidden timer that chooses another chamber would bypass the policy, so it is not added as an unmeasured fallback. The player still gets the existing delivery explanation; there is no new control or implied colony-scale readiness.

## Bounded reconsideration design (ja-g7nz.3.2.2)

Bolek, Wittlinger and Wolf (2012), *Cataglyphis fortis*, found that food quantity and successful experience alter the focus of later searches. Their abstract reports that repeated success can maintain thorough searching even when food quantity is low. Joshi and Dornhaus (2026, accepted/in press), *Solenopsis xyloni*, report that removing a trail segment prompted abandonment in many workers, but a richer resource increased persistence. These are primary-study abstracts; full-text quantitative timing is **unverified**. Neither establishes a give-up deadline for food delivery inside a nest. This is evidence against a compulsory fixed-time destination switch.

**In the game:** an opt-in `deliveryReconsider` setting supplies the number of seconds at which the current delivery attempt is described to carry as `long`, versus `brief`; `none` means no enabled active attempt. This is a **design** approximation to internal effort/experience, extending the own-body sense row. It measures time spent with a chosen role in the ant's own underground nest, including retaining food at a destination. It does not measure true distance, hunger elsewhere, or whether an unseen chamber exists. Outside/foreign travel pauses the clock. The timer saturates at the threshold; repeated `take` or the same role cannot reset it. A genuinely different role starts another attempt, and actual release/completion/disabled tracking clears it. A policy may still persist indefinitely; the bound is when it receives evidence, not a guarantee of delivery or compulsory abandonment.

The three-valued field `deliveryAttempt` belongs only to carry's cache key and payload. Other response payloads omit it. No extra policy call or RNG draw is added; one Float32 field costs four bytes per ant. The setting defaults to zero, so ordinary execution and simulation goldens must remain unchanged. The carry state space grows by at most threefold; token-size estimates will be recorded after implementation, and cached execution remains free. Existing local carry remains `take`; an offline experimental doctrine can redirect `long` attempts to store or choose release.

Assays first: threshold crossing; same-answer retention without resetting; changed-role reset; release and slot reuse; surface pause; disabled tracking; full-game lost-role recovery across seeds 1–20 driven only by the new Touch field; a persistent policy retaining food after the threshold; deterministic saves and readonly inspection. The timer also covers successful cue following without arrival, preventing positive but misleading marks from indefinitely postponing the signal. It does not add meal durations or doorway exclusion.

For play, the ant card reports a long unresolved attempt and the current goal. Existing fungal cue distortion can make that state occur, but the fungus receives no direct target command. No default promotion is planned until colony-scale survival and throughput tests exist.

Additional primary sources (abstracts retrieved 2026-11-18):
- Bolek, Wittlinger and Wolf 2012, *What counts for ants?* https://doi.org/10.1242/jeb.071761 (https://pubmed.ncbi.nlm.nih.gov/22915712/)
- Joshi and Dornhaus 2026, *Persist or give up?* https://doi.org/10.1007/s00040-026-01089-7 (https://experts.arizona.edu/en/publications/persist-or-give-up-fire-ants-motivated-to-search-for-a-high-quali/)

### Implemented reconsideration and checks

`deliveryReconsider` defaults to 0; a positive value is the effort threshold in seconds. `Touch.deliveryAttempt` is none/brief/long and is transmitted/keyed only for carry. One Float32 per ant stores the saturated duration. Response brain version 15 invalidates old response contexts; shipped page bundles are unaffected because response lanes are not shipped by the page (the precache checks pass). No extra call or draw is made. The shared response legend does describe the field to every response lane, even though only carry receives its value.

Seven new effort tests passed. In 20/20 fixed-fixture RNG seeds, a policy conditioned solely on `deliveryAttempt` redirected a load from a removed brood role to a store within six seconds, without changing doctrine during the run. A persistent policy instead kept its food after the threshold. Surface/foreign travel pauses, repeated-answer retention, changed-role reset, release/completion, slot reuse, carry-only keys/payloads and mid-attempt save continuation are covered. These are controlled recovery results, not whole-colony survival measurements.

The 54-test focused run passed; all four simulation goldens stayed unchanged. Typecheck, lint (existing warnings) and production build passed.

Offline single-situation request estimates (`estimateTokens`, doctrine `forage`, the same empty worker/chamber fixture before and after):

| Lane | Before | After |
|---|---:|---:|
| get | 1,976 | 2,100 |
| carry | 2,303 | 2,439 |
| drop | 1,976 | 2,100 |
| trail | 2,090 | 2,215 |
| contact | 2,130 | 2,255 |
| leave | 2,247 | 2,372 |

Carry adds 136 estimated input tokens per single-item request (~5.9%), or $0.000005712 at the repository's $0.042/M estimate. This is not a measured hourly bill: batching and encountered situations matter. Other lanes incur shared-legend overhead, but no extra state dimension. Carry has at most three states for a prior situation. No live Jev call was made; cached execution remains free.

Example offline doctrine, with `deliveryLane = 1` and `deliveryReconsider = 1` (one second is an assay choice, not a recommended biological threshold):

```ts
game.player.responses = responses({
  carry: t => t.deliveryAttempt === "long" ? "to store"
    : t.deliveryAttempt === "none" ? "to brood" : "take",
});
```

This deliberately uses one fallback role. Choosing the same fallback again does not reset effort. A policy that alternates different roles can still thrash, and a persistent policy can still strand a load; neither is repaired by an omniscient default. Threshold calibration, colony-scale survival/throughput and timed meals/traffic remain open.

The complete unit tier passed 575/575. The response regression file passed 29 tests and found one old carry-key assertion; the assertion was updated to include effort while still excluding contact-only alarm/odds, and the two targeted contact tests then passed. Formatting passed. The full all-tier suite was not repeated for this slice; its known Node 24 CI-report fixture issue remains tracked separately as ja-dkgo.

## Colony pilot and reverse-cue fix (ja-g7nz.3.3), 2026-11-18

The tiny fork tests did not predict colony performance. A reproducible offline harness now lives in `scripts/lab/delivery-calibration.mjs`; raw runs are in `experiments/delivery-calibration/`. Two generated worlds (seeds 1 and 2), 60 initial ants, a 160×100 plane, one colony, no rival, 600 simulated seconds, no forced food/positions/cues and no live calls were used. These are diagnostic pilots, not the required training seeds 1–10 and held-out seeds 11–20. The larger sweep is deferred because the pilots already fail the retained-load guard; the available GitHub connector also does not expose workflow dispatch.

Both initial nests had only a royal chamber for the player. The earlier synthetic doctrine (brood, then store) therefore chose roles absent from these nests, and deposited zero food in the initial 120-second pilots. The harness does not reveal the chamber table to the policy. A fixed royal doctrine, and brood followed by royal on the effort signal, distinguish absent destinations from the ability to reach a destination that exists.

Two negative controls use the shipped default and explicit-lane-enabled `take` with no selected role. Their recorded metrics match in both seeds: 444/698 food stored, 90 living workers, 30 births, no hunger deaths, and maximum 1/0 loads held over 120 seconds. Same-seed treatment runs start from the same RNG state; diverging trajectories do not retain identical subsequent draws.

### Local turn correction

The directed route scorer excluded the neighbour directly behind even when a changed goal invalidated its movement step. A regression failed with the store behind at cue strength 100 and a forward cue of 1: it chose forward. Explicit delivery now considers the reverse cue on a **fresh** movement step (new goal or invalidated target). Continuing cell-to-cell paths retain the no-immediate-retrace rule. No destination address, new sense, policy call or RNG draw is added. Default routing stays unchanged.

Allowing reversal at every cell was tested and rejected: direct royal deliveries fell from 354/684 to 0/50, with 58/56 long-held loads. The final narrow correction preserves the direct-royal outcomes exactly. It improves one bad redirection case but does not solve general recovery, and several other treatment metrics worsen; it is a correction to local goal reconsideration, not a promoted navigation strategy.

| Doctrine | Seed 1 stored, before → final | Seed 2 stored, before → final | Final max loads held >120 s, seeds 1/2 |
|---|---:|---:|---:|
| Default | 444 → 444 | 698 → 698 | 1 / 0 |
| Always royal | 354 → 354 | 684 → 684 | 0 / 0 |
| Brood → royal after 5 s | 0 → 99 | 272 → 245 | 28 / 15 |
| Brood → royal after 20 s | 150 → 125 | 366 → 331 | 20 / 0 |

Final five-second treatment populations were 82/90 (22/30 births); twenty-second populations were 89/90 (29/30 births). Queens survived and no adult hunger deaths or brood starvation were recorded in these runs. Survival alone would have missed the food-flow and retained-load failures. Neither 5 nor 20 seconds earns default promotion. Direct royal delivery also fell short of baseline throughput, especially seed 1 (354 vs 444).

The harness records goal starts, replacements, completions, effort exposure, carried food, long-held loads, food stores, births and sampled unresolved carriers. Local measurements take under a minute for each five-variant seed run; wall times are instrumentation, not a performance benchmark. `harness-source.txt` preserves the exact pre-formatting harness matching the SHA recorded in each raw JSON. The JSON's `commit` is the initial simulation baseline; `routingVariant` distinguishes original, rejected always-reverse and the final fresh-reverse patch.

Reproduce the final treatment pilot from the repo root:

```sh
node scripts/lab/delivery-calibration.mjs --seed 1 --seconds 600 --ants 60 --variants baseline,retain,royal,royal5,royal20 --out pilot.json
```

Repeat with seed 2. The broader calibration remains open under ja-g7nz.3.3; ja-g7nz.3.3.2 tracks long-held loads after redirection before proceeding to a 20-seed promotion sweep. The reverse-cue bug is ja-g7nz.3.3.1. All 28 delivery tests and four unchanged simulation goldens passed after the narrow correction.

## Cue-cycle diagnosis (ja-g7nz.3.3.2), 2026-11-18

The remaining failure is reproducible without a blocked wall or a missing royal chamber. In seed 1's five-second redirection pilot, worker 11 has held food for 547.83 seconds at the end. The final two-second trace repeats cells (-27,65), (-26,65), (-26,66); wall-following is inactive, the royal commitment remains active, and effort stays at its five-second ceiling. None of those cells is a chamber. The worker last visited a marked chamber over 528 seconds earlier, so this trace does **not** establish that its own deposits sustain the loop. Other traffic and field evolution need separate intervention to attribute the marks.

The scorer chooses the largest allowed neighbouring mark even when it is weaker than the current cell. Its no-immediate-retrace rule prevents two-cell reversal, but permits a three-cell cycle with successive 120-degree turns. At the strongest cell, the next cycle cell can beat an open exit. `deliveryLoops.test.ts` reduces this to four open cells with fixed marks. A pending regression asserts escape through the fourth cell and **currently fails**, tracked by ja-g7nz.3.3.2; it is explicitly marked TODO, not counted as a pass. A passing companion test verifies that positive cue following does not suppress the long-attempt signal and that an effort-conditioned carry response can put the food down with exact accounting. Release is not deposition into colony stock, and this isolated test does not establish a useful colony doctrine.

### Rejected local-gradient trial

A trial required a neighbour's cue to exceed the current cell's cue, otherwise using the existing wall-follow search. It was reverted: in seed 1 at 600 seconds, direct royal stored 296 instead of 354; brood→royal at 5 seconds stored 113 instead of 99 but increased maximum loads held over 120 seconds from 28 to 38; at 20 seconds it stored 159 instead of 125 and reduced the maximum from 20 to 5. Improving the last case does not justify the worse controls. No seed-2 run or full sweep was warranted after that failure. The exact rejected patch and raw results are retained as `experiments/delivery-calibration/rejected-uphill.patch` and `seed1-uphill-rejected.json`. The JSON identifies the base commit, original harness hash and trial patch; the patch is **not applied** to production code.

### Reproducing and checking the trace

```sh
node scripts/lab/delivery-calibration.mjs --seed 1 --seconds 600 --variants royal5 --trace-ant 11 --out experiments/delivery-calibration/seed1-loop-trace.json
```

`--trace-from` changes the start time (default: the final two seconds). Samples are every three ticks, capped at 600 per variant. They include the physical cell and movement target, local neighbouring marks/solidity, role, effort, wall state and chamber underfoot. These are harness diagnostics, not new policy inputs. Layer binding and the shared cell scratch are restored after reads. Every pre-existing result metric except wall-clock runtime matched the earlier untraced seed-1 royal5 pilot exactly; the trace's harness hash refers to the final script in this commit.

Next work is a researched local loop-recovery design and measurements against this open-exit fixture and the colony controls. A timer that silently chooses another destination, global chamber routing, and uphill-only scoring are not established solutions. The existing long-attempt signal alone does not guarantee progress: the pilot doctrine repeatedly chooses its already-active royal destination. No production behavior, default, response key or token cost changes in this diagnostic slice; no live calls were made.

Validation for this slice: 29 delivery tests passed, with the one explicitly pending escape regression still failing as expected. Typecheck, lint (existing warnings) and changed-file formatting passed. The simulation production files have no diff; build, goldens and the full test suite were not rerun for these harness/test/documentation changes.

## Sampled local turns (ja-g7nz.3.3.2.1), 2026-11-18

### Evidence and scope

Perna et al. (2012) studied *Linepithema humile* exploring an arena. They found turning related to local left/right pheromone differences and showed how directional noise can yield nonlinear collective branch choice. This supports considering variable local turns; it does **not** validate a particular underground delivery rule, turn coefficient, or escape deadline. Source: [full primary article](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1002592), retrieved 2026-11-18. The game's existing food-trail follower already uses squared cue-weighted choice (`grid.choose`; [trails](trails.md)).

**In the game:** tune the existing experimental local delivery scorer, using only its current direction, walkable neighbours and existing role marks. A continuing cell choice weights a positive cue by `(1 + cos(turn))/2`, then samples in proportion to that weighted cue squared. Straight, 60-degree and 120-degree turns therefore have direction factors 1, 0.75 and 0.25 before squaring. These coefficients and the translation to nest delivery are **design**, not measured biology. Sharp bends remain possible. Immediate retracing remains excluded on continuing steps; fresh goals still deterministically consider all six directions, preserving the earlier reverse-cue correction. A retained movement target or no positive cue consumes no route draw; unmarked search retains wall-following. No new memory, sense, action, timer, global chamber read or policy call is added. The role and food remain committed until the existing policy changes or releases them.

The purpose is to remove a deterministic three-cell trap. It is not a general maze solver: a marked cycle with no marked exit can still trap a carrier, and sampling gives no hard escape deadline. The carry policy can still persist indefinitely. The one reusable six-weight buffer is scratch, not saved state; normal RNG state makes saves replayable.

### Tests and pilots

The former pending escape test now passes for 20/20 fixture seeds within 60 centre-to-centre choices, with food and role retained. This is a route-choice bound, not 60 seconds or a colony survival claim. Tests also cover usable sharp bends, a weaker-cue exit having nonzero probability, increased preference after strengthening a cue, unchanged targets, erased-cue search, effort-conditioned release and JSON continuation. The whole delivery suite passes 34/34 with no pending escape test.

A deterministic turn penalty was first tested and rejected: seed-1 direct royal storage improved354→397, but five-second redirection fell99→84 and still held up to28 loads over120 s. Twenty-second storage was141 with9 long-held loads. The exact rejected patch and raw run are retained as `rejected-turn-weight.patch` and `seed1-turn-weight-rejected.json`.

Final sampled-turn pilots use the same two generated worlds, 60 starting ants and 600 seconds as before:

| Doctrine | Seed 1 stored, before → sampled | Seed 2 stored, before → sampled | Max loads held >120 s, before → sampled (seeds 1 / 2) |
|---|---:|---:|---|
| Default | 444 → 444 | 698 → 698 | 1 / 0 → 1 / 0 |
| Lane enabled, retain only | 444 → 444 | 698 → 698 | 1 / 0 → 1 / 0 |
| Direct royal | 354 → 420 | 684 → 680 | 0 / 0 → 0 / 1 |
| Brood → royal at 5 s | 99 → 166 | 245 → 372 | 28 / 15 → 3 / 0 |
| Brood → royal at 20 s | 125 → 135 | 331 → 311 | 20 / 0 → 5 / 0 |

The change removes the reduced deterministic trap and improves the five-second treatment in both pilots, but is not a universal improvement. Direct royal loses four deliveries and gains one long-held load in seed2; twenty-second redirection loses20 deliveries there. Remaining held loads and throughput below baseline keep ja-g7nz.3.3.2 and calibration open. The two seeds guided exploration; they are **not** independent validation. Neither effort threshold nor a new default doctrine is selected. The production default remains `deliveryLane: 0`.

Raw final results: `seed1-sampled-turns.json`, `seed2-sampled-turns.json`. Each records the base commit, exact `sampled-turns.patch` for the route change, and routing/harness hashes. To reproduce at this implementation, use the pilot command with `--variants baseline,retain,royal,royal5,royal20`. Different trajectories consume different random draws; comparisons are paired initial seeds, not equal subsequent randomness.

For play, explicit deliveries can deviate from a local cue cycle while retaining their role, and distorted marks still influence movement. There is no new player control or response-cache dimension. Incremental Jev token cost is zero; no live calls were made. Broader colony calibration, remaining trapped loads and absent-role doctrines still need work before default promotion.

Final validation: all34 delivery tests and all four simulation goldens pass unchanged; typecheck, lint (existing warnings), changed-file formatting and production build pass. The full all-tier suite and multi-minute slow guards were not rerun. Final populations for direct/5-second/20-second treatments are90/90/89 in seed1 and90/90/90 in seed2; queens survive, with no adult hunger deaths or brood starvation recorded. These short pilots still do not establish long-term survival.

## Remaining carriers and royal-mark capacity (ja-g7nz.3.3.2.2), 2026-11-18

After sampled turns, remaining long-held loads are not necessarily frozen or cycling over three cells. In seed1's final60 seconds, the royal20 worker54 visited83 distinct cells and the royal5 worker33 visited119, sampled every three ticks. Neither entered a chamber; both had wall state0 in all600 samples. Travel/search sample counts were584/16 and577/23. Royal cues were often near the cap20. These observations motivated a capacity intervention; they do not establish that saturation caused either worker's failed delivery. Trace summaries and visited-cell counts are in `remaining-carrier-traces.json`; the full traces can be reproduced at its recorded commit with `--trace-ant 54 --variants royal20 --trace-from 540` or slot33/royal5, seed1,600 seconds.

The pilot harness now accepts `--royal-cap` (default20), changing only the player's home-layer royal channel before the first tick, using the existing per-channel capacity setting. It copies parameter objects so other colonies and shared defaults are untouched. This is a **harness intervention**, not a production setting or changed default. Final `royalField` reports cells with cue>=0.05, cells at>=90% of the selected cap, and the maximum value. Those are end-of-run counts, not time-integrated saturation or a policy input.

Same generated worlds,60 starting ants,600 simulated seconds, no rival/live calls:

| Doctrine | Seed1 stored, cap20 →80 | Seed2 stored, cap20 →80 | Peak loads held>120s, seed1 | Peak loads held>120s, seed2 |
|---|---:|---:|---:|---:|
| Default / retain-only |444 →491|698 →690|1 →0|0 →0|
| Direct royal |420 →331|680 →656|0 →0|1 →0|
| Brood →royal at5s |166 →154|372 →430|3 →0|0 →0|
| Brood →royal at20s |135 →165|311 →333|5 →2|0 →0|

The cap80 intervention **fails as a general fix**. It reduces retained loads in several cases but hurts direct-royal throughput in both seeds and five-second throughput in seed1. It also changes the default colony's behavior, so its treatments must be judged against the corresponding cap80 baseline, not only cap20. In the five-second treatment, final near-cap cells fall214→34 /218→58; this confirms a field change, not a uniquely identified cause of delivery improvement. Trajectory-dependent random draws diverge as usual. Production capacity remains20; no threshold or doctrine is promoted.

Raw results are `seed{1,2}-royal-cap{20,80}.json`. Example:

```sh
node scripts/lab/delivery-calibration.mjs --seed 1 --seconds 600 --variants baseline,retain,royal,royal5,royal20 --royal-cap 80 --out pilot.json
```

All four runs completed. At cap20, every previously recorded metric except runtime matches the prior sampled-turn pilot exactly. Default and retain-only controls agree in each seed/cap pair. The recorded harness hash matches the committed script. Syntax checking and formatting pass; production code is unchanged, so build and simulation tests were not repeated for this diagnostic slice.

### Next policy-context slice (ja-g7nz.3.2.4)

The carry response currently receives coarse `place` (chamber/tunnel/etc.) and effort, but neither its own committed destination nor the recognised role underfoot. Thus a stateless cached policy cannot distinguish a long brood attempt from a long royal fallback when its other fields match. The pilot deliberately persists at its royal fallback; reducing repeated small loops cannot make a missing brood chamber appear.

Proposed next change: expose the existing commitment and locally perceived delivery role **only to carry**. Each is one of none/royal/brood/store/reception. Underfoot recognition must reuse fungal attenuation/swap semantics and physical position, with no search for unseen chambers, global availability flags or colony hunger totals. This adds no new physical sense: it carries the existing floor-mark recognition and the ant's own selected action into the decision context. It does expand carry's possible keys by at most25 combinations, so it needs a response-version bump and offline request-size measurements; other response payloads/keys should remain unchanged. Defaults stay off.

Tests before promotion: distinguish identical effort with different commitments; swapped/erased underfoot cues; surface/foreign-place handling; carry-only payload/key isolation; same-role retention versus explicit change/release; save/replay; and paired generated-world doctrines that exploit this context without reading hidden role availability. The broader navigation and colony-calibration beads remain open. This paragraph is a plan, not a claim that the new fields or a successful doctrine are implemented.

### Carry context results (ja-g7nz.3.2.4)

Carry now receives `deliveryTarget` (its existing commitment) and `deliveryPlace`
(the existing chamber-floor role recognised at its physical cell). Both use
none/royal/brood/store/reception. Recognition uses the ant's layer, an open cell,
its own chamber, and existing mark availability, gain and brood/store swapping.
Neither field certifies a distant destination exists. Disabled delivery and
non-food local-place queries report none. No new saved arrays, random draws,
policy calls, automatic fallback, or default changes were added.

Response version 16 separates the new cache contract. The fields appear only in
carry payloads and keys (at most 25 times the prior carry combinations); other
lanes retain their situation keys. The shared legend changes all response context
hashes. For one food-carrying situation with target brood/place store and doctrine
forage, the repository's offline token estimator rises from 2,439 to 2,626 tokens
for carry (+187). Other response requests gain 163–164 estimated tokens from the
345-character shared legend addition; their situation payloads are unchanged.
These are estimates, not billed usage; no live calls were made. See
`experiments/delivery-calibration/carry-context-cost.json`.

The `context20` pilot policy accepts a recognised delivery room underfoot,
otherwise starts toward brood and changes a long brood attempt to royal. It keeps
an existing royal commitment. This is a test doctrine, not the local default.
Generated maps, 60 initial workers, 600 seconds, royal cap 20:

| Doctrine | Seed 1 stored | Seed 2 stored | Maximum loads held >120s, seeds 1/2 |
| --- | ---: | ---: | --- |
| Default / retain | 444 | 698 | 1 / 0 |
| Previous brood→royal after 20s | 135 | 311 | 5 / 0 |
| Context-aware 20s | 279 | 562 | 0 / 0 |

All eight runs retained their queen, produced 30 births and had no hunger deaths
or starved brood. Baseline and retain match exactly in simulation metrics. The
new doctrine improves these two seeds but remains below baseline throughput;
there is no threshold selection or default promotion. Raw reports are
`seed1-carry-context.json` and `seed2-carry-context.json` in the same experiment
directory. Report commit identifiers name the pre-edit base; these reports were
run with this change. Harness formatting occurred while the pilots ran, so their
source hashes may differ despite identical policy logic.

Validation: all 37 delivery tests pass, including 20-seed recovery at a recognised
store, cue distortion, foreign/surface isolation, all 25 key combinations and
other-lane payload isolation. Save continuation now uses a target-aware policy.
The four simulation goldens remain bit-exact; schema/response-draw tests, shipped
precache tests, typecheck, lint and production build pass. Existing lint warnings
and the large-bundle build warning remain. Next: broaden generated-world
validation and test context-aware persistence/release doctrines before choosing
any default or reconsideration threshold (ja-g7nz.3.3).

### Persistence versus redirection versus release (ja-g7nz.3.3.3)

Fresh seeds 3 and 4 were compared with 60 initial ants for 600 seconds. All three
context policies accept a recognised room underfoot and otherwise start toward
brood. Their long-attempt choices differ: keep the target, switch brood to royal,
or put the food down. Both 20-second and 5-second thresholds were tested. Actual
release transitions and release requests are now counted separately from
successful deliveries and stored food. The harness also counts long carry calls
for context policies (previously that diagnostic counter skipped their branch).

| Policy | Seed 3 stored | Seed 4 stored | Long calls / releases |
| --- | ---: | ---: | --- |
| Default | 590 | 295 | 0 / 0 |
| Context persistence, 5s or 20s | 409 | 300 | 0 / 0 |
| Context redirection, 5s or 20s | 409 | 300 | 0 / 0 |
| Context release, 5s or 20s | 409 | 300 | 0 / 0 |

All six context variants match in every simulation metric within each seed
(excluding policy metadata and runtime). All 14 games retain their queen,
produce 30 births, and have no hunger deaths, starved brood or loads held over
120 seconds. **These maps do not exercise any timeout choice, even at five
seconds.** They support the effect of accepting a local recognised room; they
cannot establish that persistence, redirection or release is the better timeout
response. The context approach still loses 181 stored food on seed 3 and gains
only five on seed 4 relative to the scripted baseline. No winner or threshold is
selected, and defaults remain off.

A positive-control integration test supplies a long brood attempt in a tunnel
with no recognised delivery rooms, then lets the real game tick apply the policy.
Across 20 seeds per choice (60 cases), persistence retains the goal and saturated
effort; redirection selects royal and resets effort; release clears the goal and
places exactly one food unit on the ground. None increases stored food. This
checks action execution and accounting, not colony-scale timeout performance.

Reproduce from this change:

```sh
node scripts/lab/delivery-calibration.mjs --seed 3 --seconds 600 --ants 60 --variants baseline,contextPersist20,context20,contextRelease20 --out /tmp/delivery3-20.json
node scripts/lab/delivery-calibration.mjs --seed 3 --seconds 600 --ants 60 --variants contextPersist5,context5,contextRelease5 --out /tmp/delivery3-5.json
# Repeat with --seed 4.
```

Reports: `experiments/delivery-calibration/seed{3,4}-carry-doctrines{,5}.json`.
Their commit field identifies the pre-edit base, not the changed working tree.
The exact 20-second run source is `context-doctrines-harness20.txt`; five-second
reports match the current harness source hash. All source hashes and matched
context metrics were checked. The 25 pre-existing delivery action/effort tests
pass, and the expanded effort suite passes all 11 tests including the 60-case
positive control. Harness syntax, formatting, diff whitespace and typecheck pass.
Production behavior is unchanged; build and goldens were not repeated for this
experiment/test-only change.

Next calibration needs a generated-world stress condition that actually produces
long attempts (such as loss of recognised floor cues), followed by the planned
1–10 training / 11–20 confirmation sweep. Do not interpret unexercised branches
as equivalent policies. The available GitHub connector cannot dispatch the assay
workflow, so the full runner sweep has not been started or claimed complete.

### Temporary floor-cue loss and recovery (ja-g7nz.3.3.4)

A harness-only intervention now sets every player worker's existing `gainMarks`
to zero before each tick from 120 through 300 seconds, then restores one. It
requires an inactive fungus; this isolates the perception effect and is **not**
a simulated infection, dose-response experiment or new fungal ability. Workers
born during the interval receive the intervention on the next tick. Carry calls
are audited for recognised rooms during loss; any leak fails the run. Counters
at 120, 300 and 600 seconds separate suppression and recovery. Invalid windows
are rejected before simulation.

Two generated seeds, 60 initial workers, 600 seconds, five-second effort limit:

| Policy | Final stored, seeds 3 / 4 | Stored during loss | Stored after restoration | Releases | Peak loads held >120s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scripted default | 595 / 293 | 164 / 86 | 336 / 161 | 0 / 0 | 0 / 0 |
| Context persistence | 394 / 210 | 0 / 0 | 318 / 168 | 0 / 0 | 36 / 22 |
| Context redirection | 364 / 210 | 0 / 0 | 288 / 168 | 0 / 0 | 39 / 22 |
| Context release | 422 / 234 | 103 / 66 | 243 / 126 | 372 / 173 | 0 / 0 |

All six context treatments exercised long-attempt responses. None recognised a
room during suppression (53,842–211,387 observed food-carry calls per treatment).
All eight stressed games retained their queen, produced 30 births, and had no
hunger deaths or starved brood. An untreated seed-3 context control exactly
reproduces the earlier 409-food result and every prior simulation metric.
Persistence and redirection accumulate loads while marks are unreadable and
resume delivery after restoration. These two exploratory seeds do not establish
a generally preferable policy or biologically justified deadline.

**Release throughput is confounded (ja-g7nz.3.3.5).** The default delivery path
uses `foodTo` and chamber data without requiring the explicit action's perceived
room recognition. In `arrive`, pickup can be followed by `port` in the same tick;
`stanceStep` has already run the carry decision earlier. A newly picked-up load
with no explicit destination can therefore enter scripted delivery before the
carry policy chooses one. An observational wrapper of the existing `drop=true`
response on seed 3 counted **103 drop approvals with no chosen target during cue
loss**, exactly matching its 103 stored food in that interval. The audit preserves
all prior simulation metrics. Release itself remains separate from stored food:
372 releases versus 319 completed explicit deliveries and 422 total stored.
The accounting discrepancy is a policy-coverage gap, not evidence that erased
room cues were sensed or that the release action duplicated food.

Fix and regression-test this pickup-to-delivery gap before using these totals to
select a release policy. The scripted default is an implementation benchmark,
not a sensory-equivalent control. All production defaults remain unchanged.

Reproduce (repeat stressed command with seed 4):

```sh
node scripts/lab/delivery-calibration.mjs --seed 3 --seconds 600 --ants 60 --cue-loss-from 120 --cue-loss-to 300 --variants baseline,contextPersist5,context5,contextRelease5 --out /tmp/cue-loss3.json
node scripts/lab/delivery-calibration.mjs --seed 3 --seconds 600 --ants 60 --variants context5 --out /tmp/cue-control3.json
node scripts/lab/delivery-calibration.mjs --seed 3 --seconds 600 --ants 60 --cue-loss-from 120 --cue-loss-to 300 --variants contextRelease5 --out /tmp/cue-audit3.json
```

Raw reports are `seed{3,4}-cue-loss.json`, `seed3-cue-control.json` and
`seed3-cue-drop-audit.json` under `experiments/delivery-calibration/`. The first
nine games match `cue-loss-harness.txt`; the drop audit matches the current
harness. Their commit identifiers name the pre-edit base; source hashes are
verified separately. Ten games ran locally; the full runner training/holdout
sweep remains pending. All 11 delivery-effort tests pass, including the prior
60-case action/accounting control. Harness syntax, formatting, diff whitespace,
three invalid-window checks, report completeness, source hashes and unchanged
control/audit metrics pass. Production code is unchanged; build and goldens were
not rerun for this measurement-only slice.

### Pickup decision ordering fixed (ja-g7nz.3.3.5)

The failing integration regression reproduced a load being picked up and stored
without the custom carry response seeing it. `arrive` now defers `port` for a
newly picked-up food load when the delivery lane is enabled and a custom carry
policy is installed. The ordinary next tick's `stanceStep` chooses its action
before delivery. No extra response call, random draw, persisted field, cache
contract or token cost is added. Local carry and lane-off behavior retain immediate
legacy delivery. An explicit `take` answer can still use the existing scripted
route after the policy has had its choice; choosing a role uses its sensory gate.

Regression coverage includes destination selection under erased cues, explicit
`take`, release with food conservation, local/lane-off compatibility, and JSON
save/replay between pickup and the next carry choice. The pickup test fails before
the fix and passes after it. All 40 delivery tests and four unchanged golden
simulations pass; the strengthened pickup/replay tests also pass. Typecheck,
lint, production build, formatting and diff checks pass (existing lint and bundle
size warnings remain).

Matched cue-loss reruns use seeds 3/4, 60 initial workers, 600 seconds, zero mark
gain during 120–300 seconds and restoration afterward:

| Policy | Final stored, seeds 3 / 4 | Stored during cue loss | Releases | Loads held at restoration |
| --- | ---: | ---: | ---: | ---: |
| Scripted default | 595 / 293 | 164 / 86 | 0 / 0 | 10 / 6 |
| Context persistence | 394 / 210 | 0 / 0 | 0 / 0 | 49 / 40 |
| Context redirection | 364 / 210 | 0 / 0 | 0 / 0 | 51 / 40 |
| Context release, fixed | 410 / 228 | 0 / 0 | 1,256 / 753 | 58 / 45 |

The default, persistence and redirection match every previous simulation metric
(except runtime). Release's formerly uncommitted deliveries during cue loss fall
from 103/66 to **zero**, and its final food changes from 422/234 to 410/228. Room
recognition also remains zero during loss. All eight games retain their queen,
produce 30 births and avoid hunger deaths/starved brood. This closes the measured
pickup bypass; it does not remove the explicitly retained scripted `take` path.

Release recovers 16/18 more stored food than persistence, but generates over a
thousand/several hundred releases and has more held loads when cues return.
Repeated dropping/collection is a tradeoff, not successful delivery. The
`maxHeldOver120` metric counts observed continuous carrying, not the age of a food
unit through successive carriers; release can lower it without clearing backlog.
Before choosing a policy, measure ground-food backlog and repeated collection,
then compare recovery and survival on the planned broader seeds. No doctrine or
threshold is promoted; experimental defaults stay off.

Raw reports: `experiments/delivery-calibration/seed{3,4}-cue-loss-pickup-fixed.json`.
Use the prior section's cue-loss command with this production fix. The harness is
unchanged and its source hashes match. Report commit identifiers name the pre-edit
base; these runs include the `arrive` change in this commit. Full training/holdout
validation remains open under ja-g7nz.3.3.

### Loose-food backlog and repeated collection (ja-g7nz.3.3.6)

An observational ledger now measures home-layer food additions, actual removals
following approved pickup, repeated collection sites, peak deposited-food backlog
and its time integral. It wraps existing field writes and the original get rule;
it changes no answer or RNG draw. Checkpoints independently sum the field and
assert `initial + additions - removals = ground`. The original 6,216/8,172 loose
food units in these generated underground maps are excluded from deposited-food
backlog. The ledger records mixing with initial food; these runs have none.

The ledger tracks quantities and sites, **not food-unit identities**. Repeated
site pickup is not proof that one particular unit was collected repeatedly. If
initial food and new deposits mix, the accounting convention removes deposits
first and flags that ambiguity. In these treatments, additions equal successful
releases and every added unit is eventually collected again.

Fixed cue-loss pilots, seeds 3/4 (same 60 ants, 600 seconds, gain loss120–300s):

| Policy | Final stored | Releases / re-collected deposits | Peak ground deposits | Held + ground deposits at restoration |
| --- | ---: | ---: | ---: | ---: |
| Persistence | 394 / 210 | 0 / 0 | 0 / 0 | 49 / 40 |
| Release after 5s | 410 / 228 | 1,256 / 753 | 50 / 17 | 98 / 55 |
| Release after 20s | 413 / 236 | 317 / 178 | 16 / 7 | 75 / 54 |

For five-second release, 1,188/675 pickup events revisit previously used pickup
sites; one site sees70/25 collections. At restoration,40/10 deposited units are
still on the ground. Twenty-second release cuts total release/recollection events
by about75%, reduces peak ground backlog, and slightly increases final stored food
on both exploratory seeds. It still has more undelivered food at restoration than
persistence. Ground backlog reaches zero by600s in all cases; that does not mean
all food is delivered, since some remains carried. All eight runs retain their
queen, produce30 births and have no hunger deaths or starved brood. The scripted
baseline remains595/293 stored and is not a sensory-equivalent policy.

All six repeated baseline/persistence/release5 treatments match every previous
simulation metric, including phase checkpoints, after excluding added ledger
fields and runtime. Both harness and ledger source hashes are recorded and
verified. Two ledger tests cover repeated-site collection, unrelated removal,
initial-food mixing, cancelling pickup attribution, integration and conservation.
Syntax, formatting and diff checks pass. This slice changes experiment tooling,
not production behavior; production build/goldens were not repeated.

Reports: `experiments/delivery-calibration/seed{3,4}-backlog.json`. Reproduce with
`--variants baseline,contextPersist5,contextRelease5,contextRelease20` and the prior
cue-loss command. The report commit field is the pre-edit base; source hashes
identify the changed harness and ledger. Initial measurement runs were stopped
while separating initial food from deposits; the committed reports contain all
four completed variants with the final ledger.

### Fixed runner comparison (ja-g7nz.3.3.7)

`.github/workflows/delivery-calibration.yml` runs the same four frozen doctrines
on seeds1–20, at most four concurrent runners, with a ten-minute limit per seed.
It is manually runnable, and PR changes to these experiment files start it only
on the experimental action branch. It has read-only repository permissions and
makes no live policy calls. Artifacts and a complete per-seed report are retained
for30 days. Missing seeds/variants, mismatched source/configuration or recognised
rooms/uncommitted drops during cue loss fail the report.

Seeds1–10 are training (including already explored seeds);11–20 are confirmation.
Doctrines and timing are fixed before this batch. The workflow does not select a
threshold or promote defaults. Its PR trigger supplies the runner route despite
the connector lacking manual dispatch. Runner results must be inspected before
claiming the sweep complete.

### Twenty-seed runner result: no release-policy promotion

[Run 44433318190](https://github.com/bwvogler/ant-sym/actions/runs/44433318190)
completed all 20 seed jobs and its report successfully at commit `c632fc9a`:
80 games, four frozen policies per seed. CI and E2E at that commit also pass.
The exact downloaded artifact is `experiments/delivery-calibration/runner-44433318190.zip`
(SHA256 `c7cfe1317fffc5f051166d3359d5cd98fb659e36a0e3f1728b61e8ff9841058f`);
it contains `seed-1.json` through `seed-20.json`. Descriptive group/paired summaries
are in `runner-44433318190-summary.json`. All source commits, seed completeness and
cue-isolation counters were checked. No default, doctrine or timing changed
between training and confirmation.

| Group | Policy | Median stored [min,max] | Median releases | Median held + deposited food at restoration |
| --- | --- | ---: | ---: | ---: |
| Training 1–10 | Scripted default | 405.5 [202,908] | 0 | 10.5 |
| Training 1–10 | Persistence | 249.5 [162,523] | 0 | 46.5 |
| Training 1–10 | Release after 5s | 272.5 [160,532] | 961.5 | 70.5 |
| Training 1–10 | Release after 20s | 272 [171,553] | 288.5 | 61 |
| Confirmation 11–20 | Scripted default | 409 [37,826] | 0 | 9.5 |
| Confirmation 11–20 | Persistence | 274.5 [51,425] | 0 | 45 |
| Confirmation 11–20 | Release after 5s | 257.5 [32,419] | 1,033 | 70 |
| Confirmation 11–20 | Release after 20s | 256.5 [35,414] | 267 | 61 |

Release after 20s beats persistence on 9/10 training seeds (median paired gain 24.5 food),
but only 4/10 confirmation seeds (median paired difference −7, worst −45 on seed 13).
Release after 5s likewise loses to persistence on 6/10 confirmation seeds (median paired
−7, worst −56 on seed 11). Comparing release after 20s directly with release after 5s, confirmation
wins/losses are 4/6, median paired difference −5.5 and worst −56 on seed 20. These are
descriptive comparisons, not significance tests or claims of a universal optimum.

**Decision: do not promote either timeout-release policy.** The twenty-second
threshold substantially reduces repeated dropping relative to five seconds, but
that does not establish a reliable delivery improvement. Both increase backlog
at cue restoration compared with persistence. This rejects the promising
exploratory advantage; it is not an invitation to tune against the same
confirmation seeds. All 80 games had zero queen/hunger deaths and zero starved
brood during 600s; this limited horizon does not validate longer-term survival.
The scripted default still has direct chamber-target access, so its throughput
is not a sensory-equivalent biological baseline.

The calibrated experimental choices remain available, with defaults off. Further
policy changes should target a new hypothesis (e.g. a release decision conditioned
on a useful local cue) with fresh confirmation seeds, rather than another sweep
of the same timer. Other workplan gates, including independent review, full-colony
contact validation and timed feeding/traffic, remain open.

The workflow now has a latest-commit change gate: documentation/result/workflow-only
updates skip the 80 games; simulator/harness changes or manual dispatch run them.
The gate is checked with a temporary Git fixture (documentation skip, manual run,
simulation change run). This keeps recording results from automatically repeating
the entire completed experiment.

### G1 seed 12 long-held food

The directed-combat run at attack distance 0.65 reproduced the seed 12 failure: 2,423 food stored for the player colony, zero casualties, and three simultaneous forager loads held past 120 seconds. A one-second position trace identified the three concurrent loads as ants 609, 805 and 721. Each picked up food underground (at about 429.6, 439.8 and 465.0 seconds), stayed underground, and reached within 12 world units of its nest center less than 13 seconds after pickup. At 600 seconds, all three still held the load, 6.7–7.9 units from the nest center. Their final minute covered 19–25 distinct rounded positions per ant, so these were localized movement loops rather than stationary carriers or a surface entry failure.

The rival's long-held cases were on the surface and did not exceed the two-load limit. The player's earlier long surface trip resolved before the three concurrent underground loads appeared. A trace of distance to the nest center does not establish that any of the three actually stood in an accepting chamber.

Two 600-second comparisons use the same combat settings. After a carrier senses its own tunnel or chamber, the first rule selects a royal destination immediately. The second uses the same selection only after `since` reaches 60 seconds. This age is read by the assay from the current ant; it does not add information to the carry policy schema. The comparisons cover eligible indoor carriers, including porters. Both leave surface homing to the existing movement rules.

| Seed 12 arm | Player / rival food stored | Peak long-held forager loads, player / rival | Player porter trips | Royal choices | G1 |
|---|---:|---:|---:|---:|---|
| Existing delivery | 2,423 / 2,768 | 3 / 2 | 2,865 | 0 | fail |
| Immediate royal selection | 2,116 / 3,028 | 4 / 1 | 16,863 | 19,058 | fail |
| Royal selection after 60 s | 2,331 / 3,275 | 1 / 1 | 3,111 | 118 | pass |

The narrower rule cleared the seed 12 hold threshold with 92 fewer food units stored by the player. The runs diverge before the three baseline pickups, so this is a colony-level comparison. It does not establish that the same three trips would recover.

Reproduce with `node scripts/experiment.mjs game1 gameRoyalDelivery gameRoyalRecovery --seeds 12 --set game.fight.intent=true --set game.fight.attackDistance=0.65 --jobs 3`.

The independent seed 14 pair used the same 600-second settings. The delayed rule took the player from three to two long-held loads, but the rival still had five and G1 failed both runs. Player food fell from 3,419 to 2,914 (14.8%); rival food fell from 2,439 to 2,354. The peak on the surface was six in the base run and five after the player-side change. That remaining failure requires surface return navigation, while the player's throughput cost rules out promoting a blanket royal redirection. Next isolate the stalled trips themselves and distinguish chamber recognition failures from route failures before changing where carriers deposit.

Reproduce the holdout with `node scripts/experiment.mjs game1 gameRoyalRecovery --seeds 14 --set game.fight.intent=true --set game.fight.attackDistance=0.65 --jobs 2`.

#### Distinguishing a missed chamber from a refused drop

For the seed 12 replay, sample slots 609, 805 and 721 after each simulation tick while they are underground and have held food for more than 60 seconds. Look up the chamber under their continuous position with `cellOf` and `chambers.at`. Classify it by owner, role and size. The existing fallback accepts an owned store, royal chamber or reception with at least `RECEPTION_MIN` cells. Record porter status separately because porters can deposit from adjacent cells and use different fallback rules.

The paired intervention uses an otherwise identical replay and changes the three active loads at 550 seconds. At that point all three have passed the 60-second fallback age. Enable the player delivery lane and apply `chooseDelivery(c, i, "to royal")` to each of those three slots in its current layer. Leave the scripted carry and drop responses in place. Track the first tick each original load leaves the ant's jaws, using the delivery state to distinguish a completed deposit from other releases.

The baseline reproduced 2,423 player food stored, zero losses and three concurrent long-held loads. Slots 609, 805 and 721 spent all 3,313, 3,005 and 2,249 sampled ticks, respectively, in tunnels. Each stayed in return mode and none became a porter. Across 8,567 samples there was no accepting chamber underfoot. Changing only the drop response cannot recover these three trips because they never reach the fallback's drop site.

The paired replay delivered slot 721's original load at 589.73 seconds, 39.73 seconds after the redirect. Slots 609 and 805 still held their original loads at 600 seconds. The peak fell from three to two for the player and held at two for the rival, clearing G1's count bound. Player food was 2,413 versus 2,423 in the baseline, and both colonies still had zero losses. This establishes that an explicit destination can rescue one of the actual stalled trips in this window. The two remaining loads still reported travel to the royal chamber at 600 seconds.

#### G1 seed 14 surface return

A separate one-second trace of rival surface foragers reproduced six loads held over 120 seconds. All six remained on the plane at 600 seconds, 60–75 world units from their own entrance. Their final sampled positions cluster in x=205–225, y=77–90. Several of the earlier samples sit near generated rock. For example, the map has 65 solid cells out of 129 within six world units of (228, 97). The traces include both wall-following and free movement, and search radii differ across trips. These observations locate a common area of stalled returns. They leave open whether the ants' perceived entrance, their path around rock, or both caused the stalls.

At 550 seconds, a matched replay still had the six rival loads in slots 41, 48, 443, 510, 530 and 565. Their loads were 122–267 seconds old. Five ants were actively retracing their stored outbound route; one had finished retracing and was searching. The replay set each ant's `driftSurf`, `driftSurfY`, `carriedX`, `carriedY` and `search` to zero, then applied `routeClear` to that ant. That gives it the true entrance as its initial homing goal and keeps its ordinary movement, wall state, and later search behavior. This is a diagnostic using the true goal, not a proposed game rule.

Slots 510, 565 and 41 crossed down carrying at 564.63, 571.63 and 589.93 seconds, respectively. The other three were still on the surface with their loads at 600 seconds. In the baseline all six ended on the surface with their loads. The intervention left G1's peak at six because that peak was already reached before any recovery. Rival food stored was 2,444 versus 2,439 in the baseline. The replay establishes that a change to homing state can recover some of these existing trips without altering the rocks or entrance.

The second matched replay used only `routeClear` at 550 seconds. It preserved the ants' vector error, current search offset and obstacle state. Four of the six crossed down with food within the next 39 seconds (565 at 570.37, 510 at 574.93, 443 at 575.97, and 41 at 588.67). Slots 48 and 530 still carried on the surface at 600 seconds. Rival food stored was 2,445. The peak was again six.

| Seed 14 arm | Matched loads brought underground by 600 s | Rival food stored | Rival peak long-held loads |
|---|---:|---:|---:|
| Baseline | 0 / 6 | 2,439 | 6 |
| Clear route and correct initial home estimate | 3 / 6 | 2,444 | 6 |
| Clear route only | 4 / 6 | 2,445 | 6 |

Clearing route memory alone was enough for four of these trips. That supports testing a return to ordinary homing when retracing repeatedly fails. The intervention used trip identities and a late timestamp for diagnosis. A policy needs a local trigger and evidence from fresh nests that resetting memory does not discard routes that were helping.
