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
