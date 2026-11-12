# Army ants (*Eciton*, *Dorylus*, and the lab model *Ooceraea biroi*): a nest of living workers on a brood clock, and raids that grow out of colony size

*Research note for the species epic `ja-ehuv` (PRD §64.6). Written 2026-11-12, against code at `f8afe17`. **Read in full text** (through PMC; long papers to the first 100,000 characters): Kronauer, Schöning, d'Ettorre & Boomsma 2010; Kronauer et al. 2007; Powell & Franks 2005; Lopes et al. 2023; Chandra, Gal & Kronauer 2021 (SI table not read); Ulrich et al. 2016; Alciatore et al. 2021; von Beeren et al. 2023. **Abstract or snippet only** (numbers **unverified**): Couzin & Franks 2003, Reid et al. 2015, Powell & Franks 2006, O'Donnell et al. 2018, Baudier et al. 2019, Baudier & O'Donnell 2016, Ravary & Jaisson 2002, Ravary et al. 2006, Schöning, Njagi & Franks 2005, Kunhart & Willson 2024, Willson et al. 2011, Rettenmeyer et al. 2011. **Not reached:** Powell & Franks 2007 (pothole plugging; press figures only), Franks & Hölldobler 1987, Torgerson & Akre 1970, Blum & Portocarrero 1964, Schneirla's primary phase data (only secondary figures). `pnas.org`, `www.ncbi.nlm.nih.gov` and several repositories were blocked from the session; `pmc.ncbi.nlm.nih.gov` was not. `ja-a2m` called this literature thin; it is, for *Eciton* in the field, and better than expected for *O. biroi* in the lab.*

The game's colony has a fixed dug nest, one queen, trails and individual foraging ([species.md](species.md)). The question: **what does an army-ant worker sense and do, and what in the game's colony survives a species with no fixed nest?** It is tier 3 by every measure.

## 1. The nest is the workers: a bivouac that moves

- *Eciton* digs no nest: the bivouac is built of living workers, a facultative endotherm (site choice plus metabolic heating); under cold conditions bivouacs holding pupae run warmer than those with larvae (Baudier et al. 2019, *Ecography* 42:730), **unverified** (abstract). A high-elevation subterranean bivouac was more than 6 °C above the soil beside it (Baudier & O'Donnell 2016, **unverified**).
- *Dorylus (Anomma) molestus* nests are "typically built in subterranean cavities" and "may contain several million individuals" (Kronauer et al. 2010, *Proc R Soc B* 277:755, PMC2842746), **full text**.
- Living bridges lengthen, widen and shift with traffic and terrain; they start where the path turns away from its incoming direction and drift to make shortcuts, but stop short of the shortest route because bridges take workers off foraging (Reid et al. 2015, *PNAS* 112:15113). **Unverified** (abstract).
- *Eciton* refuse deposits lie close to, often under, the bivouac; successive sites are tens of metres apart; they hold mostly prey fragments, with empty pupal cocoons late in the statary phase; 34 deposits from 13 colonies; no dead workers were described (von Beeren et al. 2023, *Ecol Evol* 13:e10451, PMC10509147), **full text**.

**In the game:** a bivouac is a **nest kind** with no dug cells: a cluster of ants that holds brood and moves. It is the clearest case for the nest-kind interface (`ja-fnd.5.5`) owning "where home is", since home moves. Bridges are ants as terrain (tier 3, **later**).

## 2. One flightless queen, colony fission, and fusion only when queenless

- *D. molestus*: one queen per colony, mated with 10–30 males. Of 18 nests opened and 10 queens taken, six queenless colonies fused with a neighbour 4–10 days later (mean 6.2 ± 2.39, n = 5; one at 43 days), which added about half to the colony's size; in 5 of 6 fusions the colonies were unrelated. One colony that did not fuse produced 31 males after 84 days, 24 of them from workers. Merging workers showed "indiscriminate acceptance of alien workers that are no longer aggressive", with odours intermediate within days; colonies with a queen do not mingle (Kronauer et al. 2010), **full text**. Already in [queens-and-merging](queens-and-merging.md) §2.
- Army-ant queens are "permanently wingless and highly specialized egg-layers" (Kronauer et al. 2007, *BMC Evol Biol* 7:56, PMC1852301), **full text**. Workers decide which queen founds the daughter colony at fission (Franks & Hölldobler 1987, *Biol J Linn Soc* 30:229, **not reached**).
- *O. biroi* has no queen at all: workers lay clonal diploid eggs together (Ulrich et al. 2016, PMC5015688), **full text**.

**In the game:** fusion of an orphaned colony into a neighbour is the merge route `queens-and-merging` §3.3 already plans, with a basis: the game's unity goal by another road. Fission is budding (`ja-8fd.1`) with the workers choosing the queen. A queenless clonal species (*O. biroi*) removes the fungus's queen levers entirely. Tier 3.

## 3. A brood clock sets the phase: raid and move, or sit and lay

- *Eciton* alternates a statary phase (about 20 days) with a nomadic phase (about 14–15 days), set by brood development; emigrations take 6–8 h, mostly at night (Schneirla; **secondary only**, primary not reached).
- *O. biroi*: a reproductive phase of about 3 weeks (eggs laid, no foraging) alternates with a brood-care phase of about 2 weeks (foraging). Without larvae, egg-laying starts within 4–7 days; larvae, not callow workers, drive the foraging phase; foraging rose with the ratio of larvae to workers (tested from 0 to 1) and fell with worker number; at ratios of 1/2 and 1 almost no worker had developed ovaries (Ulrich et al. 2016, **full text**; Ravary & Jaisson 2002, **unverified**).

**In the game:** the phase is **not a clock**: workers sense larvae (the brood row of the sense table, an encounter rate with hungry larvae: hunger by contact is built, PRD §50.18) and forage when there are many. A colony-wide phase emerges from that one local cue. This is the most important finding for the game's rule: the army ant's best-known "scripted" behaviour has a sensed basis. Emigration (moving the bivouac) is a mode (as the Pharaoh ant's, [pharaoh-ant §2](pharaoh-ant.md#2-nests-move-and-split-on-what-the-colony-senses)).

## 4. Raids grow out of colony size, with scouts at the front

- *O. biroi* colonies of 10, 20, 50, 100 and about 5,000 workers: from 50 workers on, columns formed without scouts leading; at about 5,000 workers raids showed mass-raid features (recruitment at the raid front in 43 of 47 cases, branching trails). Mass raiding emerges from colony size alone, with the same individual rules. A scout finds prey, runs home laying trail and releases a recruitment signal in the nest; recruits follow her outbound trail, and she did not lead the column in 30 of 31 raids; a barrier test (31 events) showed the nest signal is airborne. Dorylinae range from about 10⁴ to 10⁷ workers (Chandra, Gal & Kronauer 2021, *PNAS* 118:e2026534118, PMC8179172), **full text**.
- So "no scouts in *Eciton*" is too strong: mass raids keep a few scouts, recruiting at the front instead of at the nest (Chandra et al. 2021).
- *Dorylus* foraging is subterranean (ancestral, 5 of 6 subgenera), in leaf litter, or as surface swarm raids (*Anomma*) of "hundreds of thousands" of ants covering 1,000 m² or more a day (Kronauer et al. 2007, full text). *D. molestus* swarm raids average 10.3 ± 4.6 m wide; emigrations about 92.7 m, heading away from the nearest colony; nearest neighbours 82.1 ± 29.4 m apart (Schöning, Njagi & Franks 2005, **unverified**).
- Traffic forms three lanes, outbound outside and returning in the middle, from individual turning rates and local perception (Couzin & Franks 2003, *Proc R Soc B* 270:139, **unverified**; the lane count from press).

**In the game:** the generic ant's recruitment (trail laid home by a finder, `leave` on returns: [activation](activation.md)) is already the *O. biroi* small-colony rule. Mass raids at large size should **emerge** from the same rules plus front recruitment (a finder that meets nestmates on the trail recruits there): an assay first, a response change if it does not emerge. Lanes are steering. This is cheaper than expected.

## 5. Castes: porters and soldiers

- *E. burchellii* submajors (5.6–9.5 mg dry mass) are about 3 % of workers and carried non-ant prey in 100 %, 100 % and 79.2 % of samples in three colonies; teams, usually led by a submajor, carried 66–98 % of non-ant prey; about half the diet is ant prey; majors are a separate defensive caste (Powell & Franks 2005, *Proc R Soc B* 272:2173, PMC1559956), **full text**. Five *Eciton* species differ in whether they have submajors, explained by diet (Powell & Franks 2006, **unverified**). Soldiers have narrower behavioural repertoires (O'Donnell et al. 2018, *BMC Zool* 3:3, **unverified**).
- Pothole plugging: workers lie in holes in the trail and match body size to hole size, which speeds prey delivery (Powell & Franks 2007, **not reached**; press figures of "up to 26–30 %" more prey are **unverified**).

**In the game:** castes by size as in the leafcutter ([leafcutter §3](leafcutter.md#3-size-sets-the-task-minims-medias-majors)); team transport is new (several ants carrying one item) and **later**.

## 6. Signals

- *O. biroi*'s alarm pheromone is in the head: per head 3.21 µg of 4-methyl-3-heptanone (80 % of head volatiles) and 0.65 µg of 4-methyl-3-heptanol; a 90:10 blend at 260 µg made ants leave the nest pile and approach the source; at 2,600 µg they left the nest chamber and were not attracted; a crushed head triggered it, a headless body did not (Lopes et al. 2023, *J Chem Ecol* 49:1, PMC9941220), **full text**. (The repo cited the preprint; this is the published version.)
- The *Eciton* trail pheromone comes from the hindgut, probably also the pygidial gland (Blum & Portocarrero 1964; Torgerson & Akre 1970, **not reached**).

**In the game:** graded alarm (attract at low, repel at high) is the generic ant's alarm already ([combat.md](combat.md)): **data**.

## 7. Neighbours and the fungus

- *E. burchellii* turns raids away from areas recently raided by other colonies of its species, and colonies are spaced more evenly than random (Kunhart & Willson 2024, *Sociobiology* 71:e10104, **unverified**); colony-specific pheromones are "not necessarily repulsive" to other colonies (Willson et al. 2011, **unverified**).
- *O. biroi* exposed to live *Metarhizium robertsii*: 58.3 % of 120 ants died within 13 days, all confirmed infections. Exposed ants received 530 s of allogrooming per 10 min against 92 s for sham-treated ants at 0 h, and 106 against 7 s at 12 h. Ants given zymosan (an immune challenge without a pathogen) received 99–131 s against 26–30 s (p ≤ 0.027) and became more central in the contact network. No avoidance or exclusion was seen. Colonies: 16 workers (2 exposed, 2 sham, 12 naive) and 8 pupae (Alciatore et al. 2021, *Proc R Soc B* 288:20211456, PMC8424377), **full text**.
- No record of *Metarhizium*, *Beauveria* or *Ophiocordyceps* infecting *Eciton* or *Dorylus* in the field was found; *Laboulbenia ecitonis*, an ectoparasite that does not kill, is recorded on *Eciton* (review snippet, **not reached**).

**In the game:** the fungus meets a host that **draws in** the sick rather than shutting them out: about six times the grooming, and the exposed ant becomes more central. Spread through care is the fungus's road here, and the counter (grooming) is the same act. Avoiding a neighbour's old raid trail is a foreign-trail read the game has (`Game.#aimAt`), with a repellent answer: **data**.

## What was not found

- Field infection by entomopathogenic fungi in *Eciton* or *Dorylus*; necrophoresis (carrying dead workers out); corpse removal in *O. biroi*; Schneirla's primary phase lengths; Franks's raid-area data; what happens when two *Eciton* colonies meet on a trail.

## The mechanic

Tier 3: a moving nest kind, phases, raids. Cheapest first; "off" is the generic ant.

| Cue (sensed) | Sense row | Response | Local rule | Off | Tier |
|---|---|---|---|---|---|
| Graded alarm | alarm | approach or flee | existing | — | 0 (built) |
| Hungry larvae met | brood / hunger by contact | forage or stay | forage more as larvae per worker rise | generic | 1–2 (a policy answer over a sensed rate) |
| A nestmate's pathogen load | **sickness cues** | groom, draw close | groom up to ~6× more | generic grooming | 2 |
| Finder met on the trail | trail, encounter | recruit at the front | lay trail and recruit where nestmates are met | recruit at the nest | 2 (a response change, if raids don't emerge) |
| Neighbour's old raid trail | trail (foreign) | avoid | repel on a foreign raid trail | none | 1–2 |
| Few larvae, a long stay | brood | emigrate (move the bivouac) | move when the brood signal turns | fixed nest | 3 (a mode, `ja-fnd.4.4`) |
| Home is the cluster | **design** | cluster | ants hold together round the brood | dug nest | 3 (nest kind, `ja-fnd.5.5`) |

**Situation and lanes.** A lane of its own: the generic modes plus emigrate, perhaps a phase-felt field (larvae few, many: ×2); stance lane for raids. **What it forces on the code:** the nest kind with no dug cells (`ja-fnd.5.5`), emigration as a mode and the tick split to carry it (`ja-fnd.4.4`), and size-driven raids, which are mostly an assay of the existing rules.

**Assays** (land first). R1: **phases from brood**: foraging tracks larvae per worker (Ulrich et al. 2016), a colony-wide rhythm emerges. R2: **raids by size**: columns form from about 50 ants without a leader, front recruitment appears at large sizes (Chandra et al. 2021). R3: **grooming of the exposed** about 5–6 times sham (Alciatore et al. 2021).

**Cost (estimated from request size; not measured).** About the generic ant's mode lane (~$0.07/h while new) with one extra mode and maybe a ×2 field: up to ~$0.15/h new, $0 cached. A full new legend: live check ~$0.01.

## Play

- **See:** a swarm that moves its whole home every few days, raid fronts fanning across the ground, a cluster of bodies where a nest would be. Learn: the bivouac; phases from brood.
- **Choose:** the fungus spreads by being cared for; its timing against the phase matters (land in the statary phase, when the colony sits still and grooms).
- **Counterplay and progression:** heavy grooming that draws the sick in; a host that moves away from trouble. A late rung.
- **Cost:** above; cached games spend nothing.
- **Risks:** **scope** (the most structure of any ant: a moving nest); a **runaway** raid that strips the map; an **unreadable** colony if the phases don't show.
- **Owner decisions needed:** see Open questions.

## Open questions

Decided here (2026-11-12; the owner can overturn):
1. **Phases from sensed larvae, not a clock** (Ulrich et al. 2016).
2. **Raids by size are tested as an assay of the existing rules first**, before any new rule.
3. **Army ants last** among the candidates: the most structure and the least field data on fungi.

For the owner:
4. Whether to build army ants at all, and whether *Eciton* (a bivouac on the surface) or *O. biroi* (a lab ant: queenless, clonal, small) is the model; *O. biroi* has the measured fungus data, *Eciton* the spectacle.
5. The fungus's levers on this host.

Still to read: Powell & Franks 2007, Reid et al. 2015 and Couzin & Franks 2003 in full; Schneirla's primary data; Franks & Hölldobler 1987.

## Sources

- Kronauer DJC, Schöning C, d'Ettorre P, Boomsma JJ (2010). Colony fusion and worker reproduction after queen loss in army ants. *Proc R Soc B* 277:755–763. [PMC2842746](https://pmc.ncbi.nlm.nih.gov/articles/PMC2842746/) (full text)
- Kronauer DJC, Schöning C, Vilhelmsen LB, Boomsma JJ (2007). A molecular phylogeny of *Dorylus* army ants. *BMC Evol Biol* 7:56. [PMC1852301](https://pmc.ncbi.nlm.nih.gov/articles/PMC1852301/) (full text)
- Powell S, Franks NR (2005). Caste evolution and ecology: a special worker for novel prey. *Proc R Soc B* 272:2173–2180. [PMC1559956](https://pmc.ncbi.nlm.nih.gov/articles/PMC1559956/) (full text)
- Lopes LE, Frank ET, Kárpáti Z, Schmitt T, Kronauer DJC (2023). The alarm pheromone and alarm response of the clonal raider ant. *J Chem Ecol* 49:1–10. [PMC9941220](https://pmc.ncbi.nlm.nih.gov/articles/PMC9941220/) (full text)
- Chandra V, Gal A, Kronauer DJC (2021). Colony expansions underlie the evolution of army ant mass raiding. *PNAS* 118:e2026534118. [PMC8179172](https://pmc.ncbi.nlm.nih.gov/articles/PMC8179172/) (full text)
- Ulrich Y, Burns D, Libbrecht R, Kronauer DJC (2016). Ant larvae regulate worker foraging behavior and ovarian activity in a dose-dependent manner. *Behav Ecol Sociobiol* 70:1011. [PMC5015688](https://pmc.ncbi.nlm.nih.gov/articles/PMC5015688/) (full text)
- Alciatore G, Ugelvig LV, Frank E, Bidaux J, Gal A, Schmitt T, Kronauer DJC, Ulrich Y (2021). Immune challenges increase network centrality in a queenless ant. *Proc R Soc B* 288:20211456. [PMC8424377](https://pmc.ncbi.nlm.nih.gov/articles/PMC8424377/) (full text, first 100k characters)
- von Beeren C et al. (2023). *Ecol Evol* 13:e10451. [PMC10509147](https://pmc.ncbi.nlm.nih.gov/articles/PMC10509147/) (full text, first 100k characters)
- Couzin ID, Franks NR (2003). Self-organized lane formation and optimized traffic flow in army ants. *Proc R Soc B* 270:139–146. [doi:10.1098/rspb.2002.2210](https://doi.org/10.1098/rspb.2002.2210) (abstract only)
- Reid CR et al. (2015). Army ants dynamically adjust living bridges in response to a cost–benefit trade-off. *PNAS* 112:15113–15118. [doi:10.1073/pnas.1512241112](https://doi.org/10.1073/pnas.1512241112) (abstract only)
- Powell S, Franks NR (2007). How a few help all: living pothole plugs speed prey delivery in the army ant *Eciton burchellii*. *Anim Behav* 73:1067–1076. [doi:10.1016/j.anbehav.2006.11.005](https://doi.org/10.1016/j.anbehav.2006.11.005) (not reached; pages from memory)
- Powell S, Franks NR (2006). *Funct Ecol* 20:1105–1114. (abstract only)
- O'Donnell S, Bulova S, Barrett M, von Beeren C (2018). *BMC Zool* 3:3. [doi:10.1186/s40850-018-0028-3](https://doi.org/10.1186/s40850-018-0028-3) (abstract only)
- Baudier KM et al. (2019). *Ecography* 42:730–739. [doi:10.1111/ecog.04064](https://doi.org/10.1111/ecog.04064) (abstract only)
- Ravary F, Jaisson P (2002). *Insectes Soc* 49. [doi:10.1007/s00040-002-8288-9](https://doi.org/10.1007/s00040-002-8288-9) (abstract only)
- Kunhart A, Willson S (2024). *Sociobiology* 71:e10104. [doi:10.13102/sociobiology.v71i2.10104](https://doi.org/10.13102/sociobiology.v71i2.10104) (abstract only)
- Willson S et al. (2011). *Insectes Soc*. [doi:10.1007/s00040-011-0171-0](https://doi.org/10.1007/s00040-011-0171-0) (abstract only)
- Rettenmeyer CW, Rettenmeyer ME, Joseph J, Berghoff SM (2011). *Insectes Soc* 58:281–292. [doi:10.1007/s00040-010-0128-8](https://doi.org/10.1007/s00040-010-0128-8) (abstract only)
- Franks NR, Hölldobler B (1987). *Biol J Linn Soc* 30:229–243. (not reached)
