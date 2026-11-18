# Refusing food and departing are separate choices

2026-11-18. Research and proposed design, not built. Beads `ja-ygs9`, PRD §85.

## Measured problem

The opt-in pickup experiment connects the existing `get` response without changing movement. Across 20 paired 120-second worlds, cached refusal produced 6,299 food-offer episodes; 96.6% crossed multiple hexes. The longest lasted 57.467 s while moving within 6.71 world units of its start. This is prolonged local movement, not a frozen ant. See [the observer report](../experiments/pickup-policy/DWELL.md) for censoring, depletion and sampling limitations.

`arrive.ts` skips pickup when `get` declines. `sense.ts` still detects reachable food. Neither means the ant chose to leave. Adding a turn inside `get=false` would change that existing action's meaning.

## Biology and limits

**Acceptance is not departure.** Wendt et al. (2019), *Lasius niger*, found acceptance depended on previously experienced food quality and social information. Their methods distinguish uninterrupted feeding, interrupted feeding followed by filling the crop, and rejection. Rejection includes immediate return or failing to fill within ten minutes. The three-second scoring boundary is an observation criterion, not a measured motor-action duration. These experiments do not justify a fixed departure timer.

**Passing food is possible, with context.** Wendt & Czaczkes (2017), *L. niger*, report that 69% bypassed a nearer poorer reward for a known better reward, while 83% chose the nearer feeder when quality matched. Those percentages come from the primary abstract and are **unverified** against full methods/results here; detailed methods were not retrieved in this pass. They are not calibration targets for ants lacking a learned alternative. The discussion also reports failure to reject slightly poorer food in some conditions.

**Trail attraction need not set acceptance.** Oberhauser, Wendt & Czaczkes (2020), *L. niger*, found no food-acceptance difference in their sucrose-quinine comparison after a pheromone-treated versus control runway. Several other reward measures also showed no effect; one high-concentration treatment increased drinking interruptions. This is evidence against equating trail strength with food value, not proof that pheromones never affect foraging decisions.

All three studies concern liquid feeding in one species. Carrying discrete food units, a bounded pass-by action, and application to other game species are model abstractions. No measured duration, rejection-memory lifetime or departure angle is claimed.

**In the game:** keep `get` as accept/refuse, and investigate a separate choice after a refusal. Preserve sensory readings and fungal gains. Defer expected-quality memory and learned alternative destinations: the current Touch does not supply those experiences.

## Proposed smallest mechanic

This is a reviewable proposal, not an implemented extension of §84.

| Part | Proposed contract |
|---|---|
| Trigger | Empty jaws, food actually offered, existing `get` returns false; outside active combat. |
| Information | Existing materialized Touch only. The response's event implies refusal; no world-wide food inventory, destination or fungus objective. |
| Choice | A distinct response, provisionally `depart`: `continue` or `pass-by`. Do not reuse `leave`, which already controls nest departure. |
| Local fallback | `continue`, preserving current movement. Disabled feature never asks the new question. |
| Action | `pass-by` briefly favors the ant's heading at action entry over attraction back toward food. Collision avoidance and combat retain priority. It neither picks up food nor chooses a remote target. |
| Bound | Stop at loss of contact, timeout, pickup, combat, layer change or death. Ask at most once per continuous food-contact episode; timeout alone does not rearm it. |
| State | Per-ant action heading, remaining duration and episode latch. Reset on slot reuse; specify save/reload and feature-toggle behavior before implementation. These are execution state, not remembered food quality. |
| Isolation | A separate opt-in and cache context/version. No changes to `get` keys, other response hooks, sensory gains, or §82 steering option. |

No new sensory channel or global scripted read is proposed, so no vision sense/gap row is added. The actuator consumes an action choice after sensing; it must not overwrite food readings or fungus gain values. Whether heading persistence alone meaningfully reduces long revisits remains an experimental question. It must not claim guaranteed escape from an obstructed patch.

## Assays before behavior

`ja-ygs9.1` adds departure assays without changing production behavior. Measure geometric exit from a fixed, non-depleting patch separately from disappearance of food, death and observation-end censoring. Include an open patch, a narrow corridor, a broad patch and a blocked exit. Record path length, radius, completed and censored dwell, revisit count, accepted offers and food home.

Then `ja-ygs9.2` compares default/off, refusal plus continue, and refusal plus pass-by. Use development seeds 1–10 and untouched validation seeds 11–20, report every seed and worst seed. Sweep 0.5, 1 and 2 simulated seconds as **engineering candidates**, not biological values; choose on development seeds only. Do not use the paper's acceptance percentages as a departure target.

Proposed engineering gates:

- Off and cached continue preserve complete saved state and RNG progression against the pickup-only implementation on all seeds. Existing goldens remain unchanged.
- In open geometry, each validation seed's completed-episode p95 is no worse than continue and the worst-seed p95 is lower; censored fraction must not rise. Report failed candidates, including broad/blocked geometry, without retuning on validation seeds.
- No wall penetration, teleportation, forced pickup, suppressed combat or fungal-gain mutation. Timeout cannot create an unbounded repeated-action loop.
- Regress cache miss/invalid answer/changed doctrine, shared Touch, duplicate attachment, weighted decisions, save/reload, feature toggling and slot reuse. Cache hits draw consistently; disabled/continue paths consume no extra random numbers.
- Measure tick time on matched worlds: proposed p95 overhead budget 5%, using repeated samples and reporting noise. Verify one queued question per new context/key, zero paid calls in fixture assays, and zero warm-cache requests.

## Cost

The proposal adds zero Touch dimensions and one response family. Disabled: zero extra requests. Enabled: at most one new question per distinct eligible unanswered Touch/context, absent retries, shared across ants/colonies using that context. The execution latch is not a cache-key dimension. Cache invalidation or failed-request retries can increase requests; retain the existing scheduler/budget.

No new request packer exists yet, so its token count is **unmeasured**. The pickup experiment observed 4–6 distinct keys under blanket refusal, but this is only a baseline: changed movement can change key coverage. For the new lane, measure `estimateTokens(pack(...))` at 1/10/100 questions and report `input tokens × repository input rate / 1,000,000`, plus observed batch/retry counts. Do not extrapolate the pickup estimate to an hourly bill. Current work used zero live Jev requests.

## Play

The player can distinguish “leave food untouched while exploring nearby” from “move on after refusing it.” A fungus can still distort the existing senses; the proposed response does not grant it an omniscient food map or a direct pickup bypass.

The cost of passing by is a missed local resource and travel time. Blanket refusal remains capable of starving a colony. A favorable result means the action executes coherently, not that refusal improves colony fitness.

Keep this experimental and off by default. No new progression, unlock or UI panel is proposed for the first assay.

## Open questions

- Owner approved continuing this plan on 2026-11-18: test bounded heading-preserving `pass-by` separately; defer learned food-quality expectations. Assays precede behavior.
- Exact integration point, persistent-state schema and priority relative to existing mode/steering hooks need code review before implementation.
- The papers do not supply the actuator duration or establish benefit across game species. A null/failed assay is a valid reason not to ship this action.
- Owner authorized pushing the reviewed changes and continuing the plan on 2026-11-18. Commit the documentation before departure assays, then run the plan check.

## Sources

1. Wendt S, Strunk KS, Heinze J, Roider A, Czaczkes TJ (2019). *Positive and negative incentive contrasts lead to relative value perception in ants*. eLife 8:e45450. [Full text and methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC6606023/), [DOI](https://doi.org/10.7554/eLife.45450). Abstract and acceptance-scoring methods verified.
2. Wendt S, Czaczkes TJ (2017). *Individual ant workers show self-control*. Biology Letters 13:20170450. [Primary abstract](https://pubmed.ncbi.nlm.nih.gov/29021315/), [DOI](https://doi.org/10.1098/rsbl.2017.0450). Abstract and discussion retrieved; method details unverified in this pass.
3. Oberhauser FB, Wendt S, Czaczkes TJ (2020). *Trail Pheromone Does Not Modulate Subjective Reward Evaluation in Lasius niger Ants*. Frontiers in Psychology 11:555576. [Full text](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.555576/full), [DOI](https://doi.org/10.3389/fpsyg.2020.555576). Results sections inspected, including contrary interruption result.
