# Home is a nest, not a point

*Design note, 2026-11-01. It builds on the side view (PRD §18, MR 13–15). This note is design only: the slices at the end are filed as beads, and nothing here is built yet.*

The owner asked: *where is the "home" signal for ants? Is it a queen thing? Are there structures or specialised spaces? We tested the home as a disc, but that isn't realistic underground, and the ant-farm view breaks it.*

The short answer:
- **Home is not one signal, and it is not the queen's scent.** Outside the nest, home is the entrance. An ant finds it with a step-counting home vector that drifts, corrected by landmarks and the smell around the entrance.
- **Inside, in the dark,** ants find their way by **gravity**, by memory of places, and by **chemical marks on the floor**. Each chamber has its own smell.
- **The queen's pheromone tells workers where she is**, so they gather round her and bring brood to her. It is one destination among several, not "home".
- **A nest is shafts and chambers, and the chambers have jobs:** brood, queen, food stores, reception at the top, refuse. Who works where shifts with age.

## 1. What real ants do

### Outside: home is the hole
- **Path integration.** A forager keeps a running home vector from its steps and a sky compass. It points to the nest entrance, and its error grows with distance walked: roughly 10 % of distance and a couple of degrees of heading ([Wehner 2006](https://www.imls.uzh.ch/static/CMS_publications/wehner/literatur/pdf06/wehner20062.pdf); [*Cataglyphis noda*, PMC5966506](https://pmc.ncbi.nlm.nih.gov/articles/PMC5966506)).
- **Landmarks correct the drift.** These include visual landmarks, ground texture, and an **odour at the entrance** that ants learn and can pick out of a blend ([Audubon](https://audubon.org/news/desert-ants-use-odors-find-their-way-home)).
- **The vector resets to zero only inside the nest** ([s00359-018-1260-6](https://link.springer.com/article/10.1007/s00359-018-1260-6)).

So outside, "home" is a small hole that the ant finds approximately and then homes in on by local cues.

### Inside: gravity, memory and road signs
- **Ants in the dark nest use three independent sources** ([Heyman et al. 2017, *Nat. Commun.*](https://www.nature.com/articles/ncomms15414); [PMC5461491](https://pmc.ncbi.nlm.nih.gov/articles/PMC5461491)):
  1. **gravity**;
  2. **self-referenced memories** of several places;
  3. **chemical "road signs"** that ants lay on the floor at decision points.
- **Floor chemistry differs by chamber,** so a chamber's role can be read from its smell (*Camponotus fellah*). No light reaches inside, and there is no vector straight to "the nest" through the soil.

### The queen
- **Queen pheromone draws workers to her** so they can tend and rescue her. A fire-ant queen exposed outside is surrounded within moments, workers move brood to her, and they lay a trail to her ([Berton et al. 1991](https://dictionnaire-amoureux-des-fourmis.fr/Publications/Berton-et-al-IS1991.pdf)). In the pharaoh ant the queen pheromone is also the retinue signal.
- **Queenright workers stay with the brood;** queenless workers drift away from it.

The queen's scent is a destination ("where she is"), not the colony's home signal.

### Nest structure
- **Shafts and chambers.** A subterranean nest is descending shafts with horizontal chambers off them: Tschinkel's "shish-kebab" unit, common to most ground-nesting ants ([Myrmecol. News 2018](https://www.bio.fsu.edu/Tschinkel/3%20Nest%20subdivision%20in%20fire%20ants,%20Myrmec.%20News%202018.pdf)).
- **Chamber geometry** in *Pogonomyrmex badius* ([PMC528881](https://pmc.ncbi.nlm.nih.gov/articles/PMC528881)):
  - chambers are about 1 cm high whatever their area;
  - they are largest near the top and shrink with depth;
  - the vertical gap between chambers grows with depth.
  - Nests grow by deepening, by adding chambers and shafts, and by widening existing chambers.
- **Floor space tracks workers:** about 2 cm² of chamber floor per worker in *Odontomachus brunneus*, whatever the nest size ([J. Insect Sci. 10:64](https://bioone.org/journals/journal-of-insect-science/volume-10/issue-64/031.010.6401/The-Nest-Architecture-of-the-Ant-Odontomachus-brunneus/10.1673/031.010.6401.short)).
- **What templates digging:**
  - **Not CO₂.** Venting the soil gradient changed neither the architecture nor where workers sat ([PMC3610692](https://pmc.ncbi.nlm.nih.gov/articles/PMC3610692)).
  - **Brood does.** In leaf-cutters, a site with brood is dug more, and rounder, into a chamber ([Römer & Roces, Würzburg](https://opus.bibliothek.uni-wuerzburg.de/solrsearch/index/search/searchtype/authorsearch/author/Daniela+R%C3%B6mer)).

### Places with jobs
- **Zoned by age.** The youngest workers sit deep with the queen and brood. They move up as they age, and only the oldest forage, from the top chambers ([Tschinkel, J. Insect Sci. 4:21](https://bioone.org/journals/journal-of-insect-science/volume-4/issue-21)).
- **Brood is moved** up and down to the best temperature (*Pogonomyrmex salinus*: [Boise State](https://scholarworks.boisestate.edu/bio_facpubs/308)).
- **Food goes in at the top and is stored deep.** Harvester foragers drop seeds only in the topmost chambers, and other workers carry them down to granaries 20–80 cm deep ([Tschinkel & Kwapich 2016](https://keep.lib.asu.edu/system/files/c160/Florida_Harvester_Ant_2016.pdf)).
- **Refuse goes to a midden.** It is at the edge of the cleared disc in harvesters ([AntWiki, *The Ants* ch. 18](https://antwiki.org/wiki/The_Ants_Chapter_18)), and the midden also deters other ants, acting as a boundary ([CiNii](https://cir.nii.ac.jp/crid/1362544420347763584)). It is in deep chambers in *Atta cephalotes* and on the surface in *A. colombica*.

### Losing the queen
In a single-queen species, losing the queen means **no more workers are ever made**. Within 1–4 weeks dominant workers start laying male eggs, and the colony's workers and brood dwindle. Orphaned *Temnothorax* colonies can still make males for years ([Queen execution in a monogynous ant, PMC7882922](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7882922/); [BMC Evol. Biol.](https://link.springer.com/content/pdf/10.1186/s12862-018-1320-0.pdf)). Species with several queens keep going, and some adopt queens.

**So the realistic answer for the game:** losing the queen *dooms* a colony; it doesn't end it on the spot.

## 2. What the sim does today, and why it breaks

On the side-view branch (`ccr-f8368183-i7kj76-mr15`):

| Today | Where | Why it isn't real |
|---|---|---|
| The nest is one disc, `Nest {x, y, r: 3}`, pre-dug 14 rows down with a shaft to an `entrance` | `world.ts:29`, `digNest` `world.ts:764` | Real nests are many chambers, dug by the ants |
| Underground, a homing ant steers by the **exact, noise-free vector to the chamber centre** (`toNest`), with Bug2 wall-following toward it | `colony.ts:1227`, `colony.ts:1260` | No ant knows where the chamber is through solid soil, and real path integration resets inside the nest |
| On the walkway it homes column by column to the hole; pellet carriers home to the entrance | `#goal` `colony.ts:846` | Right in spirit: home is the hole. But the vector is exact |
| A sensor inside the disc reads `SEEN = 100` for home: a beacon | `colony.ts:521` | Fine as "I am home", but it is the only place with an identity |
| One home field, laid by every ant that isn't carrying, stronger the sooner it has been home | `colony.ts:1390` | One scent for everything: it cannot say "brood this way" or "store that way" |
| Food home is the `stored` / `larder` scalars; every 4 food makes an ant, born in the disc | `colony.ts:1574`, `colony.ts:1589`, `#place` `colony.ts:351` | No food anywhere on the map, no queen, no brood |
| No down | (none) | Gravity is the one cue every ant has underground |

The mound (MR 14–15) already matches the biology: spoil carried out, an angle of repose, and a disc that scales with nest volume.

## 3. The model

The side view keeps its entrance, shaft, walkway and mound. The founding chamber becomes the **royal chamber**, and the rest is dug.

1. **Gravity and a noisy vector.**
   - **Down is a sense:** each ant knows which way is up.
   - **On the surface,** homing ants keep a home vector to *their entrance* with error that grows with distance walked. The entrance odour and the hole itself (already `SEEN`-like) pull them in. The vector **resets in the shaft**.
   - **Underground there is no vector to the chamber.** An ant homes by gravity (going in means going down), by the road signs below, and by memory of the last junction it passed.
2. **Chambers that ants dig.** A chamber is a widening off a shaft, about 1 row high and wide in the side view. Excavation is:
   - **regulated by crowding:** dig while floor per worker is below a target, so `ja-wii` is folded in here;
   - **drawn to brood:** a chamber grows where brood lies.

   The depth profile should come out top-heavy, with gaps between chambers growing with depth. That is the check against Tschinkel.
3. **Roles and road signs.**
   - Each chamber has a role:
     - **royal:** the queen and eggs; the founding chamber;
     - **brood:** larvae and pupae;
     - **store:** deep, a granary;
     - **reception:** top, where foragers drop food;
     - **midden:** refuse.
   - Workers in a chamber lay its role's mark on the floor, and junctions keep a mark of what lies down each branch.
   - Inside the nest, these marks replace the single home field: an ant heading somewhere follows the mark of where it is going.
4. **The queen and brood.**
   - The queen sits in the royal chamber and lays eggs at a rate fed by food brought to her.
   - Eggs become larvae, then pupae, then workers. Larvae must be fed: food is carried to them.
   - The queen's pheromone draws nurses to the royal chamber. Nurses carry brood to her and to the brood chambers, and move brood with depth.
   - **Ants are born from pupae, not from the larder counter.**
5. **Zoned by age.** Each ant has an age. The young nurse deep, middle-aged ants dig and carry inside, and the old forage. Age is a perception and assignment input (castes, `ja-jhd`, build on it).
6. **Food flow.** Foragers drop food at **reception**. Inside workers carry it down to **store**, and from store to **brood** and the queen. `stored` / `larder` become food lying in chambers, which the map shows.
7. **The midden.** Refuse (corpses; later, spent fungus garden) is carried to a midden: by default at the edge of the mound, deep in some species. A midden marks a boundary to other colonies.

### Queen loss
When the queen dies, the colony is **orphaned**:
- no new workers;
- brood in progress finishes;
- the workers age and die off.

*Fallen* stays "no workers left". *Orphaned* is shown as a state (a banner and the stats), not an ending. Several queens, adopting queens and pleometrosis are per-species options (MR 8 species framework, `ja-8fd`; queens and lineage, `ja-1vg`).

**A path to unification (speculative, to design in MR 8):** in some multi-queen species, workers can join or adopt from a neighbour. An orphaned colony merging into a neighbour it tolerates (same odour, via Garden) is a unification route grounded in biology. It is also a hard, lethal, strain-gated fungus play: infect the queen.

## 4. What the fungus touches

The fungus milestone (PR #7, on `main`) is not yet on this stack. Slice 0 below merges it.

Then the nest gives the fungus new levers, each with a basis:
- **Chamber marks are perception** (§16's gains, per channel). A host misreads a *brood* mark as *store*, or loses the *royal* mark. The nest equivalent of "roam".
- **Ground** becomes a host's place in the nest:
  - **chamber role**, own colony's;
  - **own tunnel**;
  - **surface**;
  - **foreign** (another colony's nest).

  This replaces the home-field ratio (`fungus.ts`, ground).
- **Queen and brood infection.** Lethal or sterilising, strain-gated, and on the menu off by default, like cull. A queen infection orphans the colony.
- **The midden** is where infected corpses go: hygiene that clears the fungus or, for a strain that sporulates there, spreads it (*Escovopsis*-like).
- **Nest odour** (recognition) drifts toward the ants in the royal chamber, not those in a disc.
- `FUNGUS_BRAIN_VERSION` bumps when the fungal situation's `ground` changes.

## 5. Jev cost

The ant's situation changes inside the nest: `homeTrail` is replaced, inside the nest, by the mark of where it is going, with values *none / reception / brood / royal / store / midden* and their strength, plus `down` for the gravity sense.
- Today's estimate is about **235 input tokens per ant situation** (`TOKENS_PER_SITUATION` on this branch). A situation is mode × tired × the food, home and alarm trail levels × enemy × stance.
- The new field adds about 6 roles × 3 levels in place of homeTrail's 4 levels. Expect around +10–20 tokens per situation (the legend grows), and more distinct situations per game.
- Measure both in slice 3 before merging (CLAUDE.md: tokens per ant go in the PR).

## 6. Tests that pin the disc

What each becomes:
- **`tests/side.test.ts`:**
  - homing to the entrance stays;
  - "down to the chamber" becomes "down to the royal chamber by gravity and marks, with no vector";
  - the world test checks the founding chamber is the royal one.
- **`tests/colony.test.ts`:**
  - top-down homing tests (Bug2, walls, tunnels) stay on the top-down test maps: there the nest is a disc entrance at ground level;
  - `stored` counts become food in reception and stores.
- **`tests/game.test.ts`:** the larder-to-ants test becomes queen to egg to pupa to ant; `fallen` / orphaned.
- **`tests/mound.test.ts`, `tests/backfill.test.ts`:** unchanged. Backfill must not fill a chamber that has a role.
- **On `main` (after slice 0):** recognition's nest-odour drift test, and the fungus `ground` tests.

The open surface map (from above) keeps the disc as its entrance, so earlier PRD numbers still reproduce.

## 7. Slices

Each is a bead under the epic. Each measures something before it merges.

| # | Slice | Measures |
|---|---|---|
| 0 | Merge the fungus milestone (`main`, PR #7) into the side-view stack | all tests; the open-map numbers unchanged |
| 1 | Gravity and a noisy home vector; no vector to the chamber underground | homing success and stuck share against `ja-cwu`, `ja-ipu` |
| 2 | Ants dig chambers off shafts, regulated by crowding and drawn to brood (folds in `ja-wii`) | floor per worker; depth profile against Tschinkel |
| 3 | Chamber roles and road signs; the situation's in-nest field | tokens per ant; situations per game |
| 4 | Queen and brood; birth from pupae; queen loss orphans the colony | growth curve against today's larder; orphan decline |
| 5 | Food flow: reception, store, brood | food home; trips per food |
| 6 | Age and zoning (prerequisite for castes, `ja-jhd`) | where ants are by age |
| 7 | The midden | corpses cleared; boundary effect on raids |
| 8 | The fungus on the new home: chamber-mark levers, nest `ground`, queen and brood infection | unity and deaths against PRD §22 |
| 9 | Design for MR 8: several queens, adoption, an orphaned colony merging (a unification route) | design note |
