# Contact decisions and directed aggression

Question: when does recognising a stranger lead to an attack?

## Evidence

Bubak et al. (2016), pavement ants (*Tetramorium caespitum*), report that neuromodulation changes the decision to attack non-nestmates. Recognition and aggression are separate processes. The abstract and indexed article summary were retrieved; no quantitative calibration is taken from them (**unverified** full-text measurements).

Csata et al. (2017), *Myrmica scabrinodis* infected with *Rickia wasmannii*, report changed cuticular hydrocarbon profiles and reduced aggression towards non-nestmates and unrelated queens. This supports separating emitted identity from the receiver's response. It does not establish universal fungal pacification, immunity of peaceful ants, or our damage equation. Other fungal infections can increase aggression.

**In the game:** keep the existing sensed stranger cue and contact policy. Record an explicit attack decision for this step and layer. Only attacking ants contribute damage pressure, judged by the attacker's perceived tolerance against the target's odour band. A tolerant victim remains vulnerable to an intolerant attacker. Ignore means continuing without attacking or dropping a load. No new situation field, remote target, or policy call is needed. The damage equation and cell-scale contact radius are design abstractions.

## Implementation and acceptance

Owner approved incremental action decomposition, tests, implementation and pushing code/Beads. This is the contact milestone of ja-g7nz, following the behavior-preserving action extraction.

Use an opt-in `fight.intent` setting, default false. Off retains legacy RNG consumption and goldens. On builds reusable pressure grids per target odour band (or colony without recognition), bounded by ten bands and seven cells per attacking ant, avoiding pairwise encounters. Rock/soil and layer boundaries constrain pressure. Clear decisions each step; crossing layers invalidates old intent. Spawn resets the field. Saves retain deterministic continuation.

Assays first: retain legacy baselines, then paired seeds 1–20 for mutual attack, mutual withdrawal, ignore, unilateral tolerance, mutual tolerance and matching odours. Guards: no damage without attack; no immunity from choosing peace; carriers/reporters cannot attack; no attack across blocked cells or layers; save/reload replay. Colony throughput and survival measurements remain required before enabling by default.

## Play

Players should see tolerant hosts pass strangers without generating a fight merely by being nearby.
One-sided tolerance is risky: the other ant can still attack. Retreat preserves food but is not invulnerability.
Existing fungal perception and emission choices gain distinct consequences; no free player pacify button is added.
Cached policies still cost nothing; ignore adds one answer, not a multiplied situation space. Inspect is deferred until it has a meaningful duration and outcome.
The main risk is too little colony defense; default promotion requires paired colony-scale survival and food measurements.

## Open questions

Should attack intent persist over more than one step? Initially no. Should inspecting provide new information? Deferred. How should frightened ants recruit help? Incoming attack pressure retains the existing alarm response. Existing own-colony counts remain the defense denominator.

## Sources

- Bubak et al. 2016: https://doi.org/10.1371/journal.pone.0166417
- Csata et al. 2017: https://doi.org/10.1038/srep46323


## Implemented and measured, 2026-11-18

`fight.intent: true` enables directed combat; absent/false preserves the legacy simulation. `attackLayer` records each ant's decision and invalidates it when the ant crosses layers. The contact response now accepts `ignore`. Response brain version 13 invalidates older response caches; mode and stance wording is unchanged. No additional policy call is made per tick. Inspect remains deferred.

The 20-seed fixed-contact assay verifies mutual peace, one-sided attacks, mutual and unilateral tolerance, and familiar odours. Further tests cover held food, reports, stale/shared state, recycled slots, blocked cells, range, layers, self-exclusion, and JSON save continuation. Legacy simulation goldens remain bit-exact.

Exploratory **120-second** A9 contact assay, 200 ants per colony, local policies, seeds 1–20 (`node scripts/experiment.mjs contact --seeds 1-20 --seconds 120 --set game.fight.intent=false,true --jobs 2`). This is shorter than the standard 300-second assay. [Paired results](contact-actions-120s.csv):

| Measure | Legacy | Directed |
|---|---:|---:|
| Median food brought home, both colonies | 532.5 | 593.5 |
| Median ant losses, both colonies | 33.5 | 0 |
| Seeds meeting ≤4 losses per 100 food | 3/20 | 20/20 |
| Worst losses per 100 food | 11.37 | 0.36 |

The median paired food ratio is 1.063. Food decreased on 4/20 seeds; worst was seed 5, ratio 0.898. Losses include all causes, not only fighting. Runtime figures are not comparable because the full test suite overlapped early sweep runs. This supports continuing the experiment, **not enabling it by default**: full-duration defense, colony survival, throughput and cost guards are tracked in ja-g7nz.4.

Validation: full suite ran 1,345 tests, with four existing TODOs. Three reset-fixture/count failures caused by the added per-ant field were corrected and their tests rerun successfully. The remaining CI-reporter failure is the already-reproduced Node 24 timeout-reporting mismatch (ja-dkgo). New encounter tests, guide checks, typecheck, lint and formatting pass; lint retains existing warnings.

## Standard-duration validation, 2026-11-19

[GitHub run 44522426448](https://github.com/bwvogler/ant-sym/actions/runs/44522426448) verified all six assay/mode combinations for each of 20 paired seeds at `dc5d858f`. The A13 sealed and no-defense controls used the treatment's combat settings and elapsed duration.

| Assay | Duration | Legacy passes, seeds 1–10 / 11–20 | Directed passes, seeds 1–10 / 11–20 |
|---|---:|---:|---:|
| A9 neutral contact | 300 s | 3/10 / 5/10 | 10/10 / 10/10 |
| A13 home defense | 300 s | 3/10 / 6/10 | 2/10 / 2/10 |
| G1 full game | 600 s | 8/10 / 9/10 | 9/10 / 6/10 |

A9 median food brought home by both colonies rose from 1,706 to 1,760, and the worst losses per 100 food fell from 8.25 to 0.34. In A13, median defender losses rose from 35.5 to 144 and median food stored fell from 265 to 117. Median food relative to the sealed control fell from 0.94 to 0.39, with a minimum of 0.08. The directed no-defense control had a median of zero raiders lost, versus 40 in the legacy control, so the pass criterion's comparison against no-defense food is insufficient on its own to evaluate colony survival.

In G1, median losses for our colony fell from 74 to 1, while median food stored fell from 2,746 to 2,559. The confirmation half added failures on seeds 12, 14 and 19. Median observed G1 runtime rose from 8.82 to 9.27 ms/tick across the distributed runners. Distinct situations were measured with local policies, which does not establish live-cache coverage.

Keep `fight.intent` opt-in. The next experiment should measure, by side, which local decision kept a defender from attacking and how many raiders and defenders contributed actual damage pressure. Use seed 3 as an A13 legacy-pass/directed-fail contrast and seed 1 as a shared-pass control. Preserve A9 peaceful contact and treat absolute defender survival and food as guards alongside the A13 pass mark.

A 90-second local diagnostic pilot sampled eligible attack markers once per second near the home hole. In directed mode, seed 1 averaged 0.23 defenders and 0.42 raiders with a current-layer attack marker. Seed 3 averaged 0.15 and 0.31. The corresponding defender counts in fight mode were 1.24 and 0.73. These samples show that fight mode is a poor proxy for directed attack intent. They do not measure delivered pressure or identify why a defender chose another action.

A separate local 300-second reproduction confirmed that seed 1 passes in both modes and seed 3 passes only in legacy mode. Seed 1 defender losses rose from 45 to 147, even though the score still passed, and food stored fell from 791 to 319. Seed 3 losses rose from 24 to 106 and food stored fell from 807 to 336. Beads follow-up `ja-g7nz.4.2` tracks tracing eligibility and incoming pressure before considering a policy change.
