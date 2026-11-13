# Leafcutter ants (*Atta*, *Acromyrmex*): castes by size, a garden that talks back, and a quarantined midden

*Research note for the species epic `ja-vq14` (PRD §64.3). Written 2026-11-12, against code at `f8afe17`. **Read in full text:** Pielström & Roces 2014, Arenas & Roces 2017, Brown, Bot & Hart 2006, Armitage et al. 2016, Walker & Hughes 2009, Fernández-Marín et al. 2009, Heine et al. 2018 (for the long ones, the first 100,000 characters: the methods and results this note uses). **Abstract only** (their numbers are marked **unverified**): Kleineidam et al. 2001, Römer et al. 2018, Fjerdingstad et al. 1998, Bekkevold et al. 1999, Camargo et al. 2007, Tumlinson et al. 1971, Roces & Hölldobler 1996, Richard et al. 2007, Herz et al. 2008, Currie & Stuart 2001, Feener & Moss 1990, Hart & Ratnieks 2001 and 2002, Bot et al. 2001, Whitehouse & Jaffe 1996, Hughes, Eilenberg & Boomsma 2002, Hughes & Boomsma 2004, Hughes, Thomsen et al. 2004. **Not reached:** Wilson 1980 (the caste paper), Moser et al. 1968, Roces, Tautz & Hölldobler 1993, Markl 1973, Viana et al. 2001, Ridley et al. 1996, Poulsen et al. 2002, Currie et al. 1999. The research was done by a subagent with WebSearch and WebFetch; `www.ncbi.nlm.nih.gov`, `europepmc.org` and `core.ac.uk` were out of reach from the session, `pmc.ncbi.nlm.nih.gov/articles/PMC…` was not. Two citations in the repo's notes were corrected: PMC5992151 is Heine et al. 2018 (the chemistry of the ants' bacteria against* Escovopsis*), not a paper on caste-specialised defence; Herz et al. 2008 studied *Acromyrmex lundii*.*

The game has one ant: monomorphic, trail-laying, one queen, a dug nest with chambers and a midden, corpse removal, age bands young/middle/old ([species.md](species.md)). The question this note answers: **what does a leafcutter worker sense and do that the generic ant does not, and which of it can one policy over sensed state carry?** The answer tests the descriptor where the desert ant does not: a species with *more* structure (castes, a garden, a waste caste), where the desert ant has less.

## 1. The nest is built round the garden, and its waste goes elsewhere

- A mature *Atta laevigata* nest has up to 8,000 fungus chambers; the soil brought out covered 67.2 m²; one *A. sexdens* mound moved about 40 t of soil. Most *Atta* species build separate refuse chambers; vertical tunnels run below the garden chambers. Source: Pielström & Roces 2014 (*PLoS ONE* 9:e95658), full text, citing Moreira et al. 2004 and Autuori 1942 (those numbers are therefore second-hand, **unverified**).
- *A. vollenweideri* digs more readily in moister soil and stops about 12 mm short of standing water (Pielström & Roces 2014, full text). Small colonies close their openings when it rains, which raises CO₂ inside (the same paper, citing Kleineidam & Roces 2000).
- Wind draws air out of the central turrets and in through the outer openings, from any wind direction (Kleineidam, Ernst & Roces 2001, *Naturwissenschaften* 88:301). **Unverified** (abstract).
- *Acromyrmex lundii* removes more soil as CO₂ rises up to 7 % and stops at 11 % (Römer et al. 2018, *Insectes Soc* 65:305). *A. laevigata* places waste by temperature and humidity, not CO₂ (Römer et al. 2019). Both **unverified** (abstracts).

**In the game:** the garden is a **chamber role**, the leafcutter's equivalent of the generic ant's food store: leaves go in, the colony is fed from it. Chamber roles exist (`#roleFor`); a garden role whose stock is leaves, not food, is a tier‑2 data change to the nest. Separate refuse chambers are what the generic midden already is (`#middenSide`), placed inside rather than outside for *Atta cephalotes* (§5). Moisture and CO₂ as digging cues are in [entrances.md](entrances.md) already and stay out of this species' first build (**design**: they are nest senses every species could use).

## 2. One queen in *Atta*, sometimes several in *Acromyrmex*

- *A. colombica* is monogynous: no polygyny in more than 80 excavated young colonies (Fjerdingstad et al. 1998, **unverified**, abstract). Polygyny is reported for *A. texana*.
- *Acromyrmex echinatior*: 13 of 20 colonies had one queen and 5 had several, all mated and laying; the extra queens were adopted back after founding (Bekkevold, Frydenberg & Boomsma 1999, *Behav Ecol Sociobiol*). **Unverified** (abstract).
- Founding is claustral: the queen carries a pellet of the garden from her mother's nest. Three-month survival of founding queens was 0.09 % (*A. capiguara*) and 2.53 % (*A. sexdens*): snippet-level, source not identified, **unverified**. No primary figure for an *Atta* queen's lifespan was found.

**In the game:** *Atta* fits the generic ant's one queen with no new structure. A founding queen carrying garden (the new-queens flight, [new-queens.md](new-queens.md)) is a body rule: a daughter colony starts with a garden chamber stocked. *Acromyrmex* polygyny would need `queens[]` (`ja-8fd.1`), so **the game's leafcutter is modelled on *Atta*** (proposed, overturnable; §Open questions).

## 3. Size sets the task: minims, medias, majors

- *A. sexdens* workers span head widths from about 0.5 mm to over 4.5 mm. Size sets the task: the smallest (gardeners, about 0.8–1.0 mm) tend the garden and brood, medias cut and carry, majors defend. Source: Wilson 1980 (*Behav Ecol Sociobiol* 7:143–156; volume and pages from memory; not fetched). **Not reached**: the ranges come from citing papers, **unverified**.
- Age polyethism runs inside the size classes. *Acromyrmex subterraneus brunneus* (29 acts over 19 weeks): young workers do brood and garden work, old ones forage and handle waste. Mean longevity 108–123 days, small workers living longest (Camargo et al. 2007, *J Appl Entomol* 131:139). **Unverified** (abstract).
- The smallest workers ride on carried leaves (hitchhikers) and fend off parasitic phorid flies, more when flies are commoner (Feener & Moss 1990, *Behav Ecol Sociobiol* 26:17). **Unverified**, and limited: much hitchhiking is at night, when the phorids are not about.
- Defence is chosen by the threat. *A. laevigata* recruits majors against a vertebrate but mostly small workers against rival ants (Whitehouse & Jaffe 1996, *Anim Behav* 51:1207). **Unverified** (abstract).

**In the game:** size is **body**, set at birth (a per-ant `size` array, tier 2: a guarded allocation, nothing for the generic ant). What sets it must not read the colony's headcount (a scripted global read): a larva's size comes from what it was fed (the hunger-by-contact feeding it already gets, PRD §50.18) plus a draw from the species' size distribution, **design**. What a worker does stays the policy's choice, over a situation that now includes **its own size** (own body, an existing sense row). So caste is a situation field: three values (minim, media, major), which triples the leafcutter's mode-lane questions (§Cost). The alternative, a fixed task per size, is a scripted choice and is not proposed. Age still shifts the threshold within a size class, as `ja-k4k.1` plans for the generic ant.

## 4. Trails, alarm and stridulation: the generic channels plus a vibration

- The trail pheromone is methyl 4‑methylpyrrole‑2‑carboxylate (*A. texana*; Tumlinson et al. 1971, *Nature* 234:348, doi:10.1038/234348b0), also the most active trail compound in *Acromyrmex octospinosus*. **Unverified** (abstract).
- The alarm pheromone is 4‑methyl‑3‑heptanone (*A. texana*; Moser et al. 1968, *J Insect Physiol* 14:529), attracting at low and repelling at high concentration ([combat.md](combat.md), secondary). **Not reached.**
- Workers stridulate while cutting. Roces & Hölldobler 1996 (*Behav Ecol Sociobiol* 39, doi:10.1007/s002650050292) argue it recruits nestmates at close range; Tautz et al. 1995 argue it stiffens the leaf for the cut. **Unverified** (abstract); contested.

**In the game:** the generic food and alarm channels carry the first two with **data** (per-channel params). Stridulation is the vibration row of the sense table, "come here, dig here", at short range: a cutting ant raises a local vibration field that draws idle cutters, as a steering cue (free) rather than a situation field. It is the leafcutter's one new emitted signal; whether to build it in the first slice is open (it is contested).

## 5. Waste is handled by a separate, quarantined workforce

- *Atta colombica* keeps its heap outside: 88.8 % of workers outside forage and 0.2 % work the heap; waste transporters outnumber heap workers 55 to 1; foragers never become heap workers and heap workers were never seen to forage. Contact with waste raises mortality about 60 %, but task alone does not change it (P = 0.29). Source: Brown, Bot & Hart 2006 (*J Insect Sci* 6:18, PMC2990307), **full text**.
- *Atta cephalotes* keeps its heap inside: 94 % of waste loads go through a cache by the heap's entrance and only 3 % straight to the heap; heap workers rarely leave; ants carrying waste are attacked by nestmates (Hart & Ratnieks 2001, *Behav Ecol Sociobiol* 49:387). Outside heaps lie downhill of the entrances, and trails avoid them (Hart & Ratnieks 2002, *Behav Ecol* 13:224). Both **unverified** (abstracts).
- Waste carries the garden parasite *Escovopsis*; ants in contact with it die earlier; older workers take the risky waste tasks (Bot et al. 2001, *Ethol Ecol Evol* 13:225). **Unverified.**

**In the game:** the midden already exists. What is new is **a nestmate that smells of waste is pushed away** (a contact cue: waste odour on another ant, a `Touch` field in the response lane, or the existing rejection hook), and **a waste carrier does not go back to foraging** (a one-way switch: body, as age is). Both are tier 2. The relay through a cache is a chamber role, and is **not** in the first build. "Trails avoid the heap" falls out of a no-entry mark the heap gives off (the existing channel), **design**.

## 6. The garden tells the ants what harms it

- After leaves laced with a fungicide go into the garden, *Acromyrmex lundii* stops cutting that plant, starting about 10 h later and lasting at least 9 weeks; naive ants learn it from contact with the garden (Herz, Hölldobler & Roces 2008, *Behav Ecol* 19:575). **Unverified** (abstract).
- The avoidance can be learned at the dump alone: three hours in a waste chamber dropped acceptance of blackberry leaves from 0.51 to 0.22; acceptance of privet fell from 0.43 to 0.07; 35 % of labelled foragers visited the waste chamber; waste work rose to about 11 % of ants after unsuitable leaves, under 2 % after suitable ones; in the field, avoidance lasted 18–30 weeks. Source: Arenas & Roces 2017 (*PLoS ONE* 12:e0171388, PMC5342182), **full text**.
- The garden is also a source of the colony's odour: workers exposed to their own garden met less aggression on return (*Ac. octospinosus*; Richard, Poulsen et al. 2007, *Behav Ecol Sociobiol* 61:1637). **Unverified** (abstract). This is the basis of the fungus's existing garden levers ([fungus-policy](fungus-policy.md) W1, W2).

**In the game:** a **new sense**: the smell of a plant species that has harmed the garden, learned at the garden or the dump, carried for weeks. In game terms: a food item has a kind; a forager that reaches a kind its garden "rejects" leaves it. The cue (the plant's smell matched against what the garden or the dump smells of) is local and sensed. This is the leafcutter's most interesting rule for play (§Play) and its biggest. It needs food kinds on the map, which the game does not have. **Not in the first build**; its own bead.

## 7. Against *Metarhizium*: hard to infect, and harder with practice

- In Panama *Metarhizium* is abundant in the soil round leafcutter nests, yet "the vast majority" of ants collected were uninfected (Hughes, Thomsen et al. 2004, *J Invertebr Pathol* 85:46). **Unverified** (abstract).
- *Acromyrmex echinatior* exposed to *Metarhizium* get more allogrooming (p = 0.021), mostly from intermediate-sized workers (1.4–1.8 mm). Nests exposed before groom more (p = 0.042), and their freshly exposed ants survive better. 84 % of treated ants sporulated; a sporulating cadaver carries about 10⁶ conidia, a treated ant about 5 × 10³ (Walker & Hughes 2009, *Biol Lett* 5:446, PMC2781909), **full text**.
- *Atta* (no visible bacteria on the cuticle) grooms with its metapleural-gland secretion far more than *Acromyrmex* (which carries antibiotic-making *Pseudonocardia*) when challenged; heavy groomers average 123.6 gland-grooming events per 90 min, light ones 0.5; *Metarhizium* and *Escovopsis* draw the same response (p = 0.97); *Atta* spreads gland secretion on the garden and on nestmates too (Fernández-Marín et al. 2009, *Proc R Soc B* 276:2263, PMC2677613), **full text**.
- Exposed pupae: by 36 h, at least 75 % are thrown on the dump; pupae with their protective covering stripped are removed more; exposed pupae got 262 gland-grooming events an hour against 1 for controls; small workers do nearly all of it (Armitage et al. 2016, *J Anim Ecol* 85:1210, PMC6084299), **full text**.
- Group living cuts both ways: exposed *Acromyrmex* survive better among nestmates, and transmission falls as density rises (Hughes, Eilenberg & Boomsma 2002, *Proc R Soc B* 269:1811, PMC1691100). **Unverified** (abstract; the mortality figures were not reached).
- About half of *Ac. echinatior* nests in Panama carry *Escovopsis* (Heine et al. 2018, *Nat Commun* 9:2208, PMC5992151), full text.

**In the game:** this is the counterplay the fungus meets, and most of it is already a mechanic: grooming (`Fungus.step`), triggered by the pathogen cue (`ja-k4k.12`). New for this species: **grooming strength by size** (intermediates and minims groom; data per size class), **brood thrown on the dump after about 36 h of exposure** (an extension of the undertaking rule to brood, tier 2), and **a colony that has met the fungus grooms more** (a memory term; the generic ant would benefit from it too: `ja-k4k.12`). The leafcutter is the hardest host the game would have, which suits a later rung (§Play).

## What was not found

- A primary figure for an *Atta* queen's lifespan, a colony's worker count, or nest depth (hobbyist sites only).
- The share of leaves carrying hitchhikers; grooming rates per hour toward exposed *Atta* adults; Hughes et al. 2002's mortality numbers; Poulsen et al. 2002's metapleural-gland numbers; data from Markl 1973 and Roces et al. 1993.
- A number for "infected colonies put more workers on the midden". Hart et al. 2002 say it qualitatively; Arenas & Roces 2017 show more waste work after harmful leaves, not after infection.

## The mechanic

Cheapest first. Every row has an "off" that leaves main bit for bit (no species: the generic ant).

| Cue (sensed) | Sense row | Response | Local rule | Off | Tier |
|---|---|---|---|---|---|
| Own size | own body | the mode lane's situation (caste field, 3 values) | minims stay in and tend, medias go out and cut, majors answer alarm and strangers | no `size` array | 2 (schema, `ja-fnd.5.10`) |
| Garden as the store | brood / floor marks | carry leaves to the garden; feed from it | the existing store rule, with leaves as the food | food store | 2 (a chamber role) |
| Waste odour on a nestmate | contact (CHC) | reject | push away a nestmate that carried waste | no waste odour | 2 |
| Exposed brood | contact (pathogen cue) | carry to the dump | an exposed pupa older than ~36 h goes to the midden | no brood removal | 2 |
| Cutting vibration | vibration | steering of idle cutters | climb the vibration within a short range | none | 2 (a field) |
| A plant that harmed the garden | **new row** (§6) | leave that food kind | learned from the garden or the dump, held for weeks | no food kinds | 3 (food kinds on the map) |

**Situation and lanes.** The leafcutter's mode lane is the generic lane plus `caste` (×3). It keeps the stance lane (it defends a territory, §3). Its words say what a minim, a media and a major are for. Its own context, precache and cost line.

**What it forces on the code.** Per-species situation schemas (`ja-fnd.5.10`) with a field the generic ant does not have; a per-ant body array allocated only for this species (tier 2 in species.md); a chamber role the generic nest lacks (the nest-kind interface, `ja-fnd.5.5`, owns chamber roles); undertaking widened from a boolean to "what goes to the midden" (adults, brood, waste carriers: species.md said the boolean is the first thing a second species outgrows). No tick split.

**Assays** (land first, no behaviour change). L1: **division of labour by size**: with the caste field on, minims are inside and majors outside at a ratio set by the note's ranges (target: the share of each size class doing each task, qualitative from Wilson 1980 until it is read). L2: **waste work is one-way**: no waste carrier becomes a forager (target: Brown et al. 2006, 0 transitions). L3: **exposed brood is removed**: at least 75 % of exposed pupae on the midden by 36 h (Armitage et al. 2016). L4: **the garden is fed**: leaves cut equal leaves stored within a margin, so the colony grows.

**Cost (estimated from request size; not measured, no paid run).** The generic mode lane on one world asks about 122 distinct situations a game, ~783 tokens a question, ~$0.074/h (PRD §51, `colony-cost --one`). A caste field of three values can at most triple the distinct situations; if minims rarely leave the nest, fewer. Estimate: 250–370 situations a game, ~$0.15–0.22/h while a doctrine is new, $0 once cached. A live check to ship its precache: about three times a generic mode-lane check; a full live run of all lanes was ~$0.0065 (PRD §54.4), so under about $0.02. Measured with `npm run colony-cost` once its legend exists (the species-row bead's acceptance).

## Play

- **See:** columns of ants carrying green leaves; big-headed majors standing at the trail's edges when strangers come; minims riding on leaves; a midden with its own few workers, and leaf-carriers that turn aside from a plant the colony has learned to hate. The Learn drawer needs an entry: castes by size; the garden; the midden's workers.
- **Choose:** the fungus's existing garden levers (W1 shared garden, W2 garden scent: [fungus-policy](fungus-policy.md) §4) finally have a host where the garden is real. A new choice: **whom to land on**. Minims groom and handle brood; majors fight and rarely groom; a landing on majors spreads by fighting, on minims it meets the grooming wall.
- **Counterplay and progression:** the hardest host: heavy grooming that strengthens after a first exposure, exposed brood thrown out within a day and a half, waste carriers quarantined. A later rung, after the player has learned on easier hosts.
- **Cost:** above; cached games spend nothing.
- **Risks:** an **invisible caste** (sizes must be drawn; a caste no one sees is a number); a **cliff** of rejection (once the colony is "immunised" nothing takes: watch time to first host over seeds); **runaway famine** if the garden starves because a lever stops cutting; **cost creep** from the caste field (a separate lane, so the generic ant's cache is not touched).
- **Owner decisions needed:** see Open questions.

## Open questions

Decided here (2026-11-12; the owner can overturn):
1. **Model it on *Atta*** (one queen, as the generic nest; *Acromyrmex* would need `queens[]`), borrowing *Acromyrmex* immunity numbers and labelling them so.
2. **Caste as a situation field, not a fixed task per size**: a fixed task is a scripted choice.
3. **Plant-quality learning is its own late bead**: it needs food kinds on the map.

For the owner:
4. ~~Whether the leafcutter comes before or after *Lasius neglectus*~~ **Owner (2026-11-12): third, after *L. neglectus*** (PRD §64).
5. The fungus's levers on this host (the owner is asked when the species is built, as for the desert ant, `ja-rf5.7`).
6. Whether stridulation is built (its function is contested).

Still to read: Wilson 1980 (the size–task curves), Hughes et al. 2002 full text (mortality), Hart & Ratnieks 2001 and 2002 full text, Camargo et al. 2007, Moser et al. 1968.

## Sources

- Pielström S, Roces F (2014). Soil moisture and excavation behaviour in the Chaco leaf-cutting ant (*Atta vollenweideri*). *PLoS ONE* 9:e95658. [PMC3991694](https://pmc.ncbi.nlm.nih.gov/articles/PMC3991694/) (full text)
- Arenas A, Roces F (2017). Avoidance of plants unsuitable for the symbiotic fungus in leaf-cutting ants: learning can take place entirely at the colony dump. *PLoS ONE* 12:e0171388. [PMC5342182](https://pmc.ncbi.nlm.nih.gov/articles/PMC5342182/) (full text)
- Brown MJF, Bot ANM, Hart AG (2006). Mortality rates and division of labor in the leaf-cutting ant, *Atta colombica*. *J Insect Sci* 6:18. [PMC2990307](https://pmc.ncbi.nlm.nih.gov/articles/PMC2990307/) (full text)
- Armitage SAO, Fernández-Marín H, Boomsma JJ, Wcislo WT (2016). Slowing them down will make them lose: a role for attine ant crop fungus in defending pupae against infections? *J Anim Ecol* 85:1210–1221. [PMC6084299](https://pmc.ncbi.nlm.nih.gov/articles/PMC6084299/) (full text, first 100k characters)
- Walker TN, Hughes WOH (2009). Adaptive social immunity in leaf-cutting ants. *Biol Lett* 5:446–448. [PMC2781909](https://pmc.ncbi.nlm.nih.gov/articles/PMC2781909/) (full text)
- Fernández-Marín H et al. (2009). Reduced biological control and enhanced chemical pest management in the evolution of fungus farming in ants. *Proc R Soc B* 276:2263–2269. [PMC2677613](https://pmc.ncbi.nlm.nih.gov/articles/PMC2677613/) (full text)
- Heine D et al. (2018). Chemical warfare between leafcutter ant symbionts and a co-evolved pathogen. *Nat Commun* 9:2208. [PMC5992151](https://pmc.ncbi.nlm.nih.gov/articles/PMC5992151/) (full text, first 100k characters)
- Hughes WOH, Eilenberg J, Boomsma JJ (2002). Trade-offs in group living: transmission and disease resistance in leaf-cutting ants. *Proc R Soc B* 269:1811–1819. [PMC1691100](https://pmc.ncbi.nlm.nih.gov/articles/PMC1691100/) (abstract only)
- Hughes WOH, Boomsma JJ (2004). Let your enemy do the work: within-host interactions between two fungal parasites of leaf-cutting ants. *Proc R Soc B* 271:S104. [PMC1809977](https://pmc.ncbi.nlm.nih.gov/articles/PMC1809977/) (abstract only)
- Kleineidam C, Ernst R, Roces F (2001). Wind-induced ventilation of the giant nests of the leaf-cutting ant *Atta vollenweideri*. *Naturwissenschaften* 88:301–305. [doi:10.1007/s001140100235](https://doi.org/10.1007/s001140100235) (abstract only)
- Römer D et al. (2018). Carbon dioxide sensing in an obligate insect-fungus symbiosis: CO₂ preferences of leaf-cutting ants to rear their mutualistic fungus. *Insectes Soc* 65:305–313. [doi:10.1007/s00040-018-0615-x](https://doi.org/10.1007/s00040-018-0615-x) (abstract only)
- Tumlinson JH et al. (1971). Identification of the trail pheromone of a leaf-cutting ant, *Atta texana*. *Nature* 234:348–349. [doi:10.1038/234348b0](https://doi.org/10.1038/234348b0) (abstract only)
- Roces F, Hölldobler B (1996). Use of stridulation in foraging leaf-cutting ants: mechanical support during cutting or short-range recruitment signal? *Behav Ecol Sociobiol* 39:293–299. [doi:10.1007/s002650050292](https://doi.org/10.1007/s002650050292) (abstract only)
- Richard F-J, Poulsen M, et al. (2007). The origin of the chemical profiles of fungal symbionts and their significance for nestmate recognition in *Acromyrmex* leaf-cutting ants. *Behav Ecol Sociobiol* 61:1637–1649. [doi:10.1007/s00265-007-0395-1](https://doi.org/10.1007/s00265-007-0395-1) (abstract only)
- Herz H, Hölldobler B, Roces F (2008). Delayed rejection in a leaf-cutting ant after foraging on plants unsuitable for the symbiotic fungus. *Behav Ecol* 19:575–582. (abstract only)
- Currie CR, Stuart AE (2001). Weeding and grooming of pathogens in agriculture by ants. *Proc R Soc B* 268:1033–1039. [doi:10.1098/rspb.2001.1605](https://doi.org/10.1098/rspb.2001.1605) (abstract only)
- Hart AG, Ratnieks FLW (2001). Task partitioning, division of labour and nest compartmentalisation collectively isolate hazardous waste in the leafcutting ant *Atta cephalotes*. *Behav Ecol Sociobiol* 49:387–392. (abstract only)
- Hart AG, Ratnieks FLW (2002). Waste management in the leaf-cutting ant *Atta colombica*. *Behav Ecol* 13:224–231. (abstract only)
- Bot ANM et al. (2001). Waste management in leaf-cutting ants. *Ethol Ecol Evol* 13:225–237. (abstract only)
- Whitehouse MEA, Jaffe K (1996). Ant wars: combat strategies, territory and nest defence in the leaf-cutting ant *Atta laevigata*. *Anim Behav* 51:1207–1217. (abstract only)
- Feener DH, Moss KAG (1990). Defense against parasites by hitchhikers in leaf-cutting ants: a quantitative assessment. *Behav Ecol Sociobiol* 26:17–29. (abstract only)
- Camargo RS et al. (2007). Age polyethism in the leaf-cutting ant *Acromyrmex subterraneus brunneus*. *J Appl Entomol* 131:139–145. (abstract only)
- Hughes WOH, Thomsen L, Eilenberg J, Boomsma JJ (2004). Diversity of entomopathogenic fungi near leaf-cutting ant nests in a neotropical forest. *J Invertebr Pathol* 85:46–53. (abstract only)
- Bekkevold D, Frydenberg J, Boomsma JJ (1999). Multiple mating and facultative polygyny in the Panamanian leafcutter ant *Acromyrmex echinatior*. *Behav Ecol Sociobiol* 46:103–109. (abstract only)
- Wilson EO (1980). Caste and division of labor in leaf-cutter ants (Hymenoptera: Formicidae: *Atta*). I. The overall pattern in *A. sexdens*. *Behav Ecol Sociobiol* 7:143–156. (not reached; volume and pages from memory)
