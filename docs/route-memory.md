# Route memory: a carrier whose home vector points through rock walks back the way it came

*Research note for epic `ja-lp4.16` (one world, for `ja-lp4.6.3`; PRD §59). Written 2026-11-11 against code at `9b03a9e`; built and switched on 2026-11-14 ("What was built"). **No paper was read in full text.** Every publisher, repository and preprint host tried was refused by this session's network policy (`www.sussex.ac.uk`, `pmc.ncbi.nlm.nih.gov`, `cob.silverchair.com`, `elifesciences.org`, `www.biorxiv.org`: no DNS). Every claim below comes from abstracts, database records and citing papers seen in search results, so all of it is **unverified**. The authors of two older papers are given from memory where a search result did not show them. The rules are **design**. It builds on [nest-search](nest-search.md) (the search at the end of the vector) and [forager-trips](forager-trips.md) (what keeps a trip short) and does not repeat them.*

## The question

When a forager's home vector points through rock and it cannot get there, what does a real ant do, and what should a game ant do?

## What the game does today, and what goes wrong

On one world's plane a homing ant steers for where its drifting vector says the hole is (`#believePlane`: the hole plus `odoSurf` × drift, per axis, fixed once it turns for home). What it can sense on the way:
- **Touch.** `#touch` feels for rock or the plane's edge 1–1.5 cells ahead and to the sides, along a heading. That is the only sense of rock it has.
- **Sight and smell of the hole.** Within `HOLE_SIGHT` (6 cells) its belief is the hole itself; within `NEST_SIGHT` (8) if a straight line to it is clear; and, once its vector has run out, on its own mound (the mound's smell, `ja-lp4.11`, PRD §56).
- **The home trail.** It leads an ant that is already searching, by the share `homeTrail` (0.8). It does not lead one on its vector.
- **Its own past places.** It keeps the place it first met rock this trip (`mx`, `my`, Bug2's "m-line") and the first cell of the wall it follows (`loopX`, `loopY`). Nothing longer.

When the step is blocked, **Bug2 by touch** starts: it keeps the wall on one side until it is nearer its belief than where it met the wall, on the m-line, with the way open; it turns back once after `FOLLOW_FLIP` (45 s) and gives up after `FOLLOW_GIVE_UP` (120 s). But a **stall rule** cuts across it. A homing ant on the plane with no cell nearer its belief for `SEARCH_STALL` (3 s) calls `#searchOn(i, true)`, which moves the search's point on **and zeroes `wall`, `mx`, `bestD` and `stallT`**. A wall-follower round a long band is, by definition, no nearer its belief for several seconds at a time.

### Measured: what held carriers are doing (scratch, 2026-11-11)

G1 (600 + 600 ants, 600 s, as shipped: `searchLoops` 0, `moundSmell` 1, `planePatience` 1, `siteFidelity` 0) on seeds 4, 5, 9 and 10. A scratch probe (in the session's scratchpad, not in the repo) follows every carrier on the plane from pickup, and from 120 s of carrying records each 10 s: its place, its distance from its hole, the **geodesic** number of steps to the hole over open plane cells (a breadth-first search from the hole), whether a straight line to the hole is clear, its wall state and its search. It also counts, per carrier, the stall rule's firings (each moves the search on: a change in `search`) and the times it began to follow a wall. This run reproduces `main`'s G1 (food carried down 2,582 / 1,709 and births 472 / 390 on seed 5; 2,785 / 1,416 and 350 / 299 on seed 9, as in PRD §58).

A carrier held over 120 s is a **pocket** carrier if, at two or more samples, no straight line to its hole is clear and the way round is at least 1.8 times the straight distance (or no open way exists); **blocked** if a line is blocked within 80 cells but the way round is shorter than that; **open** if neither.

| seed, colony | carrier trips over 120 s | the most held at one sample (10 s) | of those: pocket / blocked / open | mean held over the samples (pocket, blocked, open) |
|---|---|---|---|---|
| 4, you | 92 | 34 (at 470 s) | 29 / 2 / 1 (2 had no sample) | 13.9 / 2.1 / 0.6 |
| 4, rival | 42 | 8 | 2 / 5 / 0 | 0.4 / 2.3 / 1.0 |
| 5, you | 25 | 6 | 1 / 3 / 2 | 1.3 / 1.7 / 0.5 |
| 5, rival | 19 | 10 | 0 / 7 / 3 | 0.0 / 1.9 / 0.6 |
| 9, you | 33 | 8 | 0 / 4 / 4 | 0.0 / 1.1 / 2.2 |
| 9, rival | 11 | 2 | 0 / 1 / 1 | 0.0 / 0.1 / 0.7 |
| 10, you | 95 | 19 | 6 / 12 / 1 | 3.6 / 7.0 / 0.8 |
| 10, rival | 40 | 8 | 0 / 6 / 1 | 0.0 / 3.5 / 0.5 |

What the pocket carriers do (seed 4, you: 57 pocket carriers of the 92):
- **How long.** Median hold 225 s, longest 365 s. Of the 57: 29 got home, 9 died holding food, **19 were still held at 600 s**. The 12 open carriers of the same colony held a median 140 s; 10 of 12 got home.
- **Where.** Median 62 cells from the hole as the crow flies, but 116 steps round it (the open ones: 30 cells, 35 steps). The map is a rock band running north–south a few cells east of the hole, 10–15 cells thick and more than 70 long; the carriers sit on its far side, pressed against its wall.
- **What the stall rule does to them.** A median of 9 search advances and 13 wall-follows begun over the hold (open carriers: 2 and 1). They begin to follow the wall, and three seconds later the stall rule zeroes it and begins again.
- **What the wall rule would do alone.** In a scratch copy of the code in which the stall rule leaves a wall-follower alone for up to 100 s, seed 4's worst sample falls only from 34 to 29 held (carrier trips over 120 s: 134 to 125). Following the band is not enough: the band is long, the side is chosen at random (`wallSide`), and the vector it follows round it still points through it.

So the problem has two parts. **On seed 4 it is pockets** (29 of the 34 held at the worst sample). **On seeds 5 and 9, the guard's seeds, it is not**: their held carriers are mostly in the open, or beside rock but not behind it (seed 5, rival: 7 of 10 are blocked-near; seed 9, you: 4 and 4). Whatever helps there has to help an ant that is lost anywhere, not one behind a band. That decides what the mechanic below is.

## 1. Ants have route memories beside path integration, and they cooperate

- **Separate guidance systems that train each other.** Collett, Chittka & Collett (2013, *Curr Biol* 23:R789) argue that insects have several memory-based guidance systems (path integration, and two kinds of image matching) that cooperate and train one another, rather than one map; most findings read as evidence of a cognitive map are explained without one. Abstract. **Unverified.**
- **Local vectors beat the global one.** In *Cataglyphis*, while a local vector from a route memory is in use, the global vector's expression is temporarily inhibited (Collett, Collett, Bisch & Wehner 1998, *Nature* 394, as cited). In a cluttered habitat the directional knowledge may be a series of local vectors rather than one home vector, and local vectors are "dominant over the global vectors" (as cited by Collett 2010, *PNAS* 107). **Unverified.**
- **Routes without the vector.** *Cataglyphis velox* foragers learn visually guided routes that are individual to each ant, and recall them "in the absence of global path integration information or when placed in conflict with this information" (Mangan & Webb 2012, *Behav Ecol* 23:944). Several routes form spontaneously. Abstract. **Unverified.**
- **A route is a link from a place to a heading.** *C. fortis* round a cylinder store a route as links between location-specific visual cues and remembered headings (Collett 2010, *PNAS* 107:11638). **Unverified.**
- **Against a map.** *Melophorus bagoti* have routes that are one way: an inbound ant that reaches a point of its homeward route follows it to the nest, but one that meets its *outbound* route behaves as though lost. The authors conclude that landmarks "instruct the ants when to do what" and are not knitted into a map (Wehner, Boyer, Loertscher, Sommer & Menzi 2006, *Curr Biol* 16:75). Abstract and summaries. **Unverified.**

**In the game:** a route memory is a second guidance system, beside the vector, kept per ant and per trip: **places along the way it walked out** (the ant's own past, not a map: it holds no coordinate of the hole, another nest or the chamber table). It is gated on the vector failing (see §3). The game has no scenery, so an ant "recognises" a stored place when it is within `routeSee` cells of it; that stands in for a familiar view and is **design**. The sense table gets a new row ("Route memory"), which this note admits.

## 2. How the two combine: the vector's weight falls as it fails

- Ants weight the vector against the view by how reliable the vector is: with a longer vector run before a conflict test, *Melophorus* leaned on it more (Wystrach, Mangan & Webb 2015, *Proc R Soc B* 282:20151484). Celestial and terrestrial cues in conflict are averaged, with the better one weighted more (Legge, Wystrach, Spetch & Cheng 2014, *J Exp Biol* 217:4159). Abstracts. **Unverified.**
- When the weighting is tested in conflict, recalibration is limited: *M. bagoti* trained with a vector displaced 45°, 90°, 135° or 180° on every trip did not fully recalibrate it (Freas & Cheng 2018, *Insectes Soc* 65:141); the result's size was not seen. **Unverified.**
- Repeating a familiar route that ends nowhere (a displaced ant) changes the weights online: ants "modulate online the weights accorded to cues" (Wystrach et al. 2019, *Anim Cogn*, title seen). **Unverified.**
- No paper was found that says *when* a blocked ant stops following its vector for its route, or by how much.

**In the game:** the weight is not a blend but a switch, and it is the cheapest cue the game has: **the vector has failed.** Two events say so, both already in the code: no nearer its belief for `SEARCH_STALL` (3 s, a blocked vector), and reaching its belief with no hole there (an exhausted vector). The ant then walks its route memory instead of widening its search. **Design**: a switch, not a weighted sum, because the ant has no way to weigh two headings it could not both follow.

## 3. A blocked ant walks along the barrier, and a lost ant goes back the way it was going

- **Along the barrier.** *Cataglyphis fortis* trained to a feeder 25 m away and made to detour round a barrier (Schmidt, Collett, Dillier & Wehner 1992, *J Comp Physiol A* 171:285: authors from memory; the search result gave the title and DOI) headed, afterwards, as the home vector updated through the detour predicts. On an extended barrier (*The guidance of desert ants by extended landmarks*, *J Exp Biol* 204:1635, 2001, authors not seen) "in some cases the ant made for the middle of the barrier, then walked along it, and aimed for the nest when it reached the end"; the authors suggest the weights of two learnt responses (a habitual compass direction triggered by the barrier's sight, and a compass-independent view direction) change with the state of the path integrator. Snippets. **Unverified.**
- **Backtracking.** *Melophorus bagoti* displaced onto unfamiliar ground just short of their nest did not search at random: they **backtracked in the compass direction opposite to the path they had just travelled**. It is triggered only if they had travelled a route before capture, is set by an absolute (celestial) compass, and was seen in untreated ants in the field; about 730 ants from three nests (Wystrach, Schwarz, Baniel & Cheng 2013, *Proc R Soc B* 280). The authors say it raises the chance of returning to familiar terrain. Abstract and summaries. **Unverified.**
- **Memory of a detour is learnt slowly, and by trial.** *M. bagoti* and *C. fortis* made to shuttle past a pit trap across their route circumvented it on later trips only in part: in the preprint 0 of 30 ants on the first trial and 17 of 61 after 24 hours; in *C. fortis*, 13 of 47. Ants link the views seen a few seconds before falling in to the bad outcome (aversive trace conditioning), and a successful detour's views are then reinforced and the new route "crystallises" (Wystrach, Buehlmann, Schwarz, Cheng & Graham 2020, *Curr Biol* 30:1927; numbers from the preprint, which differs from the paper). **Unverified.**

**In the game:** the closest ant behaviour to what the game needs is **backtracking**: a lost ant that knows where it has been goes back that way. The game's version is design in two respects: it keeps the *places* and not only the *direction* (the first open question), and it is stronger than anything shown: no paper shows a point-by-point reversal of one outward walk. It has the right trigger (a carrier that has failed to find home by its vector) and the right goal (familiar ground; the hole is where the way out began). Following a wall (Bug2) stays as it is: it is what an ant does while it is between two stored places.

## 4. How fast a route is learnt

- **One trial can be enough in a model.** The mushroom-body model of Ardin, Peng, Mangan, Lagogiannis & Webb (2016, *PLoS Comput Biol* 12:e1004683) learns a route from one pass with one-shot sparse codes and stores hundreds of images, and works without retrieving the single "correct" memory. A model, not an ant. **Unverified.**
- **Learning is mostly gradual in ants.** After one learning walk *M. bagoti* could head home from 2 m but not from 4 m (Deeti & Cheng, as cited). *Melophorus* foragers stop and turn to face their origin for 150–200 ms ("lookbacks") early in a route, which Freas & Cheng propose is the moment the inbound route is learnt, and which could allow rapid learning of a route in both directions (that paper's abstract). Wood ants were given extensive experience of a food-bound route and none of the homeward one, to ask whether homeward guidance can be acquired on the way out; its result was not seen (Graham & Collett 2006, *J Exp Biol* 209:3677). Individual *Myrmecia croslandi* returned home from every direction within 10 m after scanning, from snapshots taken near the nest (Narendra, Gourmaud & Zeil 2013, *Proc R Soc B* 280:20130683). **Unverified.**
- **Trail-laying ants.** *Lasius niger* foragers, many of them, shift from the trail to orientation by memory of environmental cues, in a share independent of the trail's strength; in *Iridomyrmex (Linepithema) humilis* odour always prevails (Aron, Beckers, Deneubourg & Pasteels 1993, *Insectes Soc* 40:369). *Messor*: a displaced *M. barbarus* continued parallel to its earlier line rather than taking the shortest way (Santschi 1911, as cited by Offord et al. 2013); no direct test of route memory was found. **Unverified.**

**In the game:** the game's carrier makes **one** trip, and a route memory of its own walk out is a one-trial memory. That is stronger than what is shown for desert ants (days, several trips) and is **design**; it is the plainest way to give the game the property the biology gives its ants, that a forager that has been somewhere can get back from there. What the trail-laying game ants share with *Lasius* is that they, too, have both a trail and a memory, and use the trail only as a hint (§ the game today).

## What was not found

- Any full text: blocked by the network policy (see the header).
- An ant that reverses a whole outward walk point by point after one trip. Backtracking is a direction; route memories are learnt over trips and are one way.
- A number for how often, or how quickly, a blocked ant gives up its vector for its route, and a number for how long a pocket detour takes. **The pocket target below is design.**
- Whether wood ants' or desert ants' homeward routes are learnt on the way out (Graham & Collett 2006's result was not seen).
- A direct test of individual route memory in *Messor* or *Pogonomyrmex* (the harvester ants the game's rates come from).
- Any measure of how many trips an ant needs to learn a detour round rock: the one detour study found it rare (13 of 47; 17 of 61 after 24 h).

## The mechanic

| Cue (sensed) | Sense row | Response | Local rule (design) | Off | Retires |
|---|---|---|---|---|---|
| it walked out here: places it stored every `routeStep` cells (its own odometer) | **route memory** (new) | steering: walk back through them | recorded on the plane while not homing; kept per trip; cleared at its hole | `routeMemory` 0: nothing recorded | nothing: no scripted choice goes |
| the vector failed: no nearer its belief for `SEARCH_STALL`, or at its belief with no hole there | path integration | stop widening; retrace | once per trip; `routeMemory` 1 on a stall, 2 also at the vector's end | `#searchOn` as today | — |
| a stored place within `routeSee` (a familiar view) | route memory | jump to the earliest place it recognises | scans only its own list | — | — |

**The rule (design).**
- **Record.** On the plane, while an ant is not homing (exploring or following), it stores its own position each `routeStep` (8) cells it walks. At most `routeMax` (64) places: when full it keeps every second one and doubles its spacing. A fresh trip out of its hole (the place `odoSurf` resets) clears them.
- **Engage.** A homing ant on the plane that holds food, with a path stored, that has not yet retraced this trip, and whose belief is not its hole, starts a retrace at the vector's failure (the stall rule, or, at `routeMemory` 2, reaching its belief with nothing there). It starts from its newest place.
- **Retrace.** Its goal is its newest unvisited place; Bug2 by touch runs towards it as it does towards a believed hole. Whenever it is within `routeSee` (5) of any stored place it takes the earliest such place and its next goal is the one before: it recognises where it has been, which also cuts out the loops of its meander.
- **Ends.** The hole's sight, smell or mound smell take over at any moment (belief = the hole). When the places run out, it falls back to today's search from where it is, and does not retrace again this trip.
- **Not changed.** The vector is still where an ant that has not failed steers; the home trail still leads searchers; S1's carriers (set down with no path) never retrace.
- **Memory.** Per ant: 64 places × 2 × 4 bytes = 512 bytes (1,200 ants a colony: 0.6 MB), and about 4 bytes of state (count, spacing, the goal's index, a done flag). Saved: `SAVE_VERSION` 9, no backward compatibility. Per-tick work: one distance per ant walking out; a scan of at most 64 places per retracing ant.
- **Cost.** Steering only. No situation field, legend or question changes; Jev's cost is unchanged and a cached game spends nothing.

**Prototype (scratch, not in the repo: a copy of `colony.ts` in the session's scratchpad with this rule, `routeStep` 8, `routeSee` 5, one run per seed, not tuned).** G1 seeds 4, 5, 9, 10, 600 s; the most held at one sample, you / rival (this probe's own sampling; `main` in brackets):

| seed | off (`main`) | `routeMemory` 1 (stall only) | `routeMemory` 2 (stall and vector's end) |
|---|---|---|---|
| 4 | 34 / 8 | 5 / 1 | **4 / 2** |
| 5 | 6 / 10 | 2 / 2 | 3 / 2 |
| 9 | 8 / 2 | 5 / 1 | 3 / 3 |
| 10 | 19 / 8 | 3 / 2 | 5 / 3 |
| carrier trips over 120 s, seeds 4, 5, 9, 10 summed | 357 | 55 | 55 |
| food carried down, both colonies, the 4 seeds | 18,306 | 17,532 (−4.2 %) | 19,579 (+7.0 %) |
| births, both colonies, the 4 seeds | 2,962 | 2,891 (−2.4 %) | 2,987 (+0.8 %) |

On seed 4 the 29 pocket carriers at the worst sample go to 0–1. **The bound of 2 is not yet met** (3 to 5 at the worst sample), and single seeds' food moves a lot (the rival on seed 9: 1,416 / 1,098 / 2,086; a different game from the first change on, as in every sweep here), so seeds 1–10 are the judge, not these four. The direction is clear and the size is large: the worst colony of 34 falls to 4.

**Why this and not the others.**
- **(a) Breadcrumbs, retraced when the vector fails: recommended.** It is the one candidate measured to move seed 4, and the only one that also helps the open-ground carriers of seeds 5 and 9. It adds a sense (a place memory) the biology supports in kind (route memories beside path integration; backtracking when lost) though not in degree.
- **(b) Remember the detour solved on the way out: rejected.** It is the part of (a) between a bump and open ground. The game's outward walkers do not solve detours (an explorer wanders after a bump), so there is nothing to remember but the walk; and detours round obstacles are learnt in ants slowly and by trial (§3).
- **(c) Wall-follow on a stall instead of widening the search: kept as it is, not enough.** It has support (ants walk along a barrier and aim for the nest at its end; Bug2 is built). The scratch copy that left a wall-follower alone for up to 100 s moved seed 4 from 34 to 29 held; `ja-lp4.11`'s S1 had a 15 s version no better (90.5 % home at 600 cells). A band's far side is not reached by a vector that points through the band.
- **Not offered here:** a cognitive map of rock (no ant has one; Wehner 2006; Collett et al. 2013), and a shortest-path routine over the map (a global read: a gap, not a mechanic).

**Assays, first, with no behaviour change.**
- **R1, pocket carriers** (new, `--one r1`): on one world's default plane, find the pockets (open cells at least 15 and at most 60 cells from the hole, no clear straight line to it, the way round at least 1.8 times the straight distance, joined to the hole); clear the plane's food and put one pile in a pocket; let R1_ANTS foragers of the player walk out under their own steering (no teleporting, so each has a real path); every other ant young, no scouts. Reported: for each forager that picks up from the pocket, the time from pickup to going down its hole, the share home within 120 and 300 s, and the walked path over the geodesic. **Target (design: no paper measures a pocket detour): at least 95 % of pocket pickups home within 300 s, and a median walked ÷ geodesic of at most 4** (the retrace walks the way out, so about its length; today's outcome is the baseline to report). Literature supports the direction (an ant with a route memory reaches the nest where its vector fails: Mangan & Webb 2012; Wystrach et al. 2013), not the number.
- **S1** and the **one-world golden** are unchanged: S1's carriers are set down with no path, so they never retrace; with `routeMemory` 0 nothing is recorded.
- **G1** (the owner's bound, `ja-lp4.6.3`): at most 2 held over 120 s per colony on seeds 5 and 9 (the guard, which this un-skips if met), and on seed 4; food carried down and births within 5 % of `main`'s PRD §56/§58 numbers summed over seeds 1–10 (the baseline, since §58's levers are off). Judged by the worst seed, then confirmed on seeds 11–20.
- **The one-world assays** (`exp --one all`) against PRD §56: A1 stays 8/10, the others no worse. An ablation: `routeSee` 0 (no recognition: only the places in order) and `routeStep` 16 and 32 (a sparser memory).

## What was built

*`ja-lp4.16`, PRD §59; measured 2026-11-11 to 2026-11-14.* One world's plane only; built behind `routeMemory` and **on by default** at `routeMemory` 1, `routeStep` 4, `routeSee` 3 (`routeMax` 64). The legacy goldens are bit-exact (0 records nothing); the one-world golden was re-recorded once.

- **Code.** `homing.ts` (`routeClear`, `routeRecord`, `routeFail`, `routeTo`, `routeBelief`, called from `believePlane` and the stall rule and the vector's end in `steer.ts`), recording in `arrive.ts`, the fields in `ants.ts` (`routePlaces`, `routeN`, `routeGap`, `routeAt`, `routeState`, `routeGoal`), the parameters in `params.ts`; `SAVE_VERSION` 9. Memory: 512 bytes an ant plus about 4 bytes of state.
- **As designed, with these changes.** The recognition radius is 3, not 5, and the spacing 4, not 8: a denser memory with a tighter "familiar view" is what takes the guard's seeds under the bound. `routeMemory` 1 (on a stall only) is on, not 2: 2 had a worse worst seed (7 on seed 4; 15 on seed 7 with step 4) for a little more food.
- **R1** (`--one r1`): with it on, all six seeds with a pocket pass (100 % home within 300 s, walked ÷ way round at most 1.70); off, 3 of 6 on today's `main` (seeds 3 and 4 at 22.5 and 45 % at the baseline).
- **G1** (seeds 1-10): worst colony per seed 33 to 5, sum 193 to 27; seeds 4, 5 and 9 at 2 / 1, 2 / 1 and 2 / 1, so the guard is un-skipped; food carried down +3.5 % and births +3.8 % against §58's numbers (seeds 11-20: worst 141 to 7, food -2.2 %, births -3.5 % against `main`). Table and sweep in PRD §59. Seeds 6, 7 and 8 still reach 4, 5 and 4 at the worst sample.
- **The assays:** A1 10/10 (8 off), A9 5/10 (3 off), A2b and A4 one seed down each (8 and 9 of 10); S1 unchanged. The tick is within noise.
- **Not built:** a fungus lever over `routeSee`; the direction-only backtrack (Wystrach et al. 2013) as an alternative. The owner's call.

## Play

- **See:** a carrier that has gone a long way and cannot get home by its vector no longer wanders along a rock wall in jerks. It stops, turns, and walks back out the way it came, along a line of its own earlier places, round the band's end, and then in to its hole once it is near the mound. Fewer ants sit against a rock face with food in their jaws for minutes. A Learn entry ("Route memory") explains what the ant keeps (its own way out) and what real ants do (backtrack; route memories beside path integration).
- **Choose:** none now: groundwork for U6b's baselines. A fungus lever could reach it later: a host with a damped home perception (the fungus's home gain) could recognise its places less (`routeSee` scaled by the gain), which would make the fungus's blunting of the senses matter to a lost carrier. That is **not built** and is the owner's call.
- **Counterplay and progression:** none added; no lever, nothing unlocked. The weak start and the counterplay are unchanged.
- **Pace:** it shows in the first minutes of a game on a map with a rock band, as soon as the first long trips come back; a carrier's retrace is tens of seconds.
- **Cost:** none in Jev (steering only), and a cached game still spends nothing. About 0.6 MB of memory a colony; a tick no slower within noise is the gate (`colony-bench --one --page` against `ja-lp4.6.7`'s 10.6–10.8 ms).
- **Risks:** a colony whose carriers all retrace the same way and mill on a trail (one retrace a trip bounds it; the one-world assays A1 and A3 are the check, and a count of retraces ended without home); a retrace that walks a carrier away from a closer hole (it retraces its own way out, whose start is its own hole); food falling because carriers walk the way out rather than the shorter way (G1's food and births within 5 % are the check, and a retrace's length over its geodesic); the prototype's rival-seed swings being noise or a cost (seeds 1–10 and 11–20 decide).
- **Owner decisions needed:** below.

## Open questions

- **Owner:** keep route memory as a **design** stand-in (a stored place recognised within `routeSee`, for a familiar view; one trial; the whole way out)? The alternative that sits nearer the biology is a direction only (backtrack along the compass heading opposite to the last stretch walked, Wystrach et al. 2013): it needs no places but cannot go round a band. The prototype above rests on places.
- **Owner:** `routeMemory` 2 (also at the vector's end) or 1 (blocked only)? The prototype favours 2 by food (+7.0 % against −4.2 %) and by seeds 5 and 9 (3/3 against 2/2 and 5/1: not clear); the build decides on seeds 1–10.
- **Owner:** the G1 bound of 2 with these numbers (3 to 5 at the worst sample on the four seeds, before tuning): tune `routeStep` and `routeSee`, or add `ja-lp4.15`'s `planePatience` (off, costs food), or keep the bound and the skipped guard.
- **To measure:** R1's baseline; how many retraces end at the hole against run out of places; the tick; the effect of `routeStep` 4 to 32 and `routeSee` 3 to 8.
- **To read when the network allows:** the full texts of Wystrach et al. 2013 (backtracking), Mangan & Webb 2012, Collett et al. 2013, Wehner et al. 2006, Graham & Collett 2006 and Wystrach et al. 2020.

## Sources

- Collett M, Chittka L, Collett TS (2013). Spatial memory in insect navigation. *Curr Biol* 23:R789–R800. [Sussex copy](https://www.sussex.ac.uk/lifesci/insectnavigation/documents/collettchittkacollett-currbiolreview2013.pdf)
- Collett TS (2010). How desert ants use a visual landmark for guidance along a habitual route. *PNAS* 107:11638–11643. [PMC2895085](https://pmc.ncbi.nlm.nih.gov/articles/PMC2895085)
- Collett TS, Collett M, Bisch S, Wehner R (1998). Local and global vectors in desert ant navigation. *Nature* 394. [ideas.repec.org (record)](https://ideas.repec.org/a/nat/nature/v394y1998i6690d10.1038_28378.html)
- Mangan M, Webb B (2012). Spontaneous formation of multiple routes in individual desert ants (*Cataglyphis velox*). *Behav Ecol* 23:944–954. [ideas.repec.org (record)](https://ideas.repec.org/a/oup/beheco/v23y2012i5p944-954..html)
- Wehner R, Boyer M, Loertscher F, Sommer S, Menzi U (2006). Ant navigation: one-way routes rather than maps. *Curr Biol* 16:75–79. [imls.uzh.ch](https://www.imls.uzh.ch/static/CMS_publications/wehner/literatur/pdf06/wehner20065.pdf)
- Wystrach A, Mangan M, Webb B (2015). Optimal cue integration in ants. *Proc R Soc B* 282:20151484. [PMC4614770](https://pmc.ncbi.nlm.nih.gov/articles/PMC4614770)
- Legge ELG, Wystrach A, Spetch ML, Cheng K (2014). Combining sky and earth: desert ants (*Melophorus bagoti*) show weighted integration of celestial and terrestrial cues. *J Exp Biol* 217:4159–4166. [zendy.io (record)](https://zendy.io/pdf-viewer/10.1242/jeb.107862)
- Freas CA, Cheng K (2018). Limits of vector calibration in the Australian desert ant, *Melophorus bagoti*. *Insectes Soc* 65:141–152. [Macquarie record](https://researchers.mq.edu.au/en/publications/vector-calibration-in-australian-desert-ants-imelophorus-bagotii-/)
- Wystrach A, Schwarz S, Baniel A, Cheng K (2013). Backtracking behaviour in lost ants: an additional strategy in their navigational toolkit. *Proc R Soc B* 280. [PMC3768313](https://pmc.ncbi.nlm.nih.gov/articles/PMC3768313)
- Wystrach A, Buehlmann C, Schwarz S, Cheng K, Graham P (2020). Rapid aversive and memory trace learning during route navigation in desert ants. *Curr Biol* 30:1927–1933. [preprint](https://www.biorxiv.org/content/10.1101/771204.full.pdf)
- Schmidt I, Collett TS, Dillier F-X, Wehner R (1992). How desert ants cope with enforced detours on their way home. *J Comp Physiol A* 171:285–288 (authors from memory). [doi:10.1007/BF00223958](https://link.springer.com/article/10.1007/BF00223958)
- The guidance of desert ants by extended landmarks (2001). *J Exp Biol* 204:1635 (authors not seen). [JEB](https://cob.silverchair.com/jeb/article-split/204/9/1635/8838/The-guidance-of-desert-ants-by-extended-landmarks)
- Ardin P, Peng F, Mangan M, Lagogiannis K, Webb B (2016). Using an insect mushroom body circuit to encode route memory in complex natural environments. *PLoS Comput Biol* 12:e1004683. [PMC4750948](https://pmc.ncbi.nlm.nih.gov/articles/PMC4750948)
- Graham P, Collett TS (2006). Bi-directional route learning in wood ants. *J Exp Biol* 209:3677. [JEB](https://cob.silverchair.com/jeb/article/209/18/3677/16136/Bi-directional-route-learning-in-wood-ants)
- Narendra A, Gourmaud S, Zeil J (2013). Mapping the navigational knowledge of individually foraging ants, *Myrmecia croslandi*. *Proc R Soc B* 280:20130683. [ANU record](https://researchportalplus.anu.edu.au/en/publications/mapping-the-navigational-knowledge-of-individually-foraging-ants-/)
- Aron S, Beckers R, Deneubourg JL, Pasteels JM (1993). Memory and chemical communication in the orientation of two mass-recruiting ant species. *Insectes Soc* 40:369–380. [doi:10.1007/BF01253900](https://link.springer.com/doi/10.1007/BF01253900)
- Freas C, Cheng K and colleagues. Visual learning, route formation and the choreography of looking back in desert ants, *Melophorus bagoti* (authors and year not seen; the lookbacks come from a search result's abstract). [Macquarie record](https://researchers.mq.edu.au/en/publications/visual-learning-route-formation-and-the-choreography-of-looking-b/)
- Offord J, Reda F, Mateevitsi V (2013). *Messor cephalotes* navigation, on and off trails (Santschi's 1911 *M. barbarus* result as cited there). *(secondary: a search result; the paper's own abstract was not seen)* [evl.uic.edu](https://www.evl.uic.edu/documents/springer_antkenya_paper_8-13.pdf)
