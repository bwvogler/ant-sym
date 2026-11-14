# Nest search: loops back through where the vector ran out, and the colony's own smell on its mound

*Research note for epic `ja-lp4.11` (one world, for `ja-lp4.6.3`; PRD §56). Written 2026-11-11, against code at `f188c23`. **No paper was read in full text.** This session's network policy refused every publisher and repository host tried (PMC, Springer, biologists.com, OUP, doi.org, MPG PuRe, BMC). Every claim below comes from abstracts, highlights and citing papers seen in search results, so all of it is **unverified**. The parameters of the mechanic are **design**. The scratch research files list which full texts to read first when access exists.*

## What the game does today, and what goes wrong

On one world's plane a homing ant steers by its own drifting home vector (U3b, PRD §51):
- **Its error.** The error is drawn per trip, at σ = 0.1/√2 of the distance walked out on each axis (`PI_DRIFT_2D`).
- **Where the vector runs out with no hole there,** it visits points a quarter turn apart round that spot, each loop of four 1.6× wider (`#searchOn`, `SEARCH_GROW_2D`).
- **When blocked:** 3 s with no progress (`SEARCH_STALL`) also moves it to the next, wider point.
- **Near the hole:** within `HOLE_SIGHT` (6 cells) of its hole, the hole and its smell pull it in.

G1 (600 + 600 ants, 600 s) fails its bound on every seed: no colony may have more than 2 foragers holding food over 120 s.

**Diagnosis** (this note, seeds 10 and 5, every carrier on the plane holding food over 120 s, sampled each 30 s: 474 samples, 185 ants):
- **What they are doing:** all of them are homing and searching. They are rarely blocked: 24–25 % had made no progress for over 1 s. Only 3–5 % are nearer the rival's hole than their own.
- **How far they walked:** median trips of 364–417 cells out. Their vector's miss is a median 48–51 cells, against 6 cells of sight.
- **Where they are:** only 1–3 % are within 10 cells of their hole.
- **Their search:** a median reach of 57–64 cells, and 160–260 at the 90th percentile. The spiral has grown far past the hole and never comes back over it.

**An offline model of the search's geometry** (scratch `geom.mjs`):
- **Setup:** speed 7 cells/s, sight 6, the hole drawn at the same σ round the vector's end.
- **Today's spiral levels off:** at 400-cell trips it finds 74 % in 120 s and never more than 81 %. At 600-cell trips it finds 51 %, then never more than 66 %.
- **Centred loops (petals) fix the tail but not the first 120 s:** loops that leave the centre in turning directions and come back to it, each longer than the last, find 96–99 % by 600–1,200 s. In 120 s they find 57–77 %, no faster than the spiral.
- **A longer reach helps the first 120 s:** a hole smelt from 20 cells instead of 6 lifts the 120-s share to 86–93 % at 400-cell trips.

So the question is: **how does a homing ant search when its vector runs out at no nest, and what near the nest pulls it in?**

## A lost forager searches in loops that start and end where its vector ran out

- **The pattern.** *Cataglyphis* foragers that run off their vector without reaching the nest "perform a number of loops of ever-increasing size, starting and ending at the origin and pointing at different azimuthal directions".
  - The search density depends only on the distance from the origin, not the direction, and falls quickly with distance. Citing papers describe it as a radially symmetric Gaussian.
  - After an hour the paths cover about 10⁴ m², still "precisely centred" on the origin.
  - Source: Wehner & Srinivasan 1981 (*J Comp Physiol* 142), abstract. **Unverified.**
- **The mechanism.** Underlying the loops is "a spiral search programme that gets transformed into the observed pattern of loops by the ant's idiosyncratic path-integration algorithm". Simulations of that rule reproduce the recorded searches. A summary of the abstract adds two details: the spiral breaks off with a run back to the centre, and it occasionally changes its sense of turning (Müller & Wehner 1994, *J Comp Physiol A* 175). **Unverified.**
- **A model.** Waldner & Merkle 2018 (*J Comp Physiol A* 204) model the search as loops centred on the origin, plus random perturbations of each step that stand in for path-integration error. It uses only distance from the origin, the last step's direction and the home vector, and reconstructs recorded *Cataglyphis* searches. Abstract; **unverified**. Its equations are the first full text to read.
- **Other species.** *Melophorus bagoti* also searches in loops centred where the nest most likely is. The loops start close to the origin and lengthen slowly (Schultheiss & Cheng 2011, *Anim Behav* 81). **Unverified.**
- **Not found:**
  - the growth law for loop size (linear or by a factor);
  - whether successive loops turn by a fixed step or at random.
- **Against:**
  - Lévy-walk readings of these searches (Reynolds 2008; Reynolds, Schultheiss & Cheng 2014) are disputed: one *Cataglyphis* study found a single exponential, Brownian-like walk.
  - For trail-laying ants the evidence is thin. In the lab, *Lasius niger*'s steps and turns are biased by heading relative to the start, not looped (Bonavita et al. 2026, *PLOS ONE*).

  All **unverified**.

**In the game:**
- **The cue:** the ant's own home vector (sense table: path integration), nothing new.
- **The response:** steering only.
- **The rule (design):** the search becomes loops that leave the spot where the vector ran out and come back to it. Each loop heads a large turn from the last (the golden angle, 137.5°, so successive loops spread evenly round the centre: **design**), and each runs out further than the last. The ant's walk between waypoints is today's steering.
- **Off:** today's spiral.

## The search is wider after a longer trip

- **Trip length.** Longer foraging trips give larger path-integration errors, and *Cataglyphis fortis* "adapt their systematic search strategy to their increasing uncertainty by extending their search pattern" (Merkle, Knaden & Wehner 2006, *J Exp Biol* 209). The ants calibrate the width by the distance they went out, which the vector gives them, not by how winding the path was (Merkle & Wehner 2010, *Behav Ecol* 21). Abstracts; **unverified**.
- **Numbers.** No width-per-distance numbers were obtained; the search tool's figures conflicted. One citing study gives a median search width of 5.45 m at a 10 m vector (**unverified**, source not identified with certainty).
- **No end.** No natural give-up time was found: searches run an hour or more, and one ant reportedly searched about 2 h until it died. Desiccation and the game's own tiredness (`docs/tiredness.md`) are other matters.

**In the game:**
- **The cue:** the length of the trip out (`odoSurf`, the ant's own odometer).
- **The rule:** the first loop's reach and each loop's growth scale with the trip: about σ/2 to start, σ/8 more each loop, where σ is the vector's own error at that trip. **Design**, from the model above; tuned in the build.
- **Endless:** the loops grow without a cap, as today.

## Near the nest, an ant whose vector has run out follows the nest's own smell

- **Cataglyphis.** Homing *C. fortis* run upwind along their nest's plume, and CO₂ alone triggers it. They **only respond when their path integrator says they are near the nest**: ants with a full vector, released next to their own nest, ignored it (Buehlmann, Hansson & Knaden 2012, *Curr Biol* 22).
  - Ants that have begun a nest search **always** follow the plume (Spehr et al. 2026, *iScience* 29).
  - The plume was used within about 0.3 m downwind, in desert wind. Searches centre on cues found only at the nest (Huber & Knaden 2015, *J Comp Physiol A* 201).

  All **unverified**.
- **Without wind: the colony's own marks on its mound.** *Pogonomyrmex barbatus* coat the pebbles of their 1–2 m mound with colony hydrocarbons, in a gradient that grows stronger toward the entrance. Diluting it with unscented pebbles slowed returning foragers (Sturgis, Greene & Gordon 2011, *J Chem Ecol* 37). That paper measured return speed, not whether ants climb the gradient.
  - *Lasius niger* footprint hydrocarbons are *assumed* densest near the nest (Lenoir et al. 2009, citing Devigne & Detrain 2006); Lenoir's own deposits were equal at the entrance and in the foraging area (15.6 against 17.1 ng, P = 0.28; [ant-communication §3](ant-communication.md#3-rival-colonies)). They read them as "home range", with fewer U-turns, more trail laying and more resting, but no study shows them steering up the gradient (Devigne & Detrain 2002, 2006).
  - Pinpointing a nest among odours needs both antennae (Steck, Knaden & Hansson 2010, *Anim Behav* 79), which points to a left–right comparison.

  All **unverified**.
- **Against:**
  - Every nest-plume result was measured in wind; no still-air test of a nest plume was found.
  - *Myrmecia* pinpoint the nest without local smell (Zeil 2025).
  - Young *Myrmica* workers find a marked entrance poorly (Cammaerts 2013).

  **Unverified.**

**In the game:**
- **The cue:** the colony's own hydrocarbons on its mound, strongest at its hole. The ant reads them with a left–right antennae comparison as it walks.
  - The sense-table row is "Landmarks and entrance odour": its range grows from "near the hole" to "the ant's own mound, while searching".
  - The mound already grows round each hole with the soil dug out (U3c: up to `MOUND_REACH`).
  - It is colony-specific: a rival's mound smells of strangers, as the hydrocarbons do.
- **The gate:** used only while the ant is searching (its vector run off), as Buehlmann 2012 and Spehr 2026 report. A homing ant crossing its own mound on a full vector keeps to its vector.
- **The response:** steering up the gradient to its own hole: today's "in sight" pull, from as far out as its mound reaches.
- **The rule (design):** a searching ant on its own mound steers for its hole. "On its own mound" means within the mound's reach of the hole and on mound ground underfoot. The reach used is the mound's as dug, at least `HOLE_SIGHT`.
- **Off:** sight 6 only, as today.
- **Wind:** none, as the game has no wind.

## What was not found

- Any full text: blocked by the network policy (see the header).
- The growth law of the loops, and how successive loops' directions are chosen.
- Search widths per trip length.
- A natural give-up time.
- A still-air test of nest-odour following.
- Any study of trail-laying ants climbing a gradient of marks to their entrance.
- Direct work on how trail-laying ants (*Lasius*, *Formica*, *Myrmica*) search for a missed entrance.
- A primary figure for path-integration error per distance. `nest-and-home.md`'s "~10 %" was not re-confirmed here.

## The mechanic

| Cue (sensed) | Sense row | Response | Local rule (design) | Off | Retires |
|---|---|---|---|---|---|
| its vector ran out at no hole (its own vector) | path integration | steering: loops from that spot and back, each heading ~137.5° on, each reaching further | first reach ≈ σ/2, each next loop + σ/8, σ from its own trip (`odoSurf`); no cap | today's widening 4-point spiral (`SEARCH_GROW_2D`) | the spiral that outruns the hole |
| its colony's smell on its mound, strongest at the hole (left–right) | landmarks and entrance odour (range widened) | steering: up the gradient to its hole | only while searching; within its own mound's reach; colony-specific | sight `HOLE_SIGHT` (6) only | — |

- **Scope:** one world's plane only (`line !== null`). The side view's search (1D, either side) and top-down are untouched, so their goldens stay bit-exact. The one-world golden is unchanged: it never has a carrier searching on its own mound, so the smell's tests and S1 cover it.
- **`SEARCH_STALL`:** a blocked ant moves on to its next loop's next waypoint rather than widening on each stall, so blocking can't inflate the search. **Design**; measured against keeping today's rule.
- **Cost:** steering only. No situation field, legend or question changes, so Jev's cost is unchanged.
- **Assays, first, with no behaviour change:**
  - **S1, a search assay on one world.** Carriers are set down on the plane with a set miss, at trip lengths of 100, 200, 400 and 600 cells, seeds 1–10. It measures the share home within 120 s and within 600 s, the median time, and whether each search stays centred on its origin (the mean position within a few cells of it, as Wehner & Srinivasan 1981's "precisely centred").
  - **G1,** as now.
- **Targets:**
  - S1: no carrier lost for good (≥ 99 % home within 600 s at every trip length).
  - G1 meets its bound (≤ 2 held over 120 s per colony) on seeds 5 and 9, which un-skips its slow guard.

  If G1 still fails, the numbers go to the owner.

## Play

- **See.**
  - A lost carrier now runs out and back through the same spot in turning loops, like a flower drawn round the place it thought home was.
  - Near home, a searcher on its own mound turns and walks straight to the hole.
  - Fewer ants wander the plane for minutes with food in their jaws, so a colony's food stream reads as steady rather than leaky.
  - A Learn entry can explain both ("what real ants do": Wehner's loops; harvester-ant mounds that smell of home).
- **Choose.** No new lever for the player (the fungus): this is the colonies' nature, and groundwork for U6b's one-world baselines. Later, a fungal odour lever that blurs colony odour could reach the mound cue. That is **design**, not planned here.
- **Progression and counterplay.** Unchanged: no fungus lever touches it. A colony that loses fewer carriers stores more, so the fungus faces healthier colonies, as in the side view.
- **Cost.** None in Jev. The per-ant work is a waypoint per loop and a distance check on the mound. The tick should stay within the one-world budget (ja-lp4.6.7 tracks the tick); `colony-bench --one` measures it.
- **Risks.**
  - **A cliff:** a big mound reach could make homing trivial near home and hide the vector. We'd see it as S1's 120-s share near 100 % at every trip length.
  - **Rival mounds:** none, because the cue is colony-specific.
  - **Crowding:** searchers converging on the hole. We'd see it at the gate as a crowd count (`ja-web`'s `crowd`).

## Open questions

- **Owner (2026-11-11):** do both, centred loops and the mound's smell, rather than loops alone. The sources are accepted marked unverified while full texts can't be fetched.
- **For the owner after S1's baseline:**
  - the loops' first reach and growth, and the turn between loops (golden angle, or random as "different azimuthal directions" allows);
  - whether `SEARCH_STALL` skips a waypoint or keeps widening.
- **If G1 still fails its bound with both:** the bound itself for one world, or the trips' length (median 360–420 cells out).
- **To read when access exists:**
  - Waldner & Merkle 2018 (PMC6244989), for the step rule and the growth law;
  - Merkle, Knaden & Wehner 2006, for width per distance;
  - Sturgis, Greene & Gordon 2011, for the gradient's shape;
  - Spehr et al. 2026.

## What was built

*2026-11-11, `ja-lp4.11` (PRD §56, "As built", has every number).*
- **Shipped: U3b's spiral with the mound's smell** (`searchLoops` 0, `moundSmell` 1). The owner chose by G1's worst seed without losing A1: the loops lost both.
- **The mound's smell.** As in the table: searching, within its own mound's reach as dug (`planeMoundReach`, at least `HOLE_SIGHT`), on spoil underfoot (the plane's height field, which the midden rule also reads), the ant steers for its hole. This is what helps the game.
- **Loops, built but switched off.** As in the table: three points a loop (out, across a 60° petal, back to the origin), each a golden angle on, reaching σ × (`searchLoops` + k/8). Tuned on S1 to 1.5σ (growth, turn, width and the skip-a-point stall rule as designed). They win S1 but lose G1 (worst seed 49 against the spiral's 35) and A1 (8/10 → 4/10): carriers with food run long loops through rock and over the trails.
- **S1** (lost carriers, seeds 1–10), home in 600 s at 400 / 600-cell trips: `main` 88 / 77.5 %, spiral + smell 92.3 / 86.3 %, loops + smell 98.7 / 94.5 %. The ≥ 99 % target is not met.
- **G1 still fails its bound** (0/10). Shipped, seeds 5 and 9 hold 10 and 7 over 120 s against 2; the worst colony per seed fell on 9 of 10 seeds (sum 217 → 166). The held carriers are in the vector's tail (misses ~2.3σ, beyond the ~1.9σ an ant can sweep in 120 s) or behind rock (seed 4's pocket). The bound stays (owner); follow-ups proposed: shorter trips, and route memory for rock pockets.

## Sources

- Wehner R, Srinivasan MV (1981). Searching behaviour of desert ants, genus *Cataglyphis*. *J Comp Physiol* 142:315–338. [doi:10.1007/BF00605445](https://link.springer.com/article/10.1007/BF00605445) (abstract only)
- Müller M, Wehner R (1994). The hidden spiral: systematic search and path integration in desert ants, *Cataglyphis fortis*. *J Comp Physiol A* 175:525–530. [doi:10.1007/BF00199474](https://link.springer.com/article/10.1007/BF00199474) (abstract only)
- Waldner F, Merkle T (2018). A simple mathematical model using centred loops and random perturbations accurately reconstructs search patterns observed in desert ants. *J Comp Physiol A* 204:985–998. [PMC6244989](https://pmc.ncbi.nlm.nih.gov/articles/PMC6244989/) (abstract only)
- Vickerstaff RJ, Merkle T (2012). Path integration mediated systematic search: a Bayesian model. *J Theor Biol* 307:1–19. [doi:10.1016/j.jtbi.2012.04.034](https://www.sciencedirect.com/science/article/abs/pii/S0022519312002159) (abstract only)
- Merkle T, Knaden M, Wehner R (2006). Uncertainty about nest position influences systematic search strategies in desert ants. *J Exp Biol* 209:3545–3549. [doi:10.1242/jeb.02395](https://journals.biologists.com/jeb/article/209/18/3545/16103/Uncertainty-about-nest-position-influences) (abstract only)
- Merkle T, Wehner R (2010). Desert ants use foraging distance to adapt the nest search to the uncertainty of the path integrator. *Behav Ecol* 21:349–355. [OUP](https://academic.oup.com/beheco/article/21/2/349/321171) (abstract only)
- Schultheiss P, Cheng K (2011). Finding the nest: inbound searching behaviour in the Australian desert ant, *Melophorus bagoti*. *Anim Behav* 81:1031–1038. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0003347211000613) (abstract only)
- Reynolds AM, Schultheiss P, Cheng K (2014). Does the Australian desert ant *Melophorus bagoti* approximate a Lévy search by an intrinsic bi-modal walk? *J Theor Biol* 340:17–22. [ResearchGate](https://www.researchgate.net/publication/256482456_Does_the_Australian_desert_ant_Melophorus_bagoti_approximate_a_Levy_search_by_an_intrinsic_bi-modal_walk) (abstract only)
- Bonavita et al. (2026). Discovering search behaviour in black garden ant trajectories. *PLOS ONE* e0327957. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0327957) (abstract only)
- Buehlmann C, Hansson BS, Knaden M (2012). Path integration controls nest-plume following in desert ants. *Curr Biol* 22:645–649. [doi:10.1016/j.cub.2012.02.029](https://doi.org/10.1016/j.cub.2012.02.029) (abstract only)
- Spehr et al. (2026). Context-dependent influence of path integration on nest plume following in desert ants. *iScience* 29:116523. [doi:10.1016/j.isci.2026.116523](https://doi.org/10.1016/j.isci.2026.116523) (abstract and highlights only)
- Huber R, Knaden M (2015). *J Comp Physiol A* 201:609–616 (title not confirmed). [Springer](https://link.springer.com/article/10.1007/s00359-015-0998-3) (a citing paper's summary only)
- Steck K, Knaden M, Hansson BS (2010). Do desert ants smell the scenery in stereo? *Anim Behav* 79:939–945. [doi:10.1016/j.anbehav.2010.01.011](https://doi.org/10.1016/j.anbehav.2010.01.011) (abstract only)
- Sturgis SJ, Greene MJ, Gordon DM (2011). Hydrocarbons on harvester ant (*Pogonomyrmex barbatus*) middens guide foragers to the nest. *J Chem Ecol* 37:514–524. [doi:10.1007/s10886-011-9947-y](https://doi.org/10.1007/s10886-011-9947-y) (abstract only)
- Devigne C, Detrain C (2002). Collective exploration and area marking in the ant *Lasius niger*. *Insectes Soc* 49:357–362. [Springer](https://link.springer.com/article/10.1007/PL00012659) (abstract only)
