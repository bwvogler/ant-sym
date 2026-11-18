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
