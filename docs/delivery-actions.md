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
