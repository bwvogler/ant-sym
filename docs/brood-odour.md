# Brood odour: young workers keep to the brood by its smell, not to the queen

*Research note for `ja-k4k.2.1` (the young's chamber steering) and its epic (PRD §72). Written 2026-11-14, against code at `004e7c6`. Two research passes: primary papers in full text where PubMed Central, PLOS, Frontiers or OUP served them. Springer, Nature, science.org, pnas.org and bioRxiv full texts were refused (login redirects, 403, 429), and several university repositories didn't resolve. Numbers from abstracts, snippets or press coverage are marked **unverified**; honeybee results are marked **[bee analogy]**.*

**What the game does today.** A young ant (band 0) in a chamber turns toward the queen's exact x,y (`steer.ts`, the branch after the store fetch): a read no ant can make (`docs/vision.md`, gap row "Steering in a chamber: to the queen"). PR #192 tried two sensed replacements:
- **The royal and brood floor marks, summed:** `chambers.test` failed.
- **The royal mark alone:** it passed `chambers.test`, but colonies collapsed on some seeds of `economy.test`'s setup, and `side.test`'s held-forager guard failed.
- **Why both failed:** both marks are laid by *every* ant (the role mark across the queen's chamber, rim included; the brood mark as a road sign along tunnels). Climbing them led the young to rims and passages, away from the brood they feed.

**The question:** what do real young workers sense that keeps them with the brood?

## The queen's pheromone holds workers by contact; it is not the nurses' beacon

- ***Lasius niger*:** the queen pheromone 3-MeC31 is a cuticular hydrocarbon of "very low volatility". Model queens coated with it were attacked less, and worker antennae respond to it. No attraction or aggregation was tested. Queens carry 6.1× the workers' proportion of it, and it is the most abundant hydrocarbon on queen-laid eggs (Holman et al. 2010, *Proc R Soc B*, full text).
- **Across species:** the conserved queen pheromones are non-volatile saturated hydrocarbons that suppress worker reproduction (Van Oystaeyen et al. 2014, **unverified**, snippet).
- ***Myrmecia gulosa*:** workers need direct contact to perceive the queen (Dietemann et al. 2003, **unverified**, snippet).
- ***Solenopsis invicta* is the exception.** The queen pheromone, from the poison sac, "elicits orientation and attraction in workers and promotes the deposition of brood" (Vander Meer et al. 1980, abstract, **unverified**). Whole-body queen extract attracts workers when carried on an air stream in an olfactometer: some attraction at 0.01 queen equivalents, strongest at 0.5–5 (Lofgren et al. 1983, abstract, **unverified**).
  - No range in cm is given.
  - The active blend induces aggregation and retinue behaviour around surrogate queens, but is not shown to signal queen identity (Guo et al. 2026, review, full text).
- ***Monomorium pharaonis*:** the queen compound neocembrene is "weakly attractive". It drew 67% more interacting workers to beads at 5 queen equivalents; distance was not tested (Oliveira et al. 2020, *Biol Lett*, full text).
- **[bee analogy]** Queen mandibular pheromone is non-volatile and passes between workers by licking and antennation, fading as it goes (Richardson et al. 2024, *BMC Biol*, full text). In ants, no study found shows workers near the queen carrying more of her scent.
- **Correction to `nest-and-home.md` §1, "The queen":**
  - Berton et al. 1991 (*Insectes Sociaux* 38:293) studies *Cataglyphis cursor*, not fire ants, so the claim it was cited for has no fetched fire-ant source.
  - The line "queenless workers drift away from the brood" has no source either.

**In the game:** keep the queen's scent as it is built (`ja-lo8.9`): carried on nestmates, passed by contact, read by nurses for caste. It tells a nurse *that* the queen is present. It is not what young ants steer by, and the young should not steer to her position or her mark. A short-range queen volatile could be a fire-ant-like species option later (**design**: no range is measured).

## Workers are drawn to brood odour, over a short distance

- ***S. invicta*, airborne attraction:** workers in a Y-tube went toward air blown over larvae, and equally to their own colony's larvae and another colony's. Larval rinse made workers gather round and retrieve dummy brood, and worker antennae responded from 1 to 100 brood equivalents (Glancey & Dickens 1988, *J Chem Ecol*, abstract, **unverified**).
- ***S. invicta*, contact:** brood is also recognised by a contact pheromone (Walsh & Tschinkel 1974, *Anim Behav*; title only, so the detail is from memory; not fetched).
- ***Neivamyrmex opacithorax*:** army-ant workers were attracted to secretions of larvae and pupae (Watkins & Cole 1966, **unverified**, from a citing snippet).
- ***Ooceraea biroi*:** larvae make a volatile that acts without contact, but it was tested only as a suppressor of worker egg-laying, not as an attractant (Piqueret et al. 2026, **unverified**, press release).
- **[bee analogy]** The larval volatile E-β-ocimene acts through a screen bees can't touch. The youngest larvae give off the most (L1 4.33 ng/mg against ≤ 0.085 for later stages), and its range in the hive was not measured (Maisonnasse et al. 2010, *PLoS ONE*, full text).
- **Not found:** any measured range for an ant brood volatile. The evidence covers centimetres of a Y-tube with forced air.

**In the game:** a new field, **brood odour**, laid by the brood items themselves (eggs, larvae, pupae) where they lie, not by passing ants.
- It is strongest on the brood and falls off over a few cells (**design**: the reach and rates; no range is measured).
- It doesn't tell colonies apart (Glancey & Dickens 1988): who is a nestmate stays a contact check. In the game each colony's field holds only its own brood, a simplification (**design**).
- It extends the sense table's existing "Brood" row: tend here, at a short reach.

## The young answer it more, by a threshold age raises

- ***Temnothorax longispinosus*:** young workers did the brood care (z = 4.5, p < 0.0001). Young (30 d) and old (1 yr) workers responded differently to larval and adult cuticle extracts (z = 3.6, p = 0.0002). Knocking down one gene made young workers prefer adult odours, "resembling old workers" (Kohlmeier et al. 2018, *PLoS Biol*, full text). The direction in the controls, young toward larval odour, is inferred from that sentence.
- ***O. biroi*:** alone with one larva for 5 h, young ants stayed in near-constant contact with it while old ants drifted away, and starved ants nursed more (Kay et al. 2026, **unverified**, press).
- ***Temnothorax albipennis*, limits:**
  - Which ants tended newly added brood was not predicted by age, leanness, past activity or spatial-fidelity zone (all p ≥ 0.13).
  - Carrying brood to the pile was predicted by past activity inside and by leanness, not by age (p = 0.21) (Robinson et al. 2009, *Proc R Soc B*, full text).

**In the game:** the young climb brood odour and the old don't, as the game zones work by age today (`Colony.band`).
- **First build:** the band-0 ants only, as now.
- **Later:** a response threshold that rises with age and falls with hunger is the better-supported form. It belongs with `ja-k4k.1` (work by age), not this epic.

## The brood pile is the attractor; climate decides where it lies

- ***Leptothorax unifasciatus*:**
  - The brood forms one cluster of concentric rings, eggs and micro-larvae at the centre (Franks & Sendova-Franks 1992, abstract, **unverified**).
  - Each worker keeps to a small spatial-fidelity zone, and how much she cares for brood follows how much her zone overlaps the brood; "no clear segregation on the basis of age" (Sendova-Franks & Franks 1995, abstract, **unverified**).
- ***T. albipennis*:** brood added to a second chamber was carried to the main pile, and callows sat nearer its centre (Robinson et al. 2009, full text).
- ***Pogonomyrmex badius*:** about 98% of brood lies deepest (larvae at about 110–120 cm), and below 70 cm over 90% of workers are young. CO₂ is not the depth template: "the depth cues… remain unknown" (Tschinkel & Hanley 2017, *PLoS ONE*, full text).
- ***Temnothorax rugatulus*:** nest shape changes where brood and queens lie (Chism et al., bioRxiv 2022.06.30.498314, **preprint**, abstract). A first pass reported that queens sit farther from the brood centroid than workers; the full text wasn't reachable, so that is **unverified**.
- **Counter-evidence, climate:**
  - *Camponotus mus* nurses move brood along a temperature gradient, to 30.8 °C at midday and 27.5 °C at night (Roces & Núñez 1989, abstract, **unverified**).
  - *Camponotus rufipes* workers each have their own temperature threshold for moving brood (Weidenmüller et al. 2009, abstract, **unverified**).
  - *Acromyrmex lundii* places brood at 3% CO₂ (Römer et al. 2018, abstract, **unverified**).

**In the game:** brood odour tells a young ant where the brood *is*. Where brood *should* lie (which chamber) stays the nurses' brood-carrying rule (`nurse`, `BROOD_MIN`, the chamber table: `ja-k4k.4`), and the odour moves with the brood. Nurses dropping brood where the odour is strongest would build piles by positive feedback, a later step and not this epic's.

## Larval hunger is felt by touch, not smelt

- ***Formica*, four species:** workers showed no preference for extracts of starved larvae (p = 0.06–0.85), and starved and fed larvae had the same hydrocarbons. Begging is body swaying and mandible movements (Peignier et al. 2019, *Front Ecol Evol*, full text).
- ***S. invicta*:** hungry and larger larvae were fed more often, though workers met larvae hundreds of times an hour and fed them only tens of times: a cue checked at each meeting (Cassill & Tschinkel 1995, **unverified**, snippet).
- **[bee analogy]** Starved bee larvae give off more E-β-ocimene (He et al. 2016, *Sci Rep*, full text): bee biology, not used here.

**In the game:** brood odour doesn't rise with hunger. Hunger stays the touch sense already built (`hunger.ts`, the felt grid: `ja-xu6.1`).

## What was not found

- A measured range, in mm or cm, for any ant brood or queen volatile.
- How fast a retinue forms, or its size, in any ant.
- Ant evidence that queen odour moves onto workers, or that workers near her carry more.
- An ant experiment removing or moving the queen to see whether nurses stay with the brood or follow her.
- The full texts of Walsh & Tschinkel 1974, Glancey et al. 1970, Watkins & Cole 1966, Creemers et al. 2003, Mersch, Crespi & Keller 2013 and Chism et al.; and the brood-recognition review of Schultner & Pulliainen 2020.

## The mechanic

| Cue (sensed) | Sense row | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| brood odour at its three antennae, through open ground | Brood (extended: a short-range odour) | steering, for a young ant in a chamber | climb it (`climb`, as the store fetch climbs store); none at or above `FAINT`, search | the queen's x,y (main bit for bit) | the queen's x,y (`ja-k4k.2.1`) |

1. **The field.** Each colony layer gets a `broodOdour` channel. Every brood item lying in a chamber or on the floor (not held) lays `BROOD_ODOUR` a second on its cell. The channel evaporates fast and spreads a little, so it reaches about two or three cells: a gradient strongest on the pile (**design**: the values are tuned so the chambers' edges read below `FAINT` when no brood lies near). It is saved with the colony's other fields. Its off setting lays nothing, so the goldens hold bit for bit.
2. **The steering.** A young ant (band 0) in a chamber reads the field at its three antennae (`marksAt`, through open ground) and climbs it. With nothing at or above `FAINT`, it searches. The setting `broodClimb` (0 = off = the queen's x,y, 1 = on) carries it, and the setting goes when the build is accepted.
3. **What it leaves alone:**
   - the queen's carried scent and caste (`royal.ts`);
   - the royal and brood floor marks (road signs and roles);
   - `toBrood` in tunnels;
   - the nurses' brood-chamber choice.
4. **Cost.** Steering only: no new situation field, so no Jev cost. The tick cost is one deposit per brood item and three reads per young ant in a chamber; the bench budget is under 2% of the side-view tick.

**For the model:** a young ant has no global knowledge of the queen. It smells brood near it and turns toward where the smell is stronger. The fungus's levers don't reach this cue (see Play).

## Play

- **See:** in the side view the youngest ants gather on the brood piles, in the royal chamber early on and in the brood chambers once they're big enough, rather than in a ring round the queen. A Learn entry ("Nurses") can say: what you see, the young sitting on the brood; what real ants do, follow the brood's smell, while the queen's scent works by touch; how the game models it.
- **Choose:** none directly; this is groundwork that removes a cheat. A fungus lever on brood-odour perception ("nurses lose the brood") would be the player's handle. It is **design**: no paper shows a fungus doing it. It's filed as an open question, not built.
- **Counterplay and progression:** unchanged. No new lever and no threshold where a colony flips.
- **Cost:** none in Jev; cached games spend nothing.
- **Risks:**
  - The economy can tip, as #192's royal-mark climb did. Measured by `economy.test`'s setup over 20 seeds against main and `BROOD_MIN`: collapses, the worst stranding, seeds over 5.
  - Young ants could pile up in tunnels by small brood chambers, held foragers again. Measured by `side.test` #16's guard and the side `game` assay.
  - Chamber growth changes (`chambers.test`). If the young sit on the brood away from the queen's chamber, its widening changes.
- **Owner decisions needed:** listed below.

## Open questions

- Whether a fungus lever on brood-odour perception is worth designing (owner).
- Age-graded thresholds instead of the band-0 cutoff: `ja-k4k.1`.
- Whether nurses should drop brood where the odour is strongest (piles by positive feedback) and so retire part of the chamber-table choice: `ja-k4k.4`.
- A fire-ant-like queen volatile as a species option (no range measured). Owner, 2026-11-15: no queen attractant otherwise; her contact pheromone stays for caste.
- The field's reach: two or three cells is **design**; the target is the zoning assay below, not a measured range.

## Sources

A title in square brackets describes the paper; it isn't the paper's own title.

- Holman L, Jørgensen CG, Nielsen J, d'Ettorre P (2010). Identification of an ant queen pheromone regulating worker sterility. *Proc R Soc B* 277:3793–3800. [PMC2992706](https://pmc.ncbi.nlm.nih.gov/articles/PMC2992706)
- Van Oystaeyen A et al. (2014). Conserved class of queen pheromones stops social insect workers from reproducing. *Science* 343:287–290. [record](https://researchportalplus.anu.edu.au/en/publications/conserved-class-of-queen-pheromones-stops-social-insect-workers-f/)
- Dietemann V et al. (2003). Cuticular hydrocarbons mediate discrimination of reproductives and nonreproductives in the ant *Myrmecia gulosa*. *PNAS* 100:10341–10346. [doi:10.1073/pnas.1834281100](https://doi.org/10.1073/pnas.1834281100)
- Vander Meer RK, Glancey BM, Lofgren CS, Glover A, Tumlinson JH, Rocca J (1980). The poison sac of red imported fire ant queens: source of a pheromone attractant. *Ann Entomol Soc Am* 73:609–612. [doi:10.1093/aesa/73.5.609](https://doi.org/10.1093/aesa/73.5.609)
- Lofgren CS, Glancey BM, Glover A, Rocca J, Tumlinson J (1983). Behavior of workers of *Solenopsis invicta* to queen recognition pheromone. *Ann Entomol Soc Am* 76:44–50. [doi:10.1093/aesa/76.1.44](https://doi.org/10.1093/aesa/76.1.44)
- Guo et al. (2026). [A review of fire-ant semiochemicals.] *Insects* 17:150. [PMC12940258](https://pmc.ncbi.nlm.nih.gov/articles/PMC12940258/)
- Oliveira RC et al. (2020). [The pharaoh-ant queen pheromone neocembrene.] *Biol Lett* 16:20200348. [PMC7480160](https://pmc.ncbi.nlm.nih.gov/articles/PMC7480160)
- Richardson et al. (2024). [How queen pheromone spreads through a honeybee colony.] *BMC Biol* 22:288. [PMC11658054](https://pmc.ncbi.nlm.nih.gov/articles/PMC11658054) **[bee analogy]**
- Berton F, Lenoir A, Nowbahari E, Barreau S (1991). Ontogeny of queen attraction to workers in the ant *Cataglyphis cursor*. *Insectes Sociaux* 38:293–305. [antwiki](https://www.antwiki.org/wiki/File:Berton,_F.,_Lenoir,_A.,_Newbahari,_E.,_Barreau,_S._1991._Ontogeny_of_queen_attraction_to_workers_in_the_ant_Cataglyphis_cursor.pdf)
- Glancey BM, Dickens JC (1988). Behavioral and electrophysiological studies with live larvae and larval rinses of the red imported fire ant. *J Chem Ecol* 14:463–473. [PubMed 24275993](https://pubmed.ncbi.nlm.nih.gov/24275993/)
- Walsh JP, Tschinkel WR (1974). Brood recognition by contact pheromone in the red imported fire ant. *Anim Behav* 22:695–704. [doi:10.1016/s0003-3472(74)80020-5](https://doi.org/10.1016/s0003-3472(74)80020-5)
- Piqueret B et al. (2026). [A larval volatile in *Ooceraea biroi*.] *PNAS*. [MPG press release](https://www.mpg.de/26352209/ant-larvae-control-parental-care-by-using-odor-signals) *(secondary)*
- Maisonnasse A et al. (2010). E-β-ocimene, a volatile brood pheromone involved in social regulation in the honey bee colony. *PLoS ONE* 5:e13531. [journal](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0013531) **[bee analogy]**
- Kohlmeier P et al. (2018). Vitellogenin-like A–associated shifts in social cue responsiveness regulate behavioral task specialization in an ant. *PLoS Biol* 16:e2005747. [PMC5991380](https://pmc.ncbi.nlm.nih.gov/articles/PMC5991380/)
- Kay T, Kronauer DJC et al. (2026). [Age, hunger and nursing in *Ooceraea biroi*.] *Nature*, doi:10.1038/s41586-026-10747-6. [Rockefeller news](https://www.rockefeller.edu/news/40032-ant-brain-parenting-evolution) *(secondary)*
- Robinson EJH, Feinerman O, Franks NR (2009). Flexible task allocation and the organization of work in ants. *Proc R Soc B* 276:4373–4380. [PMC2817103](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817103/)
- Franks NR, Sendova-Franks AB (1992). Brood sorting by ants: distributing the workload over the work-surface. *Behav Ecol Sociobiol* 30:109–123. [doi:10.1007/BF00173947](https://doi.org/10.1007/BF00173947)
- Sendova-Franks AB, Franks NR (1995). Spatial relationships within nests of the ant *Leptothorax unifasciatus* and their implications for the division of labour. *Anim Behav* 50:121–136. [doi:10.1006/anbe.1995.0226](https://doi.org/10.1006/anbe.1995.0226)
- Tschinkel WR, Hanley N (2017). Vertical organization of the division of labor within nests of the Florida harvester ant, *Pogonomyrmex badius*. *PLoS ONE* 12:e0188630. [PMC5705139](https://pmc.ncbi.nlm.nih.gov/articles/PMC5705139/)
- Chism GT, Nichols W, Dornhaus A. [Nest shape and where brood and queens lie in *Temnothorax rugatulus*.] bioRxiv 2022.06.30.498314 (preprint). [bioRxiv](https://www.biorxiv.org/content/10.1101/2022.06.30.498314v2)
- Peignier M et al. (2019). [Larval hunger signals in four *Formica* species.] *Front Ecol Evol* 7:398. [journal](https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2019.00398/full)
- Cassill DL, Tschinkel WR (1995). Allocation of liquid food to larvae via trophallaxis in colonies of the fire ant. *Anim Behav* 50:801–813. [USF repository](https://digitalcommons.usf.edu/fac_publications/1007)
- He XJ et al. (2016). [Starved honeybee larvae give off more E-β-ocimene.] *Sci Rep* 6:22359. [PMC4770327](https://pmc.ncbi.nlm.nih.gov/articles/PMC4770327/) **[bee analogy]**
- Roces F, Núñez JA (1989). Brood translocation and circadian variation of temperature preference in *Camponotus mus*. *Oecologia* 81:33–37. [PubMed 28312153](https://pubmed.ncbi.nlm.nih.gov/28312153/)
- Weidenmüller A, Mayr C, Kleineidam CJ, Roces F (2009). Preimaginal and adult experience modulates the thermal response behavior of ants. *Curr Biol* 19:1897–1902. [PubMed 19913420](https://pubmed.ncbi.nlm.nih.gov/19913420/)
- Römer D, Bollazzi M, Roces F (2018). Carbon dioxide sensing in the social context: leaf-cutting ants prefer elevated CO2 levels to tend their brood. *J Insect Physiol* 108:40–47. [PubMed 29778905](https://pubmed.ncbi.nlm.nih.gov/29778905/)
