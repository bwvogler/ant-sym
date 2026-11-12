# The Pharaoh ant (*Monomorium pharaonis*): many queens across budding nests, and three trails on three clocks

*Research note for the species epic `ja-n70l` (PRD §64.4). Written 2026-11-12, against code at `f8afe17`. **Read in full text** (all through PMC; for the long ones, the first 100,000 characters): Beekman, Sumpter & Ratnieks 2001; Schmidt, d'Ettorre & Pedersen 2010; Pontieri et al. 2014; Mikheyev & Linksvayer 2015; Warner et al. 2019; Nagel et al. 2020; Oliveira et al. 2020; Walsh et al. 2020; Li et al. 2022; Rajakumar, Pontieri et al. (*J Exp Zool B*); Baek & Kim 2026 (a citing paper, used only for figures it quotes). **Abstract or search snippet only** (numbers **unverified**): Robinson et al. 2005 and 2008, Jackson et al. 2004, 2006 and 2007, Hart & Jackson 2006, Tay & Lee 2015, Warner et al. 2018, Schmidt et al. 2011, Buczkowski & Bennett 2009, Pontieri et al. 2017, Singh et al. 2023/2024. **Not reached:** Jeanson et al. 2003 (half-lives per surface), Jackson & Châline 2007. From the session only `pmc.ncbi.nlm.nih.gov` could be reached; `nature.com`, Wiley, bioRxiv, Springer and `doi.org` were blocked, so every trail paper's numbers here are from abstracts. The repo's earlier lead "Current Biology primer S0960-9822(06)01834-3" ([ant-communication](ant-communication.md) §1) could not be matched to a paper (it may be Hart & Jackson 2006).*

The generic ant has one queen, one nest, food, home, alarm and "no entry" channels, and colonies that fight strangers ([species.md](species.md)). The question: **what does a Pharaoh ant colony sense and do that the generic ant does not, and which of it can one policy over sensed state carry?** It was the owner's candidate for budding and several queens ([queens-and-merging](queens-and-merging.md) §2, `ja-8fd.1`).

## 1. Many queens, mating in the nest, colonies by budding

- Colonies have many inseminated queens; mating happens inside the nest; new colonies are founded by budding (queens with workers), never by a lone queen (Nagel et al. 2020, *Sci Adv* 6:eaaz5772; Li et al. 2022, *Nat Ecol Evol* 6:1191; Walsh et al. 2020, *Proc R Soc B* 287:20201029), **full text**. A lab bud is 4 queens, 400 ± 40 workers and brood; a source colony had about 50 queens (Walsh et al. 2020; Baek & Kim 2026, citing).
- Removing the queens makes the colony rear gynes and males, the first gynes 31–40 days later; haploid eggs are reared as males only when queenless; uninseminated gynes turn to worker-like work and live 4–6 months (Nagel et al. 2020; Walsh et al. 2020), **full text**. No queen lifespan was found.
- The queen pheromone is neocembrene, from the Dufour gland of fertile queens only. One queen-equivalent is 377 ng. At 10 or more queen-equivalents sexual rearing fell about six-fold (controls: about 5.7 % of larvae became sexuals); 0.1–5 equivalents had no effect, so the response has a threshold that "mimics several queens"; at 5 equivalents 67 % more workers touched the bead. The authors infer that workers cull sexual larvae (Oliveira et al. 2020, *Biol Lett* 16:20200348, PMC7480160), **full text**.
- Colonies cull larvae bound to be reproductives according to the ratio of eggs to workers; smaller colonies make more queens per worker (Warner et al. 2018; Schmidt et al. 2011). **Unverified** (abstracts).

**In the game:** several queens is `Colony.queens[]` (`ja-8fd.1`); budding is founding on foot (the same route [lasius-neglectus](lasius-neglectus.md) §1 needs). The queen's signal already exists as a sense and already holds back new queens ([new-queens §2](new-queens.md#2-the-queen-holds-it-back)): for this species its effect needs the *sum* of several queens to pass a threshold, which is **data** on an existing rule. Queenless rearing of males from haploid eggs is a body rule (tier 2).

## 2. Nests move and split on what the colony senses

- Food depletion split a colony about 60/40 (by brood) between the old and a new nest by day 5; physical disturbance, an insecticide or a foreign ant species moved nearly all workers and brood to the new nest by day 1; controls left under 5 % in the new nest; drying had no effect (Tay & Lee 2015, *J Econ Entomol* 108). **Unverified** (abstract).
- Colonies are described as "highly polygynous" and "facultatively polydomous", with budded units cooperating over food rather than competing (Buczkowski & Bennett 2009, *Ethology* 115:1091). **Unverified** (abstract).
- The species lives mostly in buildings (Schmidt et al. 2010; Pontieri et al. 2014), **full text**.

**In the game:** emigration is a new **mode** (carry brood to another site), chosen by the policy on sensed causes: alarm at home, strangers met at home, no food found. It is the one tier‑3 piece this species needs; budding is emigration that takes part of the colony. Polydomy (one colony, several nests) is the nest kind's (`ja-fnd.5.5`).

## 3. Three trail signals on three clocks, one of them repellent

- A repellent "no entry" signal is laid on the unrewarding branch near a fork (Robinson et al. 2005, *Nature* 438:442). Its effect lasts about 78 min, against about 33 min for the short-lived attractive pheromone; at first it shifts branch choice 48 % against 25 % for the attractive one, above controls; a separate long-lived attractive component exists (Robinson et al. 2008, *Insectes Soc* 55:246). Both **unverified** (abstracts).
- **Contrary:** the repellent signal has not been replicated. Zanola, Czaczkes & Josens 2025 (*Commun Biol* 8:486, PMC11933468, full text, on the Argentine ant) note it is the only reported case in ants and that one replication study failed to find it (Troitiño 2017, an MSc thesis, not read).
- Long-lived trails: trails used 1,000–2,000 times could be found again after 24 h, 4,000–8,000 times after 48 h. Only 27.5 % of foragers detected 24-hour-old trails well ("pathfinders", antennae held low); detection rose in 57 % of foragers after 5 h without food (Jackson et al. 2006, *Anim Behav* 71:351). **Unverified** (abstract).
- A well-used trail "decays completely in about 10 min" (unpublished, cited by Beekman et al. 2001, **full text**); a half-life of about 9 min that depends strongly on the surface (Jeanson et al. 2003, *Physiol Entomol* 28:192, **not reached**, via a review). The numbers disagree.
- Trail forks tell direction: a wrong-way ant turns round at a fork, best near a 60° branch angle, and cannot at a symmetric 120° (Jackson et al. 2004, *Nature* 432:907). About 7 % of foragers often U-turn, and they lay much more trail (Hart & Jackson 2006, *Curr Biol* 16:R42). Both **unverified** (abstracts).

**In the game:** the generic ant already has food (attractive, short), home and "no entry" channels ([trails.md](trails.md), built on Robinson et al. 2005). This species adds a **long-lived attractive trail** that holds a route for a day or two, read best by hungry ants: a channel with a slow evaporation rate. If the home channel's parameters can carry it, it is **data**; if not, an optional channel (`ja-fnd.5.11`). Fork geometry and U-turners are steering (free), and are left out of the first build. Because the repellent signal is unreplicated, the species keeps "no entry" as the generic ant does, no stronger.

## 4. Food finding has a colony-size threshold

- Colonies of 600 or fewer ants failed to form a trail to a feeder 50 cm away; 700 or more did, with hysteresis; independent discovery was 0.0052 per ant a minute (Beekman, Sumpter & Ratnieks 2001, *PNAS* 98:9703, PMC55516), **full text**. Explorers lay attractive pheromone before any food is found (Fourcassié & Deneubourg 1994, cited there).

**In the game:** the generic trail rules (positive feedback with decay) should show this threshold without new code: an **assay**, not a mechanic. Explorers marking before a find is a response-hook change (`trail` on an empty-jawed ant), **data**.

## 5. Work by age, monomorphic and sterile workers

- Workers are monomorphic, about 2 mm long, with no ovaries; caste is set at the egg (Nagel et al. 2020; Rajakumar, Pontieri et al.), **full text**.
- Age-marked cohorts: nurses averaged 6.94 days old, foragers 13.04; the switch is at 9–12 days; 75 % of nursing was by workers under 10 days, 75 % of foraging by workers over 10 days (Mikheyev & Linksvayer 2015, *eLife* 4:e04775, PMC4383337), **full text**. Nurses specialise on young or old larvae (Warner et al. 2019, PMC6544314, full text).
- Workers live 9–10 weeks (Petersen-Braun 1973, cited in Schmidt et al. 2010); egg to adult takes 45 days (Rajakumar et al., full text).

**In the game:** age bands are already parameters (`ColonyParams.lifespan`, `youngShare`, `middleShare`, `ja-fnd.5.3.6`): a 9–10-week life with the switch at 9–12 days is **data**, scaled to game time as the generic ant's is.

## 6. Low aggression between colonies

- Despite very high genetic differentiation between colonies (F_ST = 0.751), nestmate discrimination is low: aggression in 23 % (21 of 91) of pairs between colonies, mean score 1.37 against 0.99 within a colony and 3.68 against *Monomorium destructor*; queens made no difference (Schmidt, d'Ettorre & Pedersen 2010, *Front Zool* 7:20, PMC2907370), **full text**. "Colonies can be combined or divided" (Sudd 1960, cited in Beekman et al. 2001).

**In the game:** wide tolerance, **data**, as for *L. neglectus*: the colonies of this species are near-allies from the start, so the unity goal is close.

## 7. The fungus: a colony chose to move in with sporulating corpses

- *Metarhizium brunneum* at 2 × 10⁸ conidia/ml killed 86 % of workers (n = 36) in 8 days. Given a choice of nests, colonies chose the one holding sporulating fungus-killed nestmates over one with freeze-killed nestmates 84 % of the time (26 against 5); infected against empty, 21 against 13 (P = 0.23); empty against freeze-killed, 24 against 14 (P = 0.14); 88 % of choices within 30 min. The authors suggest the colony seeks low-level exposure to immunise itself, untested; manipulation by the fungus is not ruled out (Pontieri et al. 2014, *PLoS ONE* 9:e111961, PMC4221154), **full text**.
- *Wolbachia* (a bacterium) in this species: infected queens lay more, infected workers live longer, colonies are more productive, no cost found (Singh et al. 2023, bioRxiv 10.1101/2023.01.31.526493, published *J Exp Biol* 2024; Pontieri et al. 2017, *J Evol Biol* 30:225). **Unverified** (abstracts).
- No grooming measurement, no *Beauveria* test and no corpse-handling study were found for this species; a 2023 review of fungi against pest ants does not mention it (Folgarait & Goffré 2023, *Front Fungal Biol* 4:1199110, PMC10598784, searched).

**In the game:** the one fungus result points the other way from every other host: sporulating corpses **attract** a moving colony. In game terms the fungus's odour (its own scent lever) draws an emigrating colony rather than repelling it: a sensed cue the nest-choice policy reads. **Design** beyond that one experiment. The rest of the fungus's counterplay (grooming, undertaking) is the generic ant's, unmeasured here.

## What was not found

- Queen lifespan; a field colony size from a primary source; Fowler's work on this species; corpse handling; grooming or any social-immunity measurement; *Beauveria*; an alarm pheromone; Jeanson et al. 2003's half-lives by surface.

## The mechanic

Cheapest first; every row's "off" is the generic ant (main bit for bit).

| Cue (sensed) | Sense row | Response | Local rule | Off | Tier |
|---|---|---|---|---|---|
| Stranger's odour | contact (CHC) | tolerate | wide tolerance | generic | 1 (data) |
| Short life, nursing to foraging at ~10 days | own body | — | age params | generic bands | 1 (data, built) |
| Long-lived route trail | trail pheromones | follow, hungry ants more | slow-decaying attractive channel | none | 1 (params) or 2 (`ja-fnd.5.11`) |
| Summed queen signal | queen pheromone | cull or rear gyne larvae | threshold at several queens' worth | one queen's signal | 2 (with `ja-8fd.1`) |
| Several queens; budding | queen pheromone | bud | as [lasius-neglectus](lasius-neglectus.md) | one queen | 3 (`ja-8fd.1`, `ja-fnd.5.5`) |
| Alarm, strangers or no food at home | alarm, contact, encounter rate | emigrate (new mode) | move brood when a disturbance cue persists | no emigration | 3 (a mode) |
| Sporulating corpses' odour | **design** (fungus scent) | prefer that site when moving | weight a site by fungal scent | none | 2 |

**Situation and lanes.** The mode lane is the generic ant's plus, once emigration exists, a fifth mode; its words describe the tolerant, many-queened colony. The stance lane stays. Own context, precache and cost line.

**What it forces on the code.** Nothing beyond *L. neglectus* except the **emigration mode** (the first time `MODES` grows) and possibly a long-lived trail channel. So it is the cheapest **third** consumer if *L. neglectus* comes second, and a near-duplicate of it otherwise.

**Assays** (land first, no behaviour change). P1: **the trail threshold**: colonies under about 600 ants fail to form a trail to a feeder at the game's equivalent of 50 cm, above 700 succeed (Beekman et al. 2001). P2: **age switch**: nursing to foraging at 9–12 days of scaled age (Mikheyev & Linksvayer 2015). P3: **queen signal**: gyne rearing falls only once several queens' worth of signal is present (Oliveira et al. 2020). P4: **emigration**: a disturbed colony moves nearly all brood within a game-day (Tay & Lee 2015, unverified).

**Cost (estimated from request size; not measured).** The generic shape: ~122 situations a game, ~783 tokens a question, ~$0.074/h while the doctrine is new, $0 cached; a fifth mode adds words to the legend (~5 % on request size) and no situation field. Live check for its precache: at most one full live run of all lanes (~$0.0065, PRD §54.4).

## Play

- **See:** small ants in long, stable lines that hold for a day; a colony that packs up its brood and moves when the fungus or a rival disturbs it; several nests of one colony. Learn: many queens and budding; the long trail.
- **Choose:** emigration gives the fungus a new handle: disturb a nest (alarm levers) and the colony moves, maybe toward the fungus's own scent (§7). A colony that can move is harder to pin down.
- **Counterplay and progression:** unmeasured social immunity (the generic ant's); tolerant neighbours make unity cheap. An early, friendly host, or a duplicate of *L. neglectus*, depending on the order.
- **Cost:** above; cached games spend nothing.
- **Risks:** **runaway emigration** (a colony that moves at every alarm never settles: watch nests per hour); a **free lever** in the lure (one scent drags a whole colony onto the fungus: gate by reach).
- **Owner decisions needed:** see Open questions.

## Open questions

Decided here (2026-11-12; the owner can overturn):
1. **Keep "no entry" at the generic ant's strength**, because the repellent signal is unreplicated.
2. **Emigration is a policy mode chosen on sensed disturbance**, not a scripted move.

For the owner:
3. Whether to build the Pharaoh ant at all once *L. neglectus* exists: it adds emigration and a long trail, not much else.
4. The fungus's levers on this host (the lure, §7).

Still to read (the hosts were blocked): Robinson et al. 2005 and 2008, Jackson et al. 2004 and 2006, Jeanson et al. 2003, Tay & Lee 2015; a field colony size.

## Sources

- Beekman M, Sumpter DJT, Ratnieks FLW (2001). Phase transition between disordered and ordered foraging in Pharaoh's ants. *PNAS* 98:9703–9706. [PMC55516](https://pmc.ncbi.nlm.nih.gov/articles/PMC55516/) (full text)
- Schmidt AM, d'Ettorre P, Pedersen JS (2010). Low levels of nestmate discrimination despite high genetic differentiation in the invasive pharaoh ant. *Front Zool* 7:20. [PMC2907370](https://pmc.ncbi.nlm.nih.gov/articles/PMC2907370/) (full text)
- Pontieri L et al. (2014), nest choice with fungus-killed nestmates. *PLoS ONE* 9:e111961. [PMC4221154](https://pmc.ncbi.nlm.nih.gov/articles/PMC4221154/) (full text; title not recorded)
- Mikheyev AS, Linksvayer TA (2015). Genes associated with ant social behavior show distinct transcriptional and evolutionary patterns. *eLife* 4:e04775. [PMC4383337](https://pmc.ncbi.nlm.nih.gov/articles/PMC4383337/) (full text)
- Warner MR, Mikheyev AS, Linksvayer TA (2019). *PLoS Genet* 15:e1008156. [PMC6544314](https://pmc.ncbi.nlm.nih.gov/articles/PMC6544314/) (full text)
- Nagel M et al. (2020). *Sci Adv* 6:eaaz5772. [PMC7494347](https://pmc.ncbi.nlm.nih.gov/articles/PMC7494347/) (full text, first 100k characters)
- Oliveira RC et al. (2020). Identification of a queen pheromone mediating the rearing of adult sexuals in the pharaoh ant. *Biol Lett* 16:20200348. [PMC7480160](https://pmc.ncbi.nlm.nih.gov/articles/PMC7480160/) (full text)
- Walsh J et al. (2020). *Proc R Soc B* 287:20201029. [PMC7341921](https://pmc.ncbi.nlm.nih.gov/articles/PMC7341921/) (full text)
- Li Q et al. (2022). *Nat Ecol Evol* 6:1191. [PMC9349048](https://pmc.ncbi.nlm.nih.gov/articles/PMC9349048/) (full text)
- Rajakumar A, Pontieri L, et al. *J Exp Zool B* 342:557. [PMC13001701](https://pmc.ncbi.nlm.nih.gov/articles/PMC13001701/) (full text)
- Baek HJ, Kim B (2026). *Anim Cells Syst* 30:394. [PMC13094243](https://pmc.ncbi.nlm.nih.gov/articles/PMC13094243/) (full text; used only for figures it cites from Buczkowski & Bennett 2009)
- Zanola D, Czaczkes TJ, Josens R (2025). *Commun Biol* 8:486. [PMC11933468](https://pmc.ncbi.nlm.nih.gov/articles/PMC11933468/) (full text; on the Argentine ant, for the non-replication of the repellent signal)
- Folgarait PJ, Goffré D (2023). *Front Fungal Biol* 4:1199110. [PMC10598784](https://pmc.ncbi.nlm.nih.gov/articles/PMC10598784/) (full text, searched)
- Robinson EJH, Jackson DE, Holcombe M, Ratnieks FLW (2005). "No entry" signal in ant foraging. *Nature* 438:442. [doi:10.1038/438442a](https://doi.org/10.1038/438442a) (abstract only)
- Robinson EJH, Green KE, Jenner EA, Holcombe M, Ratnieks FLW (2008). Decay rates of attractive and repellent pheromones in an ant foraging trail network. *Insectes Soc* 55:246–251. [doi:10.1007/s00040-008-0994-5](https://doi.org/10.1007/s00040-008-0994-5) (abstract only)
- Jackson DE, Martin SJ, Holcombe M, Ratnieks FLW (2006). Longevity and detection of persistent foraging trails in Pharaoh's ants. *Anim Behav* 71:351–359. [doi:10.1016/j.anbehav.2005.04.018](https://doi.org/10.1016/j.anbehav.2005.04.018) (abstract only)
- Jackson DE, Holcombe M, Ratnieks FLW (2004). Trail geometry gives polarity to ant foraging networks. *Nature* 432:907–909. [doi:10.1038/nature03105](https://doi.org/10.1038/nature03105) (abstract only)
- Hart AG, Jackson DE (2006). U-turns on ant pheromone trails. *Curr Biol* 16:R42–43. (abstract only)
- Jeanson R, Ratnieks FLW, Deneubourg J-L (2003). Pheromone trail decay rates on different substrates in the Pharaoh's ant. *Physiol Entomol* 28:192–198. [doi:10.1046/j.1365-3032.2003.00332.x](https://doi.org/10.1046/j.1365-3032.2003.00332.x) (not reached)
- Tay JW, Lee CY (2015). *J Econ Entomol* 108. [doi:10.1093/jee/tov079](https://doi.org/10.1093/jee/tov079) (abstract only)
- Warner MR, Lipponen J, Linksvayer TA (2018). *Behav Ecol Sociobiol* 72:13. [doi:10.1007/s00265-017-2430-1](https://doi.org/10.1007/s00265-017-2430-1) (abstract only)
- Buczkowski G, Bennett G (2009). *Ethology* 115:1091–1099. (abstract only)
