# Forager trips: what keeps a forager's way home short

*Research note for `ja-lp4.15` (one world, for `ja-lp4.6.3`; PRD §57). Written 2026-11-11 against code at `89f8dee`. **No paper was read in full text.** Every publisher and repository host tried was refused (proxy 403, or DNS for `www.imls.uzh.ch`, `doc.rero.ch`, `cob.silverchair.com`, `openresearch-repository.anu.edu.au`). Every claim below comes from abstracts, database records and citing papers seen in search results, so all of it is **unverified**. The rules are **design**. It builds on [tiredness](tiredness.md) (what ends a trip; rest between bouts) and [nest-search](nest-search.md) (the search for the hole) and does not repeat them.*

## The question

What limits how long and how winding a forager's walk is before it heads home, and how do real foragers keep their trips short and straight?

## What the game does today

On one world's plane, a homing ant steers by a drifting home vector. Each trip draws one drift per axis (`driftSurf`, `driftSurfY`, σ = `PI_DRIFT_2D` = 0.1/√2), and the error is that drift × `odoSurf`, the cells walked out. So the error grows in proportion to the path walked, winding or not. A forager searching with empty jaws tires after `patience` (60 s, scaled by the fungus's `clock`), then goes home (`fatigue`, MR 3.1).

G1 (600 + 600 ants, 600 s) fails its bound of 2 foragers holding food over 120 s on every seed, even with the mound's smell (PRD §56). A probe on seeds 5 and 10 (300 s, each food pickup on the plane) shows why:

| pickups | n (seed 10, c0 / c1) | cells walked | from the hole | walked ÷ from the hole | exploring before food | following a trail before food |
|---|---|---|---|---|---|---|
| all | 1,171 / 1,443 | 129 / 93 | 38 / 67 | 3.1 / 1.3 | 6 s / 2 s | 10 s / 11 s |
| held over 120 s | 43 / 20 | 375 / 343 | 61 / 66 | 6.7 / 4.8 | 32 s / 46 s | 19 s / 6 s |

Seed 5 is the same (held: 337 and 349 cells walked, 4.9 and 2.7 times the distance from the hole). The lost carriers found food no farther away than anyone else. They had searched for 30–50 s before they found it, so their path was 5–7 times their distance from home, and their error grew with it.

Cutting the search time measures the lever (G1, seeds 5 and 9, both colonies):

| `patience` | worst colony, seed 5 | worst, seed 9 | food carried down, seed 5 (you / rival) | seed 9 | births, seed 5 | seed 9 |
|---|---|---|---|---|---|---|
| 60 (shipped) | 10 | 7 | 2,582 / 1,709 | 2,785 / 1,416 | 472 / 390 | 350 / 299 |
| 40 | 2 | 5 | 2,456 / 1,586 | 2,691 / 951 | 402 / 359 | 332 / 228 |
| 30 | 2 | 0 | 2,251 / 1,566 | 2,588 / 948 | 380 / 360 | 312 / 224 |
| 20 | 1 | 0 | 2,018 / 1,568 | 1,905 / 740 | 345 / 333 | 301 / 176 |

At 30 s G1 meets its bound on both seeds, but births fall 8–25 % a colony and the rival's food on seed 9 by a third.

## 1. A trip ends on search time

- In the red harvester ant, *Pogonomyrmex barbatus*, a forager walks quickly up to about 20 m, searches alone, and goes straight home when it finds a seed. How long the trip lasts depends on how long it searched, not on how far away the seed was (Beverly et al. 2009, *Behav Ecol* 20:633; Gordon & Kulig 1996, as cited). **Unverified.**
- *Melophorus bagoti*: most foraging runs last under 1 h and cover under 20 m (Muser, Sommer, Wolf & Wehner 2005, *Aust J Zool* 53:301). **Unverified.**
- *Cataglyphis fortis* on a salt pan: GPS-tracked trips of 32–1,238 m (Buehlmann et al. 2014, *Curr Biol*). These are open, food-poor flats. **Unverified.**

**In the game:** a trip already ends on search time (`fatigue` against `patience`). One world's plane needs a shorter limit than the side view's, because its error grows with every cell walked. It stays a time, read from the ant's own body. A plane-only factor on `patience` (`planePatience`, 1 = today) keeps the side view and top-down bit-exact, and the fungus's `clock` lever still scales it.

## 2. The ant reads its uncertainty from its vector's length, not its path

- Ants that walked the same nest-to-food distance with more or less winding searched equally wide for the nest: search width follows the home vector's length, not the path walked (Merkle & Wehner 2010, *Behav Ecol* 21:349; Merkle, Knaden & Wehner 2006, *J Exp Biol* 209:3545). **Unverified.**
- Ants weight their path integration more as the home vector gets longer. When they walked about 10 m without lengthening the vector, they behaved as the vector's length predicts (Wystrach, Mangan & Webb 2015, *Proc R Soc B* 282:20151484). **Unverified.**
- The systematic errors that are measured come from distance (the odometer undershoots, more so on long runs: Sommer & Wehner 2004, *J Comp Physiol A* 190:1) and from sharp turns (Müller & Wehner 1988, *PNAS* 85:5287). Neither gives a random error per metre walked. **Unverified.**
- Theory: heading noise that is independent from step to step gives a position error growing with the square root of the steps (from memory; not fetched). Without an external compass an animal cannot get far from home at all (Cheung et al. 2007, *Biol Cybern* 97:47). **Unverified.**

**In the game:** the game's error grows in proportion to cells walked (one drift a trip × `odoSurf`). That is harsher on a winding search than a random walk (√ of cells) and harsher than what the ant itself expects (its vector's length). Changing the error law is a tuning question for the owner, not part of this mechanic: it would move every one-world measurement. This note records it as open.

## 3. Foragers go back to where they last found food

- *Cataglyphis* strongly tends to head the same way after a successful run. After a failed run, how many earlier successes it had in that sector decides whether it stays there (Buchkremer & Reinhold 2008, *Behav Ecol* 19:984). **Unverified.**
- One rewarded visit is enough: on the next trip the ant searches centred on where the feeder was, even after it has been removed. Whether it returns depends first on how much food it found, then on how reliable the site has been (Wolf, Wittlinger & Bolek 2012, *Front Neurosci* 6:102). **Unverified.**
- The ant keeps only its most recent food vector, without averaging over trips. The memory is noisier after 24 h (Cheng, Narendra & Wehner 2006, *Behav Ecol* 17:227). **Unverified.**
- Harvester ants return to where they last found a seed, so a forager at a rich patch makes many short trips (Beverly et al. 2009). **Unverified.**
- No give-up time at an empty food site was found.

**In the game:** a forager on the plane that picks up food remembers where, as its own vector at that moment (where it believes the food is relative to its hole, drift and all). On its next trip out it walks that vector straight, and searches round the spot when it gets there. A trail it meets still takes over, as today. The memory is forgotten when the ant tires there without finding food, or replaced by its next find. It is path integration, already a sense (vision.md), kept one trip longer. No new situation field and no Jev cost: it is steering on the way out.

## 4. New foragers start close

- *C. fortis* novices make learning walks that start within centimetres of the entrance and widen, 3–7 of them over 2–3 days, before foraging (Fleischmann et al. 2016, *J Exp Biol* 219:3137). In *Melophorus* foraging distance grows with experience (Muser et al. 2005). **Unverified.**

**In the game:** not built here. A schedule of first trips would be design, and the probe shows the lost carriers are not the young.

## What was not found

- A random path-integration error per metre walked, or a cap on trip length set by homing error.
- A time to abandon an empty food site.
- Shorter ranging on overcast days or with unreliable homing.
- Any forager that gives up its search for food when its vector or odometer reaches a length. Giving up by vector length would be **design**.

## The mechanic

| Finding | Cue (sense) | Response | Local rule ("off" = today) |
|---|---|---|---|
| Trips end on search time (§1) | own fatigue (own body) | go home tired | on the plane, tired at `patience × planePatience`; `planePatience` 1 = today |
| Go back to the last find (§3) | own food vector (path integration, kept one trip) | steer out along it, search round it | `siteFidelity` 0 = today; forget on tiring there or on the next find |

- **One world only** (`line !== null`, on the plane), so the side-view and top-down goldens stay bit-exact.
- **New saved state:** the food vector per ant (`foodX`, `foodY`, or NaN). Save version bumped once.
- **Order:** the shorter limit meets G1 and costs food; site fidelity is meant to win the food back with short, straight trips to known spots.

**Assays:**
- **F1, site fidelity** (new, `--one f1`): a forager set down after a find at a known spot 40–80 cells from its hole, then sent out again. Targets: with `siteFidelity` on, at least 80 % reach the spot's sight within 30 s, with a walked-to-straight ratio under 1.5 (off: the share exploring finds it by chance).
- **G1** seeds 1–10: at most 2 a colony on seeds 5 and 9 (the guard), and on as many other seeds as can be had. Food carried down and births no more than 5 % below the shipped default, summed over seeds 1–10.
- **The one-world assays** (`exp --one all`) against PRD §56: A1 stays 8/10, the others no worse.

## Play

- **See:** foragers fan out each to its own patch and come back to it trip after trip, short straight lines between the hole and the food. Fewer ants wander far holding food. Learn's "Forager trips" entry explains both.
- **Choose:** the fungus's "time out" lever (`clock`) matters more on the plane: lengthening it sends hosts on longer, riskier searches; shortening it keeps them close. Site fidelity makes a host's route predictable, so spores dropped along a known route reach the same ants again.
- **Progression:** no new lever and nothing unlocked; the weak start and the counterplay are unchanged.
- **Cost:** none. Both are local rules over the ant's own body and vector: no situation field, legend or question changes, and a cached game still spends nothing.
- **Risks:** a colony that sends every forager back to a spent patch (forgetting on tiring there bounds it); a shorter search that starves a colony on a poor map (G1's births and food are the check); the rival losing more than the player (both colonies are reported).

## Open questions

- The error law: proportional to cells walked (today) or to their square root (a random walk). Owner's call, not this mechanic's.
- `planePatience`: 0.5 (30 s) met G1 on seeds 5 and 9; the build sweeps it with fidelity on.
- Whether site fidelity shares the nest's departures with the activation gate (ja-web) or bypasses it: the build keeps the gate.
- The full texts to read when the network allows: Merkle & Wehner 2010, Wolf et al. 2012, Cheng et al. 2006, Beverly et al. 2009.

## Sources

- Beverly BD, McLendon H, Nacu S, Holmes S, Gordon DM 2009. How site fidelity leads to individual differences in the foraging activity of harvester ants. *Behav Ecol* 20:633–638. https://ideas.repec.org/a/oup/beheco/v20y2009i3p633-638.html
- Muser B, Sommer S, Wolf H, Wehner R 2005. Foraging ecology of the thermophilic Australian desert ant, *Melophorus bagoti*. *Aust J Zool* 53:301–311. https://publish.csiro.au/ZO/ZO05023
- Buehlmann C, Graham P, Hansson BS, Knaden M 2014. Desert ants locate food by combining high sensitivity to food odors with extensive crosswind runs. *Curr Biol*. https://www.sussex.ac.uk/lifesci/insectnavigation/documents/buehlmann-et-al-2014-currbiol.pdf
- Merkle T, Wehner R 2010. Desert ants use foraging distance to adapt the nest search to the uncertainty of the path integrator. *Behav Ecol* 21:349–355. https://ideas.repec.org/a/oup/beheco/v21y2010i2p349-355.html
- Merkle T, Knaden M, Wehner R 2006. Uncertainty about nest position influences systematic search strategies in desert ants. *J Exp Biol* 209:3545–3549. https://cob.silverchair.com/jeb/article-pdf/209/18/3545/1256157/3545.pdf
- Wystrach A, Mangan M, Webb B 2015. Optimal cue integration in ants. *Proc R Soc B* 282:20151484. https://pmc.ncbi.nlm.nih.gov/articles/PMC4614770
- Sommer S, Wehner R 2004. The ant's estimation of distance travelled. *J Comp Physiol A* 190:1–6. https://doc.rero.ch/record/322067
- Müller M, Wehner R 1988. Path integration in desert ants, *Cataglyphis fortis*. *PNAS* 85:5287–5290. https://pmc.ncbi.nlm.nih.gov/articles/PMC281735
- Cheung A, Zhang S, Stricker C, Srinivasan MV 2007. Animal navigation: the difficulty of moving in a straight line. *Biol Cybern* 97:47–61. https://researchportalplus.anu.edu.au/en/publications/animal-navigation-the-difficulty-of-moving-in-a-straight-line/
- Buchkremer EM, Reinhold K 2008. Sector fidelity: an advantageous foraging behavior. *Behav Ecol* 19:984–989. https://ideas.repec.org/a/oup/beheco/v19y2008i5p984-989.html
- Wolf H, Wittlinger M, Bolek S 2012. Re-visiting of plentiful food sources and food search strategies in desert ants. *Front Neurosci* 6:102. https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2012.00102/full
- Cheng K, Narendra A, Wehner R 2006. Behavioral ecology of odometric memories in desert ants. *Behav Ecol* 17:227–235. https://ideas.repec.org/a/oup/beheco/v17y2006i2p227-235.html
- Fleischmann PN, Christian M, Müller VL, Rössler W, Wehner R 2016. Ontogeny of learning walks and the acquisition of landmark information in desert ants. *J Exp Biol* 219:3137. https://opus.bibliothek.uni-wuerzburg.de/files/15995/Fleischmann_Pauline_Starting_foraging_life.pdf
