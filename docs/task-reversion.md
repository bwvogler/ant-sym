# Task reversion: old foragers go back to the brood when the nurses are gone

*Research note for `ja-7r7x` (fixes `ja-rvli`; PRD §74). Written 2026-11-14, against code at `e033681`. Read in full: Starkey & Tamborindeguy 2023 (PMC, the text; figures and supplementary tables not read), Symonowicz et al. 2015 (PMC, Introduction to Discussion; reference list only in part), Kohlmeier, Feldmeyer & Foitzik 2018 (PMC, Abstract to Results verbatim; Discussion and Methods only as a summary, marked). Not reached (network allowlist): Muscedere, Willey & Traniello 2009 and Seid & Traniello 2006 (ScienceDirect, ResearchGate); Huang & Robinson 1996 and Greene & Gordon 2003 were read as abstracts only, so their numbers are **unverified**. The older ant papers on reversion (Ehrhardt 1931, Dobrzańska 1959, Lenoir 1979, Sorensen et al. 1984, McDonald & Topoff 1985) are known only as cited by Symonowicz et al. 2015.*

The question: when a colony has no young workers left to nurse, do older workers go back to tending the brood, and what tells them to?

In the game today they don't. Work is zoned by age (`Colony.band`): the young nurse, the middle-aged dig and carry, the old forage. Old ants answer the brood's hunger only when they feel it by touch at a felt need of `THETA_OLD` (0.3) or more (ja-xu6.1, `worksInside`, `fetches`), and nothing brings them to the brood. In `economy.test`'s small map the founders age as one cohort: by about 1,500 s every worker is old. The first larvae then hatch into a colony with nobody beside them, and they are fed only if old ants, hungry themselves, happen to fetch food past them. Over 16 hour-long games (4 worlds × 4 nudges), 3 games left more than 8 larvae waiting over two minutes beside enough food, the worst 19 (ja-rvli; PRD §70).

## Ants revert to nursing when brood is there and the young are not

- In ants and honey bees, behavioural reversion is induced "by the exposure of foragers to brood in absence of younger workers acting as nurses" (Symonowicz et al. 2015, Introduction, citing Ehrhardt 1931, Dobrzańska 1959, Lenoir 1979a and 1987, Robinson et al. 1992 and others). In ants "induction of brood care may occur very rapidly, within 24 h" (same, citing Lenoir 1979a, Sorensen et al. 1984, McDonald & Topoff 1985, Wnuk et al. 2011). They made reverted nurses of *Formica polyctena* by putting worker pupae on the floor of a nest of about 3,500 foragers: after about 24 h, "usually about 400" workers per batch were found settled on the brood in direct contact with the pupae. The share that reverted was not reported.
- *Temnothorax longispinosus*: with every young worker removed, "old workers responded with elevating their 'frequency of brood care' to a level close to significance (z = 2.0, p = 0.051) and up to the level of young workers", and "old workers moved to the inside of the nest when all young workers were removed (PERMANOVA: F = 8.0, p = 0.0001)" (Kohlmeier, Feldmeyer & Foitzik 2018, Results). The reverse did not happen: with the old removed, the young did not forage more (t = 0.2, p = 0.831). Young brood carers prefer the odour of larvae and old workers that of adult workers (cuticular extracts, z = 3.6, p = 0.0002); the authors argue the switch rests on shifts in responsiveness from brood cues to worker cues.
- *Solenopsis invicta* (medium workers, micro-colonies of 10 marked foragers and 10 marked nurses with one kind of brood): with the nurses removed, tasks were reassigned "in as little as 5 min" and the workers then kept their new task (Starkey & Tamborindeguy 2023, Discussion). The kind of brood mattered: with pupae there was no difference from the controls; with eggs, 13 of 22 foragers were nursing by day 3 (counts from Table 1, our arithmetic), which the authors put down to the eggs hatching. Brood presence and nurse absence were not separated: every micro-colony had brood.
- Honey bees: reversion to nursing, with its hormonal changes, was induced "in colonies composed of all old bees and devoid of brood" in three of three trials (Huang & Robinson 1996, abstract; **unverified**). In bees, then, the absence of young bees alone sufficed; the older bees' inhibition of younger ones needs direct contact (same group's work, as summarised in search results; **unverified**).

**In the game:** the trigger is two cues an old ant senses, both local:
- **brood**, by its odour and by touch: the brood and royal marks the young already follow (`toBrood`; the vision table's "Brood" row);
- **no young nestmates met**: the young it touches, counted as a rate that leaks away, like activation's count of returning foragers (`met`, docs/activation.md).

An old ant at home that has met almost no young nestmates for a while reverts: it stays in, follows the brood marks inward as the young do, and works inside at a young worker's threshold (`NEED_FETCH` instead of `THETA_OLD`). Once by the brood, the existing felt-need chain (begging larvae, porters, the `want` view) does the rest. It goes back to foraging once it meets young nestmates again.

## Workers can tell a nestmate's task by its cuticle

- *Pogonomyrmex barbatus*: cuticular hydrocarbons differ with task, and workers use them to recognise the task of the ants they meet. Glass beads coated with patrollers' extracts, dropped into the nest every 10 s, restored foraging as returning patrollers do (Greene & Gordon 2003, abstract and search-result summaries; **unverified**). The timing of the encounters mattered, not only the scent.
- *Temnothorax longispinosus* workers tell larvae from adults by cuticular extracts, and their preference shifts with age (Kohlmeier et al. 2018, above).
- No paper read here shows an ant telling a young nestmate from an old one by touch. Task-linked cuticles (nurse against forager) are the nearest evidence.

**In the game:** the game's ants already tell nestmate from stranger by contact (the sense table's cuticular-hydrocarbons row). Extending it to "a young nestmate" (a nurse) is the same channel at finer grain. It is marked **design** until a paper shows nurse-versus-forager recognition by contact in an ant.

## What was not found

- A measured share of foragers that revert, or a rate. The fire-ant counts are tiny and confounded, and the *Formica* paper reports only "about 400" per batch.
- What ends a reversion. Fire-ant workers kept their new task for the three days watched; no paper read here measured a return to foraging once young workers come back.
- Whether reverted workers also keep foraging part of the time.
- The *Pheidole dentata* work (Muscedere et al. 2009; Seid & Traniello 2006), which reports older minors caring for brood as often as young ones, could not be read.

## The mechanic

One setting whose 0 is main bit for bit. All of it is steering and body rules with no new situation field, so **no Jev cost**.

- **Cue (sensed):**
  - `youngMet`: a leaky count, per ant, of young nestmates (age band 0) within one cell, with the same half-life machinery as `met`.
  - The brood marks it smells (`royal` + `brood` fields).
- **Reverting:** an old ant (band 2) inside its own nest whose `youngMet` is below `REVERT_BELOW`.
- **Individual thresholds (design):** only a share of the old revert, each by a threshold drawn at birth. A colony of all-old ants then keeps foragers. The setting `revert` is that share; 0 is off.
- **Response, while reverted:** not outbound (it stays in); `toBrood` steering like the young; `worksInside` always; `fetches` at `NEED_FETCH`; and no foraging dig (`forageDig`, ja-16rp).
- **Ending:** `youngMet` back above the floor; it then climbs out to forage as before.
- **Retires:** nothing. It adds no global read; the young it meets are sensed by contact.

**Assay (lands first, no behaviour change):** `larvae`, built on `economy.test`'s `hour()`: 4 worlds × 4 nudges, 3,600 s, the tests' small map with one colony of 110.
- **Measures:** the peak count of larvae waiting over 120 s beside food enough for them.
- **Guards:** workers alive and born, workers starved, food stored, and food brought home per hour (reverting foragers forage less).
- **Target:** no game above 8 waiting, which is `ja-rvli`'s acceptance. Then the same with `forageDig: 120`, for `ja-16rp.5`.

## Play

- **What the player sees:** when a colony's young are gone, old foragers walk down to the brood chambers and tend the larvae; the colony keeps raising brood instead of stalling. The Learn drawer can say: "when there are no young ants to nurse, some old foragers go back to the brood".
- **Choices it makes matter:** the fungus's aim. A strain that kills or keeps the young away (a nurse-killer) used to stall a colony's brood for good; now it pulls foragers back inside, so the colony forages less but survives. The colony answers with social resilience, not a free lever: counterplay to the fungus, as social immunity is.
- **Progression:** unchanged early (colonies start with young ants); it matters in long games and after losses, when a cohort ages out. A slope, not a cliff: only a share of the old revert.
- **Cost:** none in Jev (no situation field). CPU: one count per ant per tick of young nestmates near it, over a per-cell grid of the young like `friends`.
- **Risks to play:**
  - A runaway: every old ant reverts, nobody forages, and the colony starves on a full brood. The individual thresholds and the food-home guard are there to catch it.
  - Invisible: a reverted forager looks like any old ant. A Learn entry, or the followed ant's tag saying "nursing", would show it.
  - The fungus loses a lever if reversion is too strong. It should cost the colony foraging, which is what the fungus can then exploit.

## Open questions

- **The owner's calls:** the share of old ants that can revert (`revert`; design, no measured share); and whether to start from `economy.test`'s cohort or also test colonies that lose their young to a fungus.
- **Still to measure:** whether reversion holds larvae under 8 in all 16 games, with and without the foraging dig; what it costs in food brought home.
- **Still to read:** Muscedere et al. 2009 and Seid & Traniello 2006 (*Pheidole dentata*), Huang & Robinson 1996 and Greene & Gordon 2003 in full, and a paper on nurse-versus-forager recognition by contact in an ant.

## Sources

- Starkey J, Tamborindeguy C (2023). Family before work: task reversion in workers of the red imported fire ant, *Solenopsis invicta* in the presence of brood. *Sci Rep* 13:2379. [PMC9918486](https://pmc.ncbi.nlm.nih.gov/articles/PMC9918486/), [doi:10.1038/s41598-023-29246-z](https://doi.org/10.1038/s41598-023-29246-z)
- Symonowicz B et al. (2015). Behavioral reversion and dark–light choice behavior in workers of the red wood ant *Formica polyctena*. *J Insect Behav* 28:245–256. [PMC4435637](https://pmc.ncbi.nlm.nih.gov/articles/PMC4435637/), [doi:10.1007/s10905-015-9496-2](https://doi.org/10.1007/s10905-015-9496-2)
- Kohlmeier P, Feldmeyer B, Foitzik S (2018). Vitellogenin-like A–associated shifts in social cue responsiveness regulate behavioral task specialization in an ant. *PLoS Biol* 16:e2005747. [PMC5991380](https://pmc.ncbi.nlm.nih.gov/articles/PMC5991380/), [doi:10.1371/journal.pbio.2005747](https://doi.org/10.1371/journal.pbio.2005747)
- Huang ZY, Robinson GE (1996). Regulation of honey bee division of labor by colony age demography. *Behav Ecol Sociobiol* 39:147–158. [doi:10.1007/s002650050276](https://link.springer.com/doi/10.1007/s002650050276) (abstract only; **unverified**)
- Greene MJ, Gordon DM (2003). Social insects: cuticular hydrocarbons inform task decisions. *Nature* 423:32. [doi:10.1038/423032a](https://www.nature.com/articles/423032a) (abstract only; **unverified**)
- Muscedere ML, Willey TA, Traniello JFA (2009). Age and task efficiency in the ant *Pheidole dentata*: young minor workers are not specialist nurses. *Anim Behav* 77:911–918. [ScienceDirect](https://sciencedirect.com/science/article/pii/S000334720900013X) (not reached)
