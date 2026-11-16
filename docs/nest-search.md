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

## How far the vector is off: the error grows like the square root of the distance out (ja-lp4.19)

*Added 2026-11-15 for `ja-lp4.19` (PRD §79), against code at `5a646196`. Labels: **FT** read in full text, **cit** read in a citing paper's full text, **abs** abstract only (**unverified**). The research is in `ja-lp4.14`'s notes.*

**Today** (`piErrorLaw` 0): the error is the odometer (`odoSurf`, the path walked since the ant came up its own hole) times one drift drawn per trip (`PI_DRIFT_2D` = 0.1/√2 a part: a median miss of 8.3 % of the path). It grows linearly with the path, and every step but the walk home adds, so fighting, defending and winding all enlarge it. In G1 (seeds 1–4, `ja-lp4.14`) ants 5–25 cells from their hole after winding paths missed by a median 97 % of that distance, and 15 defenders died 30–105 cells out believing they were within 10 of home (median 440 cells walked).

**The sources:**
- ***C. fortis* median miss: 1.27 m after 5 m (25 %), 2.45 m after 10 m (25 %), 2.47 m after 20 m (12 %)**, 50–53 ants each (Merkle, Knaden & Wehner 2006, Fig. 3B, as tabled by Goldschmidt et al. 2017, **cit**: Goldschmidt read in full, Merkle's figure not). From 5 to 20 m the miss grows as distance^0.48; the 10 m point sits above that line.
- **Between-ant SD about 1.6 m (16 %) after a 10 m channel** (*C. fortis* and *C. bombycina*, Pfeffer, Wahl & Wolf 2020, **FT**, figure read off its plots in `ja-lp4.14`'s research). A one-dimensional channel: distance error only.
- **A model where uncertainty grows like √distance:** Heinze, Narendra & Cheung 2018 (**FT**) assume a circular Gaussian whose area grows by a constant per unit walked, and fit that constant (> 310 cm² per cm) to Wehner & Srinivasan 1981's search data. The √ is the model's premise, not something it tests.
- **Search width follows the distance out, not the path's tortuosity** (Merkle & Wehner 2010, search summary only, **unverified**).
- **Distance is underestimated, more so further out** (Sommer & Wehner 2004, **abs**). Not built (below).

**The law** (`piErrorLaw` 1). The trip's drift is drawn as today, two Gaussian parts per trip up out of the ant's own hole, so the number and order of random draws do not change. What it is multiplied by changes, from the odometer to a span set by the **distance out**:

> miss = span × (driftSurf, driftSurfY), span = `PI_SPAN_GAIN` × √(`piErrorAt` × reach)

- **reach** (`reachSurf`): the farthest the ant has been, straight, from its own hole since it came up it, counted where the odometer is (every mode but the walk home), by its own walking (a child's tweezers don't count). Not the current distance: then the error would vanish as the ant neared home, and the vector would always lead it in. The sources measured ants walked straight out to a feeder, where the farthest point is the feeder's distance. Using the farthest point for a winding path is **design**, read from Merkle & Wehner 2010.
- **√: design.** Consistent with Merkle 2006's end points (5 → 20 m: ×1.94 for ×4) and Heinze 2018's model, but Merkle's three points do not single it out: 5 → 10 m grows almost linearly (exponent 0.95), 10 → 20 m is almost flat (0.01). At 10 m the law gives 17.7 % where Merkle measured 25 %.
- **`PI_MISS_AT` = 0.25:** the median miss is 25 % of the distance at `piErrorAt` out (Merkle 2006 at 5 m). `PI_SPAN_GAIN` = 0.25 / (0.1 × √ln 2) ≈ 3.0 converts it to the drift's scale (the median length of a 2D drift with parts of σ 0.1/√2 is 0.1√ln 2).
- **`piErrorAt` = 50 cells stands for 5 m: design.** The docs give 1 cell ≈ 1 body length but keep ratios, not sizes ([ant-communication](ant-communication.md): the map is a zoomed-in patch). Taken literally (1 cell ≈ 1 cm, `piErrorAt` 500), every game trip would be under 5 m, where no miss was measured, and the √ law would put the miss at 79 % of the distance at 50 cells. At 50 the game's trips (25–200 cells out) map onto 2.5–20 m, the range measured. The setting is there for the owner to change.

**What it gives** (median miss, as a share of the distance out):

| distance out (cells) | 25 | 50 | 100 | 200 |
|---|---|---|---|---|
| law 1 | 35 % | 25 % | 17.7 % | 12.5 % |
| sources (that distance ×10 cm) | none below 5 m | 25 % (Merkle) | 25 % (Merkle), ~19 % (Pfeffer's 16 % SD as a 2D median: the conversion, assuming the same spread across the path as along it, is design) | 12 % (Merkle) |
| law 0, a straight trip | 8.3 % | 8.3 % | 8.3 % | 8.3 % |

In G1 law 1's misses come out at 33 %, 26 %, 18 % and 14 % at reaches of 25, 50, 100 and 200 cells (law 0: 13–17 %, with a long tail from winding paths). Every figure is in PRD §79.

**Fighting and defending.** Under law 1 they add only as far as they take the ant further out than it has been: a fight or a stretch of guarding near where it already went costs nothing. That is what the sources measure (the vector over an outbound path, the width set by distance out), not a rule for fighters; whether fights blur the vector more than walking was not looked at by any source found (**not found**).

**Not built:**
- **The shortfall in distance** (Sommer & Wehner 2004): a bias along the vector, growing with distance. One abstract, no number; it would add a draw-free term along the vector.
- **The direction bias from the path's shape** (Müller & Wehner 1988, **abs**): needs the turns walked.
- **The food vector's error** (`siteGive`, `siteFidelity`, both off): still `PI_DRIFT` × its length.
- **The side view** (`integrate`, `believe`) keeps law 0: its vector is one-dimensional and its goldens stay as they are.

**In the game:**
- **The cue:** the ant's own home vector (sense table: path integration). Nothing new is sensed; the vector it already steers by is off by a different amount.
- **Who reads it:** every belief of home on the plane (`believePlane`, `fromHomePlane` and so `homeDistPlane`, which gates defence by `homeGround`), the remembered food spot (`rememberSite`, `siteAim`), where spoil goes (`dig.ts`), and the loops' σ (`searchOn`, with `searchLoops`), so the search widens with distance out as Merkle & Wehner 2010 report.
- **Off:** `piErrorLaw` 0, today's odometer, bit for bit.
- **Built off** (2026-11-15, PRD §79), **on by default since 2026-11-16** (owner, with the sized search below): law 1 holds G1's guard better and its defenders die nearer home (median 20–25 cells out against 55–59), but the weakest colony carries 8–13 % less food and S1's short-trip searches, now facing 25 % misses, bring fewer home in 600 s. The owner chose law 1 on 2026-11-16, accepting that cost (PRD §79.2).

## Sizing the search to the vector's error (ja-lp4.20)

*Added 2026-11-15 for `ja-lp4.20` (PRD §79.2), against code at `e2b47fd6`. Labels as in the section above. No full text could be fetched this session either (PMC and the Zürich and ANU repositories were refused), so every search-width claim below is from abstracts or search summaries.*

**The problem.** With `piErrorLaw` 1 the vector misses by 35 % of the distance at 25 cells out and 18 % at 100 (above), against today's flat 8.3 % of a straight trip. The search round the vector's end did not change with it: U3b's spiral starts at `SEARCH_START` (3 cells) and grows 1.6× a turn whatever the trip. A geometric spiral's turns are 0.6 × its reach apart, so past about 20 cells out they are further apart than the 12 cells an ant sweeps (sight 6 either side), and a hole beyond that can lie between two turns. S1's short trips (σ ≈ 15 cells at T = 100 under law 1, against 7 under law 0) are where it shows.

**What each source gives:**
- **Wehner & Srinivasan 1981** (**abs**): loops of ever-increasing size, starting and ending at the origin; the search density depends only on the distance from it and falls quickly. No width per trip.
- **Müller & Wehner 1994** (**abs**): a spiral search programme underlies the loops. No growth law in what was read.
- **Merkle, Knaden & Wehner 2006** (**abs**; the medians of the miss **cit**, via Goldschmidt et al. 2017): longer trips give larger errors, and the ants "adapt their systematic search strategy to their increasing uncertainty by extending their search pattern". The miss medians (1.27, 2.45, 2.47 m at 5, 10, 20 m) are the error law above; the search widths are in its figures, not obtained.
- **Merkle & Wehner 2010** (search summary only, **unverified**): the width of the search density profile depends on the distance out (the vector's length), not on how winding the outbound path was. No numbers obtained.
- **Vickerstaff & Merkle 2012** (**abs**): a Bayesian model in which the ant searches by its own estimate of its path-integration error produces broader search patterns as that uncertainty grows, as the ants do; it beats Lévy loops, a spiral and an anchored random search on efficiency at error rates below 0.02 m²/s. No width multiple.
- **Pfeffer, Wahl & Wolf 2020** (**FT**, earlier session): search medians 8.9–11.0 m at a 10 m vector, a 1-D channel: where the search centres, not its width.

So the shape is sourced (the search's size grows with the vector's own error, set by the distance out), and its multiples are not: **design**.

**The rule** (`searchScale`, off = 0). On the plane, round where the vector ran out, U3b's quarter-turn spiral is sized by the vector's own error σ = `PI_DRIFT_2D` × piSpan (per axis: with law 1, `PI_SPAN_GAIN` × √(`piErrorAt` × reach) × 0.1/√2; with law 0, the odometer's):

> point n reaches max(`SEARCH_START`, σ × (`searchScale` + `searchScaleStep` × n/4)), a quarter turn on from the last

- **σ:** sourced in shape (Merkle 2006; Merkle & Wehner 2010; Vickerstaff & Merkle 2012). It is the same σ the loops (`searchLoops`) use.
- **An even spiral** (each turn `searchScaleStep` σ further, not 1.6× the last): **design**, so the turns do not outrun sight at the reach where the misses are. Müller & Wehner 1994's spiral gives no law.
- **`searchScale` 1, `searchScaleStep` 0.5:** **design**, chosen on S1 (seeds 1–4, nine pairs of 0.25 / 0.5 / 1, by the worst seed; PRD §79.2). With law 1 at 100 cells out (σ = 15) the first point is 15 cells out and each turn 7.5 further; at 600 out (σ = 37), 37 and 18. The centre is not left unsearched: the ant walks through it to its first point, and its mound's smell (above) pulls it in near the hole.
- **`SEARCH_START`** stays the floor (an ant with no error still circles at 3 cells).
- **Not round a stored place:** an ant that retraced its route (`routeEnd`) searches round its first stored place, which it saw; that search keeps U3b's spiral.
- **Unchanged:** the stall rule (`SEARCH_STALL` moves it to the next point), the cap at the plane's longer side, the side view's and top-down search, `siteAim`'s search round a food spot.
- **Cost:** none in Jev (no situation, legend or question changes); one `sqrt` a search point.

**Against:**
- The real search is loops that return to the origin (Wehner & Srinivasan 1981), not a spiral; the loops (`searchLoops`) are built and scale by the same σ, but lost G1 and A1 in `ja-lp4.11` (PRD §56).
- A searcher whose detection is certain within its sight gains nothing from wider turns: the optimal sweep for a sure detector is turns 2 × sight apart whatever σ, and σ only sets how far out it needs to go. The ants' wider searches fit uncertain detection (Vickerstaff & Merkle 2012's model weighs both). Which matters more in the game is what S1 and G1 measure.

**Built off** (2026-11-15, PRD §79.2); **on by default since 2026-11-16**, with law 1 (owner: the literature-sized error over the weakest colony's food). With law 1 the scaled search wins S1 back: home in 600 s on the worst seed at 100 / 200 / 400 / 600 cells out, 100 / 95 / 90 / 85 % (seeds 1–10) against law 0's 100 / 95 / 72.5 / 77.5 %, and the median time home at 600 cells out falls from 112 s to 45–51 s. G1 does not follow: its guard holds (8–9 of 10 seeds within 2) and defenders still die near home, but the weakest colony carries less than under law 0 (1,445 against 1,754 on seeds 1–10, 1,015 against 1,333 on 11–20), less even than law 1 with today's spiral. A2b's rich-patch choice falls (9 → 6 of 10). So both stayed off until the owner turned them on together, and the weakest colony's loss under law 1 is not the search's to fix.

## What was not found

- Any full text: blocked by the network policy (see the header).
- The growth law of the loops, and how successive loops' directions are chosen.
- Search widths per trip length.
- A natural give-up time.
- A still-air test of nest-odour following.
- Any study of trail-laying ants climbing a gradient of marks to their entrance.
- Direct work on how trail-laying ants (*Lasius*, *Formica*, *Myrmica*) search for a missed entrance.
- A primary figure for path-integration error per distance. `nest-and-home.md`'s "~10 %" was not re-confirmed here. (Since found, 2026-11-15: Merkle 2006's medians via Goldschmidt 2017, and Pfeffer 2020; see "How far the vector is off".)

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
- Goldschmidt D, Manoonpong P, Dasgupta S (2017). A neurocomputational model of goal-directed navigation in insect-inspired artificial agents. *Front Neurorobot* 11:20. [PMC5388780](https://pmc.ncbi.nlm.nih.gov/articles/PMC5388780/) (full text: its Table 1 gives Merkle et al. 2006's medians)
- Pfeffer S, Wahl V, Wolf H (2020). Accuracy and spread of nest search behaviour in the Saharan silver ant, *Cataglyphis bombycina*, and in the salt pan species, *Cataglyphis fortis*. *Anim Cogn* 23:1107–1117. [PMC7700069](https://pmc.ncbi.nlm.nih.gov/articles/PMC7700069/) (full text)
- Heinze S, Narendra A, Cheung A (2018). Principles of insect path integration. *Curr Biol* 28:R1043–R1058. [PMC6462409](https://pmc.ncbi.nlm.nih.gov/articles/PMC6462409/) (full text, read in `ja-lp4.14`'s research)
- Müller M, Wehner R (1988). Path integration in desert ants, *Cataglyphis fortis*. *PNAS* 85:5287–5290. [doi:10.1073/pnas.85.14.5287](https://doi.org/10.1073/pnas.85.14.5287) (abstract only)
- Sommer S, Wehner R (2004). The ant's estimation of distance travelled: experiments with desert ants, *Cataglyphis fortis*. *J Comp Physiol A* 190:1–6. [doi:10.1007/s00359-003-0465-4](https://doi.org/10.1007/s00359-003-0465-4) (abstract only)
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
