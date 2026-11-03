# Zones in the nest: how ants make them, and the chemistry it takes

*Part of the [research notes](README.md) behind the [vision](vision.md).*

*Research note, 2026-11-03 (bead `ja-k4k.9`). Sources are primary papers, reviews and bibliographic records found by web search. Most full texts could not be opened from the research session, so details come from abstracts, records and citing papers; anything known only from a citing paper or a summary is marked **unverified** or *(secondary)*. Code references are to `web/src/colony/` at commit `b2d381a`.*

The owner asked: *what would get us closer to a policy grounded in perception that still gives the nest its dedicated zones?* It may take new chemical markers, or more resolution in the ones we have.

Today the zones are scripted:
- **A chamber's role** is written once, when it is started, from its depth relative to the royal chamber (`#roleFor`).
- **Workers' jobs** come from age bands (`band`, `#digs`, `#staysIn`).
- **Porters and nurses** read every chamber's needs (`#wanted`, `#nurse`).

The biology says zones are made another way: by **where things are put down**, by **where workers choose to be**, and by **smells that come from the things themselves**.

## TL;DR

| Mechanism | Biology | Game today | What it suggests |
|---|---|---|---|
| Sorting by picking up and putting down | Corpse piles and brood rings form from local pick-up and put-down rules (§1) | Roles are written into the chamber table | A zone is where items of one kind pile up. A chamber's "role" is a readout, not an input. |
| Templates | Brood is carried away from the entrance; the queen and brood draw workers; food comes in at the top (§2) | Depth rules in `#roleFor` | Entrance odour, gravity, queen odour and encounter rate place the piles |
| Spatial fidelity | Age changes *where* a worker sits; the task follows from where it is (§3) | Age thresholds pick the task | Age shifts attraction. The stimulus met decides the work. |
| Building scent | A pheromone added to building material, whose lifetime shapes the nest (§4) | `crowded()` compares colony floor per ant | Dig by local crowding, brood odour and fresh building scent |
| The dead | Corpses are carried out when the chemicals of *life* fade, not when a death cue appears (§5) | Undertakers know every corpse within two cells | A body whose life odour has faded is refuse. This closes the vision's "corpse odour not yet researched" gap for one species. |
| Task signature on the body | Cuticular hydrocarbons differ by task, are shifted by the work environment, and are read on contact (§6) | No per-ant task signal | Contact counters by the signature of whom an ant met |
| Brood signals | Brood secretions draw care; brood differs chemically by stage; hungry larvae beg by movement (§7) | Nurses see every brood chamber's count | Brood odour by stage; hunger as a short-range signal |
| Disease | Pathogen exposure makes a colony *more* segregated (§8) | Not modelled | Zones are a defence the fungus has to work through |

## 1. Zones come from sorting

**Corpse piles.** In *Messor sanctus* (often written *M. sancta*), workers gather corpses into regularly spaced piles. Theraulaz et al. (PNAS 2002) showed that the clustering is self-organised: a model with **local activation and long-range inhibition** reproduces it. Press coverage called it the first clear Turing pattern in a society of animals *(secondary)*.

**The pick-up / put-down rule.** The model usually cited is Deneubourg et al. (1991):
- the chance to **pick up** an item is (k₁ / (k₁ + f))²;
- the chance to **put one down** is (f / (k₂ + f))²;
- f is the share of similar items the ant has perceived over its last few steps.

So isolated items are picked up and items are dropped where their kind is dense. The formulas are known here only from papers that describe the model (**unverified** against the original). One citing paper (Melhuish and colleagues) reports evidence that real ants use brood density when *picking up* a brood item but not when *putting it down* *(secondary)*.

**Brood rings.** Franks & Sendova-Franks (*Behav Ecol Sociobiol* 30:109, 1992) studied *Temnothorax* (then *Leptothorax*) *unifasciatus*, which keeps its brood in one cluster on a flat floor.
- The brood stages lie in concentric bands, with successively larger larvae farther from the centre.
- They suggest each item gets a "domain of care" in proportion to its needs: the area round each item correlated with its estimated metabolic rate.
- After moving to a new nest, colonies **rapidly recreate** the pattern.

These details come from the bibliographic record and citing papers.

**Two phases.** Sendova-Franks et al. (*Anim Behav* 2004) re-examined the sorting:
1. **Clustering:** ants carry brood *away from the nest entrance*.
2. **Spacing:** ants move items in random directions. Smaller items are carried longer, consistent with ants putting items down as a function of their weight.

The authors also suggested that pheromones from the brood, spreading over fairly predictable distances, could be the cue.

**For the game:**
- Make picking up and putting down responses to what the ant smells *here*, compared with what it carries.
- Drop `Chamber.role` as an input. A chamber's role becomes the dominant smell of what lies in it, read off for drawing and for the assays.
- A brood chamber is then wherever brood has piled; a store is wherever food has.

## 2. Templates: where each zone forms

Sorting alone makes piles, but anywhere. These cues set where each pile goes:
- **Away from the entrance.** The clustering phase carries brood away from the entrance (Sendova-Franks et al. 2004). In *Temnothorax crassispinus*, after a forced move into a three-chamber nest, brood was mostly put farther from the entrance (known only from a machine-written video abstract: *secondary*, **unverified**).
- **To the queen.** Queen pheromone draws workers, and workers carry brood to her ([nest-and-home §1](nest-and-home.md#the-queen)).
- **Food in at the top.** Harvester foragers drop seeds only in the top chambers, and others carry them deep ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs)).
- **Depth for temperature.** Brood is moved up and down to the best temperature (*P. salinus*, [nest-and-home](nest-and-home.md#places-with-jobs)). The game has no soil temperature yet.
- **Not CO₂**, and **brood templates digging** ([nest-and-home: nest structure](nest-and-home.md#nest-structure)).

**For the game:** entrance odour, gravity and queen odour are already senses. With them, brood piles near the queen and away from the entrance, and food piles where foragers first meet nestmates to unload to. The depth rules in `#roleFor` become unnecessary.

## 3. Who works where: spatial fidelity, not an age clock

**Spatial fidelity.** Mersch, Crespi & Keller (*Science* 340:1090, 2013) tracked every worker in six *Camponotus fellah* colonies for 41 days: 2.4 billion positions and 9.4 million interactions.
- The interaction network splits into **three groups** with different behaviour: roughly nurses, cleaners and foragers.
- Interactions are far more frequent within a group than between groups.
- Workers move from one group to the next as they age.
- The network is shaped mainly by **age-driven changes in where workers are** in the nest.
- The link with age is loose. In Mersch's words: "You can find very old nurses and very young foragers" (Nature news, *secondary*).
- Cleaners range more widely and meet both other groups.

**Foraging for work.** Tofts & Franks (1992) and Tofts (1993) argued that a correlation between age and task can arise from simple rules plus a **spatial layout of tasks in the nest**, with nothing causally tying age to behaviour. A worker does a task until its stimulus falls below threshold, then moves on to look for work. Known here through the papers that cite it: Robinson, Feinerman & Franks (2009) and Richardson et al. (2011). Robson & Beshers (1997) challenged it.
- **Richardson et al. (PLoS ONE 2011)** added space to the fixed-threshold model. They found that the uneven spatial distribution of workers can itself come from stigmergic (indirect) interactions.
- **Robinson, Feinerman & Franks (2009)**, in *Temnothorax*: when more foragers were needed, the **leaner** ants took on the extra foraging, regardless of age, earlier activity or where they were in the nest. That supports a threshold set by the body.

**For the game:**
- Age stays physiology. It shifts *where an ant is drawn to*: its pull toward queen and brood odour weakens as it ages.
- What the ant does comes from the stimulus it meets there: hungry brood, food lying in the open, a crowd, foragers coming home.
- **Fat reserves** (or how full the crop is) are a body sense that can lower the threshold for going out.
- This is the sensed route for `ja-k4k.1`. It also predicts that **if the foragers die, younger workers drift outward to replace them**, with nothing scripted.

## 4. Building scent

Khuong et al. (PNAS 113:1303, 2016), in *Lasius niger*:
- Ants add a **pheromone to the building material**.
- Because the pheromone decays, it is unevenly present on what has been built. That uneven chemical landscape decides where building concentrates.
- In their 3D model, **the pheromone's lifetime is among the most influential parameters** for the nest's growth and form.
- A second rule is a template: ants use their own body size to decide the height at which to start a roof.
- The model reproduces regularly spaced pillars, caps forming and merging over them, and remodelling.

The lifetime values used are **unverified** (full text at PMC4747701).

**For the game:**
- Dig, or put soil down, where building scent is fresh.
- Combine that with local crowding (an ant's own encounter rate) and brood odour as the template. This replaces `crowded()`, which reads the colony's total floor per ant.
- The scent's lifetime is the parameter to tune against the depth profile (Tschinkel) and the floor per worker (*Odontomachus*).

## 5. The dead: the smell of life fades

Choe, Millar & Rust (PNAS 106:8251, 2009), in the Argentine ant *Linepithema humile*:
- Undertaking is triggered by the **fading of chemicals associated with life**, not by the build-up of a death cue.
- The "signals of life" are **dolichodial and iridomyrmecin**.
- Extract from ants dead about an hour, put on **living pupae**, got those pupae carried to the refuse pile. Extract from freshly killed ants did not.
- The authors say this corrects a misreading of earlier results, which had looked for a death cue.

**For the game:**
- Each ant carries a **life odour** while alive. After death it fades over a time constant, and a body below a threshold is refuse.
- That gives undertakers a sensed cue, contact or very short range, in place of a corpse flag.
- The midden becomes a pile made by the §1 rule (Theraulaz's corpse piles) and placed by a template: away from the entrance, outside the cleared ground.
- **A fungus lever with a basis:** dampen a living host's life odour and its nestmates carry it out. Keep a corpse's life odour up and it lies unburied.

This is one species. Write it into the vision's sense table as researched for *L. humile*, and look for other genera before relying on the timing.

## 6. A task signature on the body

- **Wagner et al. (1998)**, *Pogonomyrmex barbatus*: task groups differ in the relative proportions of classes of cuticular hydrocarbons, and in single compounds.
- **Wagner, Tissot & Gordon (*J Chem Ecol* 27:1805, 2001)**: the **task's environment alters** the hydrocarbon profile. Work outside shifts it (title and citing papers; mechanism details **unverified**).
- **Greene & Gordon (*Nature* 423:32, 2003)**: workers recognise the task of an ant they meet from its task-specific hydrocarbons. Beads coated with patroller hydrocarbons, dropped into the nest at a steady rate, restored foraging. The authors note that the response is not a simple reaction to the extract alone; the *rate* of encounters matters.

This joins the encounter-rate channel already in the sense table (Gordon; [ant-communication §1](ant-communication.md#1-how-many-channels)).

**For the game:**
- Each ant has an **outdoor signature**, a number that rises while it is outside and slowly fades inside. Others read it on contact.
- Each ant keeps decaying **contact counts by signature**: met many foragers with food, met many inside workers, met strangers.
- These drive forager activation (assay A5), local crowding (§4), recruitment to carrying, and later the stance (`ja-k4k.6`), with no colony-wide count.

## 7. Brood signals: stage and hunger

- **Brood draws care.** In *Solenopsis saevissima*, workers' care of immatures appeared to depend on secretions from the brood (Glancey et al., *Nature* 1970).
- **Brood differs by stage.** In *S. invicta*, brood surface hydrocarbons differ by stage (n-heptacosane separates them), but bioassays suggest these lipids are not the main recognition cue (via search summaries of the literature reviewed by Schultner & Pulliainen; **unverified**).
- **Review.** Schultner & Pulliainen (2020), *Brood recognition and discrimination in ants*, covers how brood transmit stage and identity.
- **Hunger.** In *Gnamptogenys striatula*, larvae starved for 24 h "sway" and "stretch". Hungry larvae do this more, so the begging is an honest signal of need (Kaptein, Billen & Gobin, *Anim Behav* 69:293, 2005; known from citing papers, **unverified**).
- **A volatile hunger signal is a honeybee result.** Starving honeybee larvae make more **E-β-ocimene**, which draws workers to inspect them (He et al., *Sci Rep* 2016). The brood ester pheromone is also a honeybee signal. Some search summaries attribute both to fire ants; that is a mix-up.

**For the game:**
- **Brood odour by stage** (eggs, larvae, pupae) is grounded. It drives sorting by stage (§1) and digging toward brood.
- **Larval hunger is grounded only as a short-range signal** (movement, contact). Model it as reaching a cell or two, like today's nurses who feed within two cells, not as a field that spreads through the nest.

## 8. Disease and segregation

Stroeymeyt et al. (*Science* 362:941, 2018) exposed *Lasius niger* to the fungal pathogen *Metarhizium brunneum*:
- The colony's contact network already **inhibits transmission** and keeps the valuable individuals (the queen, brood and young workers) away from likely sources of infection.
- After exposure, exposed workers and their untreated nestmates both change behaviour early. **Spatial and social segregation increases**, and transmission falls.

The details of which groups moved are known only from abstracts (**unverified**).

**For the fungus:** zones are an immune defence. A fungus that blurs the odours that make the zones (§1–§7) would weaken that defence, and a colony that tightens its zones when it meets infection would be resisting. That only works if the zones come from the senses.

## 9. What it means for the game

### Three kinds of chemistry

| Kind | Where the smell lives | Engine cost | Examples |
|---|---|---|---|
| **Laid** | a floor field per colony (`Pheromones`) | A channel that spreads cost 10–14 % of a tick (PRD §32); floor marks that don't spread are cheap | trails, alarm, road signs, building scent (§4), entrance odour |
| **Given off by things** | worked out from the items lying nearby; no grid | about zero: read from counts the game already keeps | brood by stage (§7), food in store, the queen, corpses (§5) |
| **Carried on bodies** | a few numbers per ant, read on contact | about zero | colony odour (`recognition.ts`), outdoor signature (§6), life odour (§5), crop, infection |

A smell given off by an item moves the moment the item does. A label on a floor lingers. So zones made from item odours re-form when brood or food is moved, as *Temnothorax* re-forms its brood rings after a move (§1).

### Senses this note grounds

| Sense | Kind | Range | Section |
|---|---|---|---|
| Brood odour, by stage | given off | local, a few cells | §1, §7 |
| Larval hunger | given off | contact, a cell or two | §7 |
| Food odour (stored food) | given off | local | §2 |
| Building scent | laid on dug soil, decaying | local | §4 |
| Life odour, fading after death | carried | contact | §5 (*L. humile*) |
| Outdoor (task) signature, and contact counts by signature | carried; counts kept per ant | contact; a rate over seconds to minutes | §6 |
| Fat reserve or crop fill | own body | internal | §3 |

The [vision](vision.md#what-an-ant-can-sense) carries these as rows of the sense table.

### Resolution

- **Steering reads raw values:** gradients, left against right, and ratios between channels, at full float resolution.
- **The situation can be richer than today's.** The owner judged on 2026-11-03 that Jev cost is not the binding constraint, since few situations are met (PRD §39: 113 of 3,888 in a game) and answers are cached per doctrine. The binding constraints are now:
  - whether Jev's answers keep the colony working (PRD §42.4: replayed mode answers cut food home by 42 %);
  - ants running the local rule while a new situation awaits its answer;
  - tick time for any new floor field.
- **Relational fields still read well:** which odour dominates here, whether it matches what the ant carries, whether the smell being followed is getting stronger. A model can answer these more reliably than raw levels.
- **A chamber is a blend.** Floor chemistry differs by chamber (Heyman et al. 2017, [nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs)). Rather than five role marks, keep a few elementary odours (queen, brood by stage, food, the dead, outdoor, colony) and let a chamber's identity be its mixture. A new kind of zone, such as a fungus garden, is then a new blend, not a new channel. The fungus's per-channel gains act on real components.
- **Adaptation** (reading each channel against the ant's own recent baseline) is a modelling device. This note has no source for it in ants; write one before it becomes a sense.

### Measuring zones

Assays to add before any label is removed (`experiment.ts`), each run next to today's scripted zones in shadow until they agree on seeds 1–10:
- **Segregation:** the share of brood, food and corpses lying in chambers where their own kind dominates.
- **Contact modularity:** contacts within the nurse, cleaner and forager groups against contacts between them (Mersch et al. 2013).
- **Re-sorting:** move a colony into an empty nest; the zones re-form (Franks & Sendova-Franks 1992).
- **Replacement:** remove the foragers; younger workers move outward (the prediction of §3; no measured target from a paper yet).

### Order of work

1. Item odours (brood by stage, food, queen), and picking up and putting down by what is smelled here against what is carried (§1, §2). Retires `#roleFor`, most of `#wanted` and `#nurse`.
2. Life odour and the midden as a pile (§5). Part of `ja-k4k.5`.
3. Building scent and local crowding (§4). `ja-k4k.3`.
4. The outdoor signature, contact counts and body reserves; age as attraction only (§3, §6). `ja-k4k.1`, and later `ja-k4k.6`.

## Sources

- [Theraulaz et al. 2002, Spatial patterns in ant colonies (*PNAS* 99:9645)](https://static.ias.edu/pitp/archive/2012files/44.pdf) · [Nature news](https://www.nature.com/articles/news020708-1) *(secondary)*
- Deneubourg et al. 1991, The dynamics of collective sorting: robot-like ants and ant-like robots, as described in [Swarm-based spatial sorting](https://arxiv.org/pdf/0805.1727) and [an ant-based algorithm for annular sorting](https://ar5iv.labs.arxiv.org/html/nlin/0507045) *(secondary)*
- [Franks & Sendova-Franks 1992, Brood sorting by ants: distributing the workload over the work-surface (*Behav Ecol Sociobiol* 30:109)](https://dx.doi.org/10.1007/BF00173947)
- [Sendova-Franks et al. 2004, Brood sorting by ants: two phases and differential diffusion (*Anim Behav*)](https://uwe-repository.worktribe.com/output/1057058/brood-sorting-by-ants-two-phases-and-differential-diffusion)
- [*Temnothorax crassispinus* brood after forced migration](https://visualize.jove.com/38986727) *(secondary, machine-written abstract)*
- [Mersch, Crespi & Keller 2013, Tracking individuals shows spatial fidelity is a key regulator of ant social organization (*Science* 340:1090), data](https://datadryad.org/dataset/doi:10.5061/dryad.8d8h7) · [Nature news](https://www.nature.com/articles/nature.2013.12833) *(secondary)*
- Tofts & Franks 1992 and Tofts 1993 (foraging for work), via [Robinson, Feinerman & Franks 2009](https://eprints.whiterose.ac.uk/46207/1/RobinsonTaskSwitching2009.pdf) and [Richardson et al. 2011 (*PLoS ONE*)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3081813/)
- [Khuong et al. 2016, Stigmergic construction and topochemical information shape ant nest architecture (*PNAS* 113:1303)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4747701)
- [Choe, Millar & Rust 2009, Chemical signals associated with life inhibit necrophoresis in Argentine ants (*PNAS* 106:8251)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2688878)
- [Wagner et al. 1998, Task-related differences in the cuticular hydrocarbon composition of harvester ants (*J Chem Ecol*)](https://dx.doi.org/10.1023/a:1020781508889)
- Wagner, Tissot & Gordon 2001, Task-related environment alters the cuticular hydrocarbon composition of harvester ants (*J Chem Ecol* 27:1805), [listed by the Gordon lab](https://web.stanford.edu/~dmgordon/old2/publications.html)
- [Greene & Gordon 2003, Cuticular hydrocarbons inform task decisions (*Nature* 423:32)](https://www.nature.com/articles/423032a.pdf)
- [Glancey et al. 1970, Pheromone may induce brood tending in the fire ant (*Nature* 226:863)](https://www.nature.com/articles/226863a0.pdf)
- [Schultner & Pulliainen 2020, Brood recognition and discrimination in ants](https://epub.uni-regensburg.de/44736/1/Schultner-Pulliainen2020_Article_BroodRecognitionAndDiscriminat.pdf)
- Kaptein, Billen & Gobin 2005, Larval begging for food enhances reproductive options in the ponerine ant *Gnamptogenys striatula* (*Anim Behav* 69:293), [library record](https://katalog.lib.cas.cz/KNAV/EdsRecord/edselp,S0003347204003422) · [Science News](https://new.sciencenews.org/article/ant-larvae-sway-say-feed-me) *(secondary)*
- [He et al. 2016, Starving honey bee larvae signal pheromonally to worker bees (*Sci Rep*)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4770327)
- [Stroeymeyt et al. 2018, Social network plasticity decreases disease transmission in a eusocial insect (*Science* 362:941)](https://pubmed.ncbi.nlm.nih.gov/30467168/)
