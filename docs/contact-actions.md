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

### Where the defense imbalance comes from

The 300-second A13 trace counts contact decisions before movement and measures incoming pressure where the damage hazard is computed. The four runs reproduced the previous pass, stored-food, and casualty counts exactly. Counts below are per ant-step, so the same ant can appear repeatedly. The hazard input is the sum of incoming pressure divided by nearby allies before multiplying by the common fight rate and time step.

| Seed | Combat | Defender attacks / contacts | Raider attacks / contacts | Hazard input on defenders / raiders | Defender / raider combat deaths |
|---:|---|---:|---:|---:|---:|
| 1 | Legacy | 1.7% (76 / 4,568) | 100% (4,342 / 4,342) | 815 / 855 | 45 / 47 |
| 1 | Directed | 15.5% (1,355 / 8,730) | 100% (7,834 / 7,834) | 2,988 / 865 | 147 / 43 |
| 3 | Legacy | 1.2% (37 / 3,001) | 100% (2,859 / 2,859) | 536 / 570 | 24 / 43 |
| 3 | Directed | 14.8% (1,035 / 7,016) | 100% (6,055 / 6,055) | 2,239 / 631 | 106 / 35 |

All other defender contact outcomes were withdrawals. No requested attack was overridden by load protection or reporting in these runs. In legacy mode a nearby enemy can cause damage even while withdrawing. In directed mode the scripted raiders attacked at every contact, so defenders received about 3.5 times the raiders' cumulative hazard input on both seeds. The data establish an action asymmetry and its realized pressure. They do not explain every withdrawal or isolate eligibility, reach, and subsequent movement as independent causes.

A controlled follow-up should change only the defender's contact answer at a locally recognized nest entrance, hold the raider doctrine fixed, and compare survival and food with both existing modes. Include an untreated neutral-contact control and keep distant foragers on the existing policy.

### Entrance-only defense pilot

The `defendEntrance` and `contactEntrance` assays change only the player's contact response. An empty-jawed ant that senses an enemy and recognizes its current location as its own hole asks to fight. Other contacts use the existing policy. The raider doctrine, contact action eligibility rules, and existing A13 controls are retained. These are assay policies and require no new sensed field.

| A13 seed | Legacy food / defenders lost / raiders lost | Directed | Directed + entrance |
|---:|---:|---:|---:|
| 1 | 791 / 45 / 47 | 319 / 147 / 43 | 440 / 134 / 51 |
| 3 | 807 / 24 / 43 | 336 / 106 / 35 | 550 / 105 / 41 |

Entrance defense passed A13 on both seeds, including seed 3, which previously failed under directed combat. It increased food stored relative to untreated directed combat by 121 and 214, respectively. Defender losses stayed well above legacy. Cumulative defender hazard fell from 2,988 to 2,809 on seed 1 and from 2,239 to 1,968 on seed 3.

In paired neutral A9 runs, seed 1 was unchanged on food and loss (2,355 stored and zero losses). Seed 3 still passed A9, but food fell from 2,182 to 2,134 and combined losses rose from zero to six. The rule is worth testing across more seeds, with absolute defender losses and neutral food and losses as separate guards. Directed combat stays opt-in.

Run the 300-second pilot with `node scripts/experiment.mjs defendEntrance contactEntrance contact --seeds 1,3 --set game.fight.intent=true --jobs 3`. The existing A13 controls are reproduced with `node scripts/experiment.mjs defendHome --seeds 1,3 --set game.fight.intent=false,true --jobs 2`.

### Entrance-only defense confirmation

Directed damage is the design baseline. This comparison tests whether entrance defense should become the default contact response under that damage model.

| Seed | A13 food, directed → entrance | A13 defender losses | A13 raider losses | A9 food, both colonies | A9 losses, both colonies |
|---:|---:|---:|---:|---:|---:|
| 2 | 315 → 373 | 124 → 114 | 42 → 44 | 1,559 → 1,559 | 0 → 0 |
| 4 | 106 → 118 | 127 → 93 | 29 → 27 | 2,070 → 2,086 | 0 → 1 |
| 5 | 77 → 118 | 158 → 166 | 36 → 31 | 2,061 → 1,622 | 3 → 0 |
| 6 | 78 → 103 | 147 → 138 | 39 → 43 | 1,557 → 1,455 | 0 → 0 |

Across the two pilot seeds and four confirmation seeds, entrance defense increased A13 food in all six and improved the A13 pass count from 2/6 to 4/6. Seed 5 still cost eight additional defenders. Every neutral A9 run passed, but seed 5 lost 21% of its food throughput even as casualties fell. The entrance cue alone is insufficient for default adoption. A follow-up should test whether an existing locally sensed threat cue can distinguish a raid from a neutral encounter near the hole.

Reproduce the confirmation with `node scripts/experiment.mjs defendHome defendEntrance contact contactEntrance --seeds 2,4-6 --set game.fight.intent=true --jobs 4`.

### Alarm-gated entrance defense

The alarm-gated assays add one condition to entrance defense: the ant must sense faint or strong alarm. Otherwise it delegates to the existing contact policy. Both variants use the same directed damage model.

| Seed | A13 food, directed / entrance / alarm-gated | A13 defender losses | A13 raider losses | A9 food, directed / entrance / alarm-gated |
|---:|---:|---:|---:|---:|
| 3 | 336 / 550 / 373 | 106 / 105 / 126 | 35 / 41 / 37 | 2,182 / 2,134 / 2,182 |
| 5 | 77 / 118 / 99 | 158 / 166 / 156 | 36 / 31 / 34 | 2,061 / 1,622 / 2,061 |
| 6 | 78 / 103 / 199 | 147 / 138 / 124 | 39 / 43 / 45 | 1,557 / 1,455 / 1,557 |

Alarm gating restored neutral food and casualties to the untreated directed results on all three seeds. Under raid pressure it increased food on all three and passed on seed 6 (untreated directed passed none). Seed 3 lost 20 additional defenders and reverted from a pass with entrance-only defense to a fail with alarm gating, so the policy stays experimental. Compare attack and alarm timing on seeds 3 and 6 to check whether the cue arrives after defenders already start withdrawing.

Reproduce with `node scripts/experiment.mjs defendAlarmEntrance contactAlarmEntrance --seeds 3,5,6 --set game.fight.intent=true --jobs 4`.

### When the entrance cue becomes available

The timing probes reproduced the earlier food, losses and pass marks on seeds 3 and 6. They count empty-jawed encounters at the ant's own entrance and record the first such encounter with and without a sensed alarm. First defender combat death is measured anywhere on the map.

| Alarm-gated A13 seed | First defender combat death | First eligible entrance encounter | First eligible entrance encounter with alarm | Entrance encounters with alarm |
|---:|---:|---:|---:|---:|
| 3 | 17.50 s | 37.40 s | 40.10 s | 265 / 579 |
| 6 | 11.20 s | 19.73 s | 22.40 s | 323 / 764 |

Both seeds had lost defenders before the first eligible contact at the entrance. Alarm became available for an eligible encounter about 2.7 seconds after the first eligible contact on both seeds. That initial delay alone does not explain why seed 3 failed and seed 6 passed. The alarm-gated condition was present on fewer than half of eligible contacts across both runs.

### Alarm or locally outnumbered

A second policy also authorized entrance defense if the ant sensed it was outnumbered. This checks whether a local cue can cover the gap before alarm becomes available. The policy remains confined to empty-jawed ants that sense an enemy at their own entrance.

| A13 seed | Food, alarm / alarm or outnumbered | Defender losses | Raider losses | Pass, both arms |
|---:|---:|---:|---:|---:|
| 3 | 373 / 365 | 126 / 153 | 37 / 33 | fail |
| 5 | 99 / 99 | 156 / 159 | 34 / 33 | fail |
| 6 | 199 / 116 | 124 / 134 | 45 / 45 | pass |

Neutral A9 food and combined losses again matched untreated directed combat on all three seeds. Under raids the extra trigger cost more defenders on every seed and improved neither food nor passes. Retain alarm-only as the better entrance experiment and leave both policies experimental. Future comparisons should measure the defense decisions available along the approach to the nest, since the first deaths in both traced runs preceded any eligible entrance encounter.

Reproduce the timing with `node scripts/experiment.mjs defendEntrance defendAlarmEntrance --seeds 3,6 --set game.fight.intent=true --jobs 4`. Reproduce the follow-up with `node scripts/experiment.mjs defendThreatEntrance contactThreatEntrance --seeds 3,5,6 --set game.fight.intent=true --jobs 4`.

### Alarm at the nest approach

The approach assay allows alarm-gated defense outside the hole when one of the current ant's existing home sensors reads `SEEN`. Ordinary contact policy inputs stay as before. This experiment confers neither a broader detection radius nor access to a raider's intent.

| A13 seed | First defender combat death | First qualifying approach contact | Food, entrance / approach | Defender losses | Raider losses | Pass, entrance / approach |
|---:|---:|---:|---:|---:|---:|---|
| 3 | 17.50 s | 40.83 s | 373 / 450 | 126 / 110 | 37 / 35 | fail / fail |
| 5 | 19.70 s | 42.67 s | 99 / 111 | 156 / 147 | 34 / 45 | fail / pass |
| 6 | 11.20 s | 20.70 s | 199 / 95 | 124 / 134 | 45 / 35 | pass / fail |

The approach rule qualified on 57, 59 and 81 contact decisions in A13. None occurred before the first defender death. It traded a pass on seed 6 for a pass on seed 5. No approach contact qualified in the three neutral A9 runs, whose food and losses reproduced untreated directed combat exactly. Keep the approach rule experimental. To target early losses, first identify where the early casualties occur and what the ants there actually sense.

Reproduce with `node scripts/experiment.mjs defendAlarmApproach contactAlarmApproach --seeds 3,5,6 --set game.fight.intent=true --jobs 4`.

### Where early casualties occur

The first defender death was on the surface and occurred at the same time and position with or without approach defense on each seed. Each first casualty had chosen to withdraw earlier that tick.

| A13 seed | First death | Distance from own nest center | Defender deaths in first 30 s, directed / approach | Deaths outside nest radius, directed / approach |
|---:|---:|---:|---:|---:|
| 3 | 17.50 s | 25.78 world units | 5 / 5 | 5 / 5 |
| 5 | 19.70 s | 69.71 world units | 8 / 8 | 8 / 8 |
| 6 | 11.20 s | 48.73 world units | 19 / 25 | 13 / 19 |

In untreated directed combat, only 7 of the 32 early casualties had sensed alarm at contact that tick, and only 3 saw home in the home sensors. Three died without a same-tick contact decision. The equivalent counts with approach defense were 8, 4 and 1 of 38. Contact observations are recorded before movement and joined to damage by colony, ant slot and tick. An absent contact record means the policy received no contact question for that ant that tick.

Early losses are already occurring in the field when these policies are waiting for a close-to-home cue. The next comparison should trace withdrawal and repeated exposure there, including the pressure that reaches ants without a contact decision, before broadening automatic fighting. Food, total losses and pass scores reproduced the existing arms exactly.

Reproduce with `node scripts/experiment.mjs defendHome defendAlarmApproach --seeds 3,5,6 --set game.fight.intent=true --jobs 4`.

### Withdrawal under sustained pressure

In the first 30 seconds across three directed A13 seeds, 308 of 538 positive-pressure defender ticks followed another positive-pressure tick for the same ant. Of 460 exposed ticks with a same-layer withdrawal decision, the ant stepped away from its initially sensed enemy heading on 388 and stayed stationary on only four. This projection measures the defender's movement relative to the sensed bearing. It does not measure separation from a moving attacker. Seed 6 also had 39 positive-pressure ticks without a same-tick contact decision.

That made retreat speed a useful intervention to test. The opt-in `colony.withdrawalSpeed=1.25` changes only movement on the surface for ants without food or soil that are already stepping away under an explicit flee heading. It uses the existing collision handling and leaves the decision and damage rules in place.

| Pilot seed | A13 early exposure ticks, base / faster | Early defender deaths | Total defender losses | A13 food | A9 food |
|---:|---:|---:|---:|---:|---:|
| 3 | 151 / 35 | 5 / 2 | 106 / 110 | 336 / 154 | 2,182 / 2,232 |
| 5 | 101 / 27 | 8 / 2 | 158 / 110 | 77 / 150 | 2,061 / 1,954 |
| 6 | 286 / 179 | 19 / 7 | 147 / 74 | 78 / 480 | 1,557 / 1,621 |

Faster retreat reduced early deaths in each pilot seed and changed seed 5 from an A13 fail to a pass. Seed 3 still failed and brought home less than half as much food, while seed 6 still fell short of the raider-loss threshold despite better survival and storage. Every A9 run still passed.

| Holdout seed | A13 total defender losses, base / faster | A13 food | A13 raider losses | A9 food |
|---:|---:|---:|---:|---:|
| 2 | 124 / 89 | 315 / 529 | 42 / 38 | 1,559 / 1,398 |
| 4 | 127 / 81 | 106 / 116 | 29 / 26 | 2,070 / 1,974 |

The holdout reduced total defender losses and increased raid food on both seeds, but seed 2 went from a pass to a fail and both neutral runs lost food. Across all five seeds, A13 passes stayed at 1/5. A speed boost helps ants survive exposure, but this version shifts how effectively they repel raids and forage. Keep it as an experiment. The next comparison should match incoming pressure to the ant's contact perception and measure an entire withdrawal through separation, renewed contact or death, including the ticks after an enemy falls out of sense range.

Reproduce the trace with `node scripts/experiment.mjs defendHome --seeds 3,5,6 --seconds 30 --set game.fight.intent=true --jobs 3`. Reproduce the speed experiment with `node scripts/experiment.mjs defendHome contact --seeds 2-6 --set game.fight.intent=true --set colony.withdrawalSpeed=1.25 --jobs 4`.

### Withdrawal episodes and gaps in perception

An episode starts at an explicit withdrawal. It clears after three consecutive ticks with neither contact nor incoming pressure, and ends earlier if the ant dies. Renewed contact counts each return after a gap during the same episode. Episodes still open at the 30-second cutoff are counted separately. Pressure is measured at combat resolution, after movement. Contact uses the colony's earlier recognition snapshot and its own tolerance, so these measurements can disagree.

| First 30 seconds, A13 seeds 2–6 | Directed baseline | 1.25× withdrawal speed |
|---|---:|---:|
| Episodes started | 271 | 467 |
| Cleared | 208 | 432 |
| Combat deaths within episodes | 44 | 25 |
| Open at cutoff | 11 | 10 |
| Renewed-contact events | 160 | 359 |
| Pressure ticks without contact, anywhere | 47 | 10 |
| Of those, inside an active withdrawal episode | 0 | 0 |

The speed increase improved clearance per episode from 77% to 93%, while repeated contact within episodes rose from 0.59 to 0.77 events per start. Episode counts are not counts of unique ants. The pressure-only ticks did not occur inside recently active withdrawals under this three-tick definition, so these runs do not support blaming continued pressure after contact drops out for the repeated withdrawal problem. The separate perception gap remains real. No-contact deaths fell from three to one.

Reproduce with `node scripts/experiment.mjs defendHome --seeds 2-6 --seconds 30 --set game.fight.intent=true --set colony.withdrawalSpeed=1,1.25 --jobs 5`.

### Movement timing and withdrawal commitment

The A13 observer re-read the defender's existing recognition after movement and occupancy refresh on each pressure tick without an earlier contact decision. The ant could detect a stranger after movement on all 47 baseline cases and all 10 faster-withdrawal cases, including all four deaths. This puts the observed gap between the decision and damage snapshots. The check does not attribute the damage to the particular stranger the victim detects.

A separate trial let empty-jawed surface ants continue withdrawal for 0.15 seconds after contact dropped out, using the previous movement heading and the existing turning rule at ordinary speed. Fresh contact still chose the action. The trial used 300-second A13 and A9 runs on seeds 2–6.

| Seed | Raid food, base / commitment | Defender losses | Raider losses | Neutral food, base / commitment |
|---:|---:|---:|---:|---:|
| 2 | 315 / 398 | 124 / 124 | 42 / 43 | 1,559 / 1,448 |
| 3 | 336 / 475 | 106 / 106 | 35 / 35 | 2,182 / 1,824 |
| 4 | 106 / 132 | 127 / 93 | 29 / 25 | 2,070 / 2,041 |
| 5 | 77 / 48 | 158 / 160 | 36 / 25 | 2,061 / 1,783 |
| 6 | 78 / 95 | 147 / 153 | 39 / 29 | 1,557 / 1,509 |

Raid pass count stayed at 1/5. Neutral food fell on every seed, with a 16% loss on seed 3. The brief heading commitment was rejected and removed. That distinguishes faster separation from making the same withdrawal last longer.

Reproduce the visibility trace with the withdrawal-episode command above. It adds the number of pressure ticks and deaths that became detectable after movement.

### First-visible-tick reaction window

A 300-second trial let a defender survive its first damage tick when the pre-movement contact decision was absent and ordinary post-movement sensing could now detect a stranger. The trial still laid alarm and drew the normal combat random roll. Already detected threats and pressure from threats that were still undetectable followed the ordinary damage rule. Unit checks verified that the first visible tick consumed its roll and that a defender that had already seen the threat still took damage.

| A13 seed | Directed food / defender losses / raiders lost | With reaction window | Pass, directed / window |
|---:|---:|---:|---|
| 2 | 315 / 124 / 42 | 289 / 127 / 37 | pass / fail |
| 3 | 336 / 106 / 35 | 478 / 111 / 35 | fail / fail |
| 4 | 106 / 127 / 29 | 106 / 127 / 29 | fail / fail |
| 5 | 77 / 158 / 36 | 115 / 144 / 40 | fail / pass |
| 6 | 78 / 147 / 39 | 99 / 159 / 37 | fail / fail |
| 7 | 119 / 121 / 29 | 119 / 121 / 29 | fail / fail |
| 8 | 103 / 132 / 36 | 103 / 132 / 36 | fail / fail |

Neutral A9 food and casualties matched exactly on all seven seeds. The two holdout raids generated 21 and 25 reaction windows, respectively. None of their rolls would have killed the defender, and both runs matched their controls. Raid passes stayed at 1/7 overall, and the trial was removed. The movement-phase gap is real, but it did not account for the sustained raid losses in these runs. The stronger remaining lead is the raiders' ability to keep applying directed pressure over multiple decisions.

### Sustained attack choices

In the first 30 seconds on seeds 2–8, raiders chose attack 4,978 times. Of those choices, 4,398 (88%) immediately followed another attack choice by the same ant. Defenders chose attack 304 times. The longest uninterrupted attack-choice series per seed ran 1.5–6.5 seconds for raiders and at most 1.13 seconds for defenders. This follows an ant's decisions; the target can change between choices.

The assay can reproduce these counts with `node scripts/experiment.mjs defendHome --seeds 2-8 --seconds 30 --set game.fight.intent=true --jobs 5`.

### Directed attack reach

The next trial limits pressure to the attacker's cell, compared with the standard cell plus its first ring. Detection and contact decisions use the same rules as before. The A13 comparison controls inherit the same combat settings as their treatment.

| Seed | Raid food, standard / same cell | Defender losses | Raider losses | Neutral food |
|---:|---:|---:|---:|---:|
| 2 | 315 / 678 | 124 / 66 | 42 / 35 | 1,559 / 1,537 |
| 3 | 336 / 563 | 106 / 72 | 35 / 38 | 2,182 / 2,102 |
| 4 | 106 / 205 | 127 / 73 | 29 / 24 | 2,070 / 2,066 |
| 5 | 77 / 231 | 158 / 84 | 36 / 43 | 2,061 / 1,653 |
| 6 | 78 / 316 | 147 / 88 | 39 / 37 | 1,557 / 1,557 |
| 7 | 119 / 141 | 121 / 88 | 29 / 37 | 1,168 / 1,160 |
| 8 | 103 / 165 | 132 / 86 | 36 / 32 | 1,521 / 1,517 |

All seven raids ended with fewer defender losses and more food (total losses 915 → 557). Raid passes still shifted from seed 2 to seed 5 because most runs miss the raider-loss threshold. Neutral A9 passed on all seeds, but seed 5 lost nearly 20% of food throughput. Collision range substantially changes sustained pressure. The next comparison should measure actual attacker–target distance, since a cell-only rule depends on cell boundaries.

Reproduce with `node scripts/experiment.mjs defendHome contact --seeds 2-8 --set game.fight.intent=true --set game.fight.attackReach=0 --jobs 5`.

### Continuous attack reach

The distance comparison searches nearby attacker cells, then checks actual center-to-center distance and the sampled line between the two ants. It preserves layer separation, directed intent, and the attacker's odour tolerance. The test covers both directions of the boundary artifact: close ants in different cells can fight, and distant ants in the same cell cannot.

| Pilot seed | A13 food, standard / 0.65 / 0.85 | Defender losses | Raider losses | A9 food |
|---:|---:|---:|---:|---:|
| 3 | 336 / 370 / 194 | 106 / 64 / 99 | 35 / 31 / 36 | 2,182 / 2,035 / 2,016 |
| 5 | 77 / 189 / 196 | 158 / 98 / 119 | 36 / 36 / 44 | 2,061 / 2,051 / 1,979 |
| 6 | 78 / 457 / 207 | 147 / 82 / 119 | 39 / 44 / 46 | 1,557 / 1,557 / 1,557 |

The 0.85 radius passed two pilot raids versus one for 0.65, but the shorter radius yielded more raid food overall, lower defender losses and less neutral food loss. We carried 0.65 into the four-seed holdout based on those outcomes. Neither pilot radius caused neutral casualties.

| Holdout seed | A13 food, standard / 0.65 | Defender losses | Raider losses | A9 food |
|---:|---:|---:|---:|---:|
| 2 | 315 / 625 | 124 / 60 | 42 / 44 | 1,559 / 1,731 |
| 4 | 106 / 280 | 127 / 45 | 29 / 22 | 2,070 / 2,037 |
| 7 | 119 / 150 | 121 / 85 | 29 / 33 | 1,168 / 1,160 |
| 8 | 103 / 151 | 132 / 94 | 36 / 41 | 1,521 / 1,517 |

The 0.65 radius improved survival and food on all seven raid seeds and raised passes from 1/7 to 3/7. Across those seeds defender losses fell from 915 to 528. Neutral contact passed on all seven, with zero casualties and a worst food loss of 6.7% (seed 3). This radius is the stronger candidate to take into the existing full-width A9/A13/G1 sweep. Unlike the grid approximation, the distance path visits nearby attacker–victim pairs, so that sweep should also compare tick cost under large clashes.

Reproduce with `node scripts/experiment.mjs defendHome contact --seeds 3,5,6 --set game.fight.intent=true --set game.fight.attackDistance=0.65,0.85 --jobs 6`; holdout `--seeds 2,4,7,8 --set game.fight.attackDistance=0.65` with the same assays and directed intent.

A paired 600-second G1 run on prior failure seed 12 reproduced every gameplay metric at both reaches, including 2,423/2,768 food, zero losses and a maximum of three long-held loads. The latter remains above the pass threshold of two. Observed runtime was 8.86 versus 8.69 ms/tick for the standard and distance paths, respectively, with two workers sharing the machine. This zero-casualty seed does not establish cost under sustained fighting. The remaining G1 failure on this seed belongs to carrying and delivery, even when combat reach changes.

Reproduce with `node scripts/experiment.mjs game1 --seeds 12 --set game.fight.intent=true --set game.fight.attackDistance=0,0.65 --jobs 2`.

### Fresh 300-second reach holdout

We paired the standard directed reach with the 0.65 continuous radius on seeds 11, 14, 17 and 20. These seeds were outside the earlier radius selection set. Both arms used directed intent.

| Seed | A13 defender food, standard / 0.65 | Defender losses | Raider losses | A9 combined food | A9 combined losses |
|---:|---:|---:|---:|---:|---:|
| 11 | 123 / 147 | 160 / 93 | 39 / 43 | 2,045 / 2,152 | 7 / 1 |
| 14 | 78 / 177 | 142 / 86 | 41 / 31 | 2,737 / 2,737 | 0 / 0 |
| 17 | 59 / 144 | 167 / 111 | 22 / 38 | 1,672 / 1,678 | 1 / 0 |
| 20 | 85 / 458 | 164 / 89 | 36 / 39 | 2,066 / 2,214 | 0 / 0 |

Defender losses fell from 633 to 379, and food improved on all four raids. A13 still passed once in each arm. The standard reach passed seed 14, and the short reach passed seed 11. The short reach's other three seeds killed 31–39 raiders against the required 40. All eight neutral runs passed. Observed A13 tick time was 1.57–1.72 ms for standard reach and 1.62–2.05 ms for short reach with six shared workers. The parallel run is suitable for detecting a large slowdown, but does not isolate reach overhead from different ant populations and raid outcomes.

Reproduce with `node scripts/experiment.mjs defendHome contact --seeds 11,14,17,20 --set game.fight.intent=true --set game.fight.attackDistance=0,0.65 --jobs 6`.

On the same four seeds, we also ran legacy combat and combined the 0.65 radius with alarm-gated entrance defense. Each arm used its own matched A13 controls.

| Seed | A13 defender food, legacy / short / short + alarm | Defender losses | Raider losses | A9 combined food | A9 combined losses |
|---:|---:|---:|---:|---:|---:|
| 11 | 202 / 147 / 148 | 51 / 93 / 107 | 48 / 43 / 47 | 1,702 / 2,152 / 2,152 | 57 / 1 / 1 |
| 14 | 198 / 177 / 207 | 31 / 86 / 93 | 38 / 31 / 37 | 2,443 / 2,737 / 2,737 | 31 / 0 / 0 |
| 17 | 194 / 144 / 172 | 34 / 111 / 87 | 38 / 38 / 36 | 1,545 / 1,678 / 1,678 | 63 / 0 / 0 |
| 20 | 780 / 458 / 513 | 40 / 89 / 54 | 48 / 39 / 42 | 2,326 / 2,214 / 2,214 | 61 / 0 / 0 |

Adding the alarm gate to the short reach raised defender food on all four seeds and produced two A13 passes (11 and 20), matching the legacy pass count. Defender losses rose on seeds 11 and 14, fell on 17 and 20, and exceeded legacy on all four. The combined rule reproduced short reach's neutral results seed for seed. The guard count alone would miss the remaining survival regression: the combined condition lost 341 defenders against legacy's 156. Retain the short reach as a candidate, with the alarm-gated policy useful as a comparison arm.

Reproduce the additional arms with `node scripts/experiment.mjs defendHome contact --seeds 11,14,17,20 --set game.fight.intent=false --jobs 4` and `node scripts/experiment.mjs defendAlarmEntrance contactAlarmEntrance --seeds 11,14,17,20 --set game.fight.intent=true --set game.fight.attackDistance=0.65 --jobs 4`.

### Counterattack at favorable local odds

The A13 raid and A9 neutral guards use directed reach 0.65 and the contextual unloading candidate. An empty-jawed worker that perceives it outnumbers strangers can choose to counterattack. The variants differ in the cue required.

| Guard | Seed | Directed baseline food / losses | Outnumbering alone | Outnumbering with alarm |
| --- | ---: | ---: | ---: | ---: |
| A13 defending colony | 11 | 147 / 93 | 188 / 43 | 145 / 96 |
| A13 defending colony | 17 | 144 / 111 | 197 / 38 | 160 / 88 |
| A9 both colonies | 11 | 2152 / 1 | 622 / 210 | 2152 / 1 |
| A9 both colonies | 17 | 1678 / 0 | 294 / 209 | 1678 / 0 |

Outnumbering alone passed both raid guards and failed both neutral guards. The alarm requirement preserved neutral outcomes and left raid passes at one of two. A third arm uses a previous-tick snapshot of a rival declaring attack within one world unit on the same layer. The prototype checks distance and layer and has no line-of-sight test.

Reproduce with `node scripts/drop-refusal-recovery.mjs --guard defendHome 11 0.65 counterattack`. Other variants are `alarm-counterattack` and `attack-counterattack`. Use the `contact` guard for neutral encounters.

| Raid seed | Directed food / losses | Nearby attack cue food / losses | Raiders killed with cue |
| --- | ---: | ---: | ---: |
| 11 | 147 / 93 | 174 / 60 | 44 |
| 14 | 177 / 86 | 221 / 59 | 32 |
| 17 | 144 / 111 | 271 / 82 | 39 |
| 20 | 458 / 89 | 482 / 70 | 36 |

The attack cue improved defender food and survival on all four maps against the earlier matched directed baseline. Losses fell from 379 to 271. All four neutral runs reproduced the directed baseline, including losses and food. Raid passes remained one of four, compared with two of four under existing combat, which lost 156 defenders. The cue is an assay-only result. A gameplay implementation needs an observable signal, with occlusion and timing checks, and further raid validation.

### Wall-aware cue at even odds

The wall-aware guard follows the nearby hostile-attack prototype and samples both endpoints and three intermediate points for solid terrain. It preserves the simulation's shared cell coordinates. The cue still uses previous-tick attack markers, and the wall check samples a short segment. These are assay rules.

| Guard | Seed | Wall-aware, outnumbering | Wall-aware, outnumbering or even |
| --- | ---: | ---: | ---: |
| Raid, defender food / losses / raiders killed | 11 | 174 / 60 / 44 | 161 / 36 / 40 |
| Raid, defender food / losses / raiders killed | 17 | 271 / 82 / 39 | 253 / 48 / 45 |
| Neutral, combined food / losses | 11 | 2152 / 1 | 1859 / 0 |
| Neutral, combined food / losses | 17 | 1678 / 0 | 1678 / 0 |

The wall-aware outnumbering rule reproduced the earlier nearby-attack results on both seeds. Allowing even odds passed both raids, compared with one for the outnumbering rule. It reduced defender losses by 58 across the two raids, while storing 31 less food. Both neutral guards passed, with 14% less food on seed 11 and identical outcomes on seed 17.

Reproduce with `node scripts/drop-refusal-recovery.mjs --guard defendHome 11 0.65 visible-even-counterattack`. Use `visible-counterattack` for outnumbering only and `contact` for the neutral guard.

The additional seeds reproduce the advantage in defender survival and add one raid pass.

| Guard | Seed | Wall-aware, outnumbering | Wall-aware, outnumbering or even |
| --- | ---: | ---: | ---: |
| Raid, defender food / losses / raiders killed | 14 | 221 / 59 / 32 | 284 / 40 / 38 |
| Raid, defender food / losses / raiders killed | 20 | 482 / 70 / 36 | 620 / 40 / 44 |
| Neutral, combined food / losses | 14 | 2737 / 0 | 2737 / 0 |
| Neutral, combined food / losses | 20 | 2214 / 0 | 2214 / 0 |

Across all four raid maps, allowing even odds passes 3/4, versus 1/4 for outnumbering and 2/4 for existing combat. Defender losses are 164 versus 271 and 156 respectively. Combined neutral passes are 4/4 in both wall-aware arms. The even-odds arm is the candidate to carry into a production sensor and fresh seeds.

### Simulated counterattack cue

The game can now evaluate the even-odds rule from a shared previous-tick snapshot. The cue uses the worker's own stranger tolerance and requires the same layer, a distance of at most one world unit and a clear sampled segment. The local contact response can use it while authored responses retain their existing decisions and cache keys. The snapshot is derived from existing saved attack markers. The no-defense A13 control disables the counterattack rule.

| Guard | Seed | Directed baseline | Simulation cue |
| --- | ---: | ---: | ---: |
| Raid, defender food / losses / raiders killed | 11 | 147 / 93 / 43 | 161 / 36 / 40 |
| Raid, defender food / losses / raiders killed | 17 | 144 / 111 / 38 | 253 / 48 / 45 |
| Raid, defender food / losses / raiders killed | 23 | 606 / 82 / 37 | 602 / 38 / 42 |
| Raid, defender food / losses / raiders killed | 29 | 75 / 86 / 45 | 85 / 45 / 38 |
| Neutral, combined food / losses | 11 | 2152 / 1 | 1859 / 0 |
| Neutral, combined food / losses | 17 | 1678 / 0 | 1678 / 0 |
| Neutral, combined food / losses | 23 | 1720 / 0 | 1713 / 1 |
| Neutral, combined food / losses | 29 | 1621 / 1 | 1528 / 2 |

The simulation matches the previous prototype on the two replayed seeds for food and casualties. Both fresh raids improve defender survival (168 to 83 losses). Seed 23 gains a pass and seed 29 loses one. The four raid checks pass 3/4 for the simulation cue and 2/4 for the directed baseline. The four neutral checks pass in both arms. Normal-play adoption remains pending full-length and broader-map validation.

Reproduce with `node scripts/drop-refusal-recovery.mjs --guard defendHome 23 0.65 simulation-counterattack`. Omit the last argument for the directed baseline.
