# Endless world: chunks from the seed, many lines, far ground frozen

*Design note, 2026-11-13, epic `ja-qpv` (MR 9). Nothing here is built. It answers the owner's request (2026-11-13) to start on an endless world, and builds on [one-world](one-world.md), whose model it extends. Decisions: PRD §65. Code references are to `web/src/` on 2026-11-13.*

## TL;DR

- **The world is the seed plus what the game changed.** Every chunk can be generated alone, in any order, from `(seed, chunk)`. What ants change (dug cells, food taken, spoil, chambers, marks) is kept per chunk as a delta. Scent is never kept once it fades.
- **Many lines** (owner, 2026-11-13). Underground stays a curtain under a line through holes ([one-world §2](one-world.md#2-the-model-a-plane-and-a-curtain)), but the world holds as many lines as it needs. A founding near a line's end grows that line by today's rule. A colony far from every line starts a new one.
- **Far ground is frozen** (owner, 2026-11-13). Only ground near something awake is stepped and stored in full. A wild colony out there is a point on the map until something awake comes near. Then it wakes, generated mature from its own seed.
- **Wild colonies** come from a pure lattice of sites, sparser than real harvester-ant fields ([nest-spacing §1](nest-spacing.md#1-how-far-apart-mature-nests-are)), so the player's colonies have room to found.
- **Cost** is CPU and memory, not Jev. No situation field changes, and wild colonies of the game's species ask under a preset doctrine whose answers ship. The awake set, not the explored area, bounds the tick.
- **Six stages, E1–E6** (§9), after S2 (one world only, `ja-fnd.3`) and N colony specs (`ja-fnd.5.4.2`). The bounded game stays bit-exact until E6 switches the page.

## 1. Where we are

One world is a bounded plane, 512 × 368 cells (`DEFAULT_WORLD.size`, `colony/world.ts`), plus one curtain under one line, which grows only from its ends (`colony/transect.ts`, `canFound` rule 1). The storage was built to grow: 64 × 64 chunks with signed coordinates (`colony/chunks.ts`, PRD §12, "the hook for the endless map"). Some of generation is already pure, and some is whole-map.

**Already a pure function of position:**
- Plane rock: `heightAt`, `chamberAt` and `chunkRock(seed, cx, cy, …)` (`world.ts:269`), which builds one chunk alone. Today it is only called for every chunk at once.
- Curtain ground: `groundCell` by `(seed, depth, x, y)` and `curtainColumn` (`oneWorld.ts:186`), by column *s*, so growing the line renumbers nothing (U4a).
- Food's random streams: one per plane chunk (`hash4(seed, 77, cx, cy)`, `world.ts:783`) and one per 64-column curtain block (`hash4(seed, 79, …)`, `buryAlong`).

**Whole-map today:**
- `blankLayers` (`world.ts:517`) allocates every chunk the map touches and pads the edge with rock.
- Nest placement: up to 40 tries for the first nest, each with a full `reachable` pass; 400 samples for the second (`world.ts:725-772`).
- Food: each patch must land on ground reachable from nest 0 over the whole map, then `keepReachableFood` (`world.ts:811`) prunes again. The curtain does the same after `buryAlong`.
- `mainGround` (`oneWorld.ts:256`): one pass over the whole plane per founding (~14 ms). `growWorld` (`oneWorld.ts:209`) runs `reachableFrom` over the whole curtain.

**Dense or flat state that assumes a size:**
- `Colony.#outField` (`colony.ts:1637`): an `Int32Array(w·h)` of the home curtain per colony, rebuilt every 0.5 s.
- The fungus's `sporeCells` and `base`: flat `y·w + x − x0` keys, re-keyed by `regrid` when the curtain grows (`fungus.ts:1294`).
- Regrowth: `#notePiles` scans every cell once and keeps flat indices (`game.ts:734`).
- The minimap: one bitmap of the whole map, resampled cell by cell twice a second (`ui/ColonyField.tsx`).

**Memory only grows:**
- `ChunkLayer.drop` exists but nothing calls it outside a save's restore.
- A pheromone chunk that falls asleep is zeroed but stays allocated (`pheromone.ts`).
- The chunk table is a dense bounding box (`chunks.ts`, `#cover`): two busy spots far apart allocate every slot between them, and `forEach`, saves and the golden hash walk all of them.
- A save writes every allocated chunk of every layer, rock included, though the plane's rock never changes.

**Edges assumed:** the camera's clamp and fit (`ui/camera.ts`); homing belief and search clamps (`colony.ts`, `EDGE`); occupancy clamps in `battle.ts`, `recognition.ts` and `fungus.ts`; `Game.load`'s plane-size check; the e2e's camera clamp (`scripts/e2e-one-world.mjs`). `cellKey` (`colony.ts:6470`) is `y · 65536 + x`, so columns are capped at ±32k.

**Two colonies assumed:** `generateOneWorld` refuses more than two nests; `Game.rival` is `colonies[1]`; "the world's own colonies" are `colonies.length − founded.length` (`fallen`, `outcome`); colours and names go by index; `MAX_COLONIES` is 6 (`game.ts:120`). `ja-fnd.5.4.2` (Game over N colony specs) replaces these.

**What it costs to run today:** a tick is 10.7–10.8 ms at 1,200 + 1,200 ants after `ja-web`, over the owner's 10 ms gate (`ja-lp4.6.7`), and the ants' step is ~73 % of it (PRD §51, U6a). Cost follows ants, not area: the pheromones already step only awake chunks.

## 2. The model: the seed plus what changed

**A chunk is generated, then changed.** The first time anything reads or writes a chunk, its generator fills it from `(seed, cx, cy)`: rock, food, the plane's quality. Underground the unit is a column block of the line. From then on the game changes it. A chunk can be dropped and regenerated at any time, and comes back the same, plus its delta.

**Generation reads only pure inputs.** A chunk's contents may depend on its own position and on its neighbours' pure contents (their rock, their wild sites), never on anything the game did: no founding, no dug cell, no order of visits. This is the rule `ja-r84` asks for. Without it two players walking the same seed in different orders would get different worlds, and a save could not regenerate what it dropped.

**The delta** is what an ant or the fungus changed against the generated chunk:
- rock dug or filled, with `digHeading`, `dugAt`, `filledAt`, and the forks;
- food taken or dropped, the plane's spoil and loose pellets, chambers and floor marks;
- the midden's marks, spores on the ground, hyphae.

Scent is not part of it. A chunk whose every channel has faded below `SLEEP` (1e-4, `pheromone.ts`) holds nothing worth keeping and is dropped back to the pool. Faint scent never outlives its half-life: 2.8 s for alarm, 11.6 s for the food trail and 34.7 s for the home trail ([ant-communication §2](ant-communication.md#2-distance-and-time-scales)).

**Where the delta lives.** Awake ground keeps its chunks in full, as today. Frozen ground (§6) keeps only chunks whose delta is not empty, stored compactly: a list of changed cells, or the whole chunk when most of it changed. A frozen chunk with no delta holds no memory at all.

## 3. Local generation

**Plane food** keeps its per-chunk stream and its 1.5 patches per chunk (PRD §12). The two whole-map checks become local:
- **Reachable:** a patch is kept when its cells join open ground that leaves the chunk's 3 × 3 neighbourhood (an `escapes`-style check, `world.ts:639`, over the window). Food sealed in a rock pocket inside the window is dropped. A pocket larger than the window can still hold food no colony reaches. That is accepted: the endless plane has no "main ground" to measure against, and a pocket nobody can enter costs nothing.
- **Away from nests:** 24 cells from every nest the *world* placed (the start nests and the wild sites of §4, both pure). Foundings are history, so they don't count. A queen may found beside food, as real ones do.

**Curtain food** keeps `buryAlong`'s stream per 64-column block. Its reach check (`keepReachableFood` over the whole curtain, `oneWorld.ts:154`) becomes a check within the block and its two neighbours, by digging from the crust. Underground almost everything is reachable by digging, so the check mostly drops food inside stone.

**The guard:** a property test generates a ring of chunks in several random orders and compares every layer bit for bit. A second test compares a chunk generated alone with the same chunk generated amid its neighbours.

**The bounded game is untouched** until S2 (`ja-fnd.3`) retires `generateWorld`. The endless generator is new code beside it, with its own golden.

## 4. Wild colonies

**Sites are pure.** The plane is divided into regions of R × R chunks. Each region draws one candidate point from `hash(seed, region)` and keeps it when:
- it is open ground, and an `escapes` check within the region's neighbourhood says ants could walk out of it;
- it is at least `HOLE_GAP_2D` (16) from the start nests and at least `WILD_GAP` from its neighbours' candidates;
- a density draw from the same hash accepts it.

Both the candidate and its neighbours' candidates are pure, so a region can be judged alone.

**How dense.** Real fields are full. Harvester ants nest about 9–14 m apart, overdispersed, about 30–37 colonies a hectare ([nest-spacing §1](nest-spacing.md#1-how-far-apart-mature-nests-are)). The game's U is 140 cells, so one colony per U² is about one per 4.8 chunks. A field that full leaves a founding queen nowhere to land outside the survival line of 0.6–0.9 U ([nest-spacing §2](nest-spacing.md#2-where-new-colonies-survive)): she would always land beside a mature stranger. Desert ants are much sparser, about 3 a hectare ([desert-ant](desert-ant.md)). **Proposed (design):** start at one wild site per 4 × 4 chunks (about 0.3 per U²), then tune with the assay of §9 E6: how often a flight lands within 0.6–0.9 U of a stranger, and how often a founding survives its first 10 minutes. The owner sets the number.

**A site is only a point until it wakes** (§6). It costs a few bytes and draws a small nest disc on the plane, so the player can see it at a distance.

**What a wild colony is when it wakes.** It is generated mature, from `hash(seed, site)`:
- the game's species and a preset doctrine (one species per game for now, PRD §62);
- a queen, workers and brood in the proportions a 10-minute game reaches (measured from the start colonies in E4, not invented);
- its shaft and royal chamber dug by `foundNest`, chambers by the same digger run for a fixed time, on its own line (§5);
- its own odour, from the same hash, so strangers are strangers;
- a mound and a home trail around the hole.

How big that should be is the owner's choice (§10). Mature and stronger than a founding is what keeps the frontier a slope rather than a free buffet.

**What this does not do.** No rule tells an ant where wild colonies are. They are found by contact, scent and raids, as the start colonies are. Placement is world generation, not an ant's choice, so it adds no gap to the vision's table.

## 5. Many lines

**The world holds a list of lines.** Each line is a `Transect` (`transect.ts`) with its own curtain, a `WorldMap` with its own `x0`. An ant's layer, today `PLANE` or `CURTAIN` (`colony.ts:562`), becomes the plane or curtain *k*. A colony knows which line its hole is on.

**The founding rule, generalised.** For a point *p*:
1. **If the nearest hole over every line is an end of its line**, that line grows by today's rules 1–4 ([one-world §3](one-world.md#3-the-line-and-where-a-new-nest-may-go)).
2. **If *p* lies farther than `NEW_LINE_GAP` from every line**, it starts a new line of one hole. That distance counts each line's margin (64) plus the clearance (12), and the new line's own margin.
3. **Otherwise** it is refused, and `nearestValid` moves it as today.

Rule 2's clearance holds between lines as well as within one: no new segment or margin comes within the clearance of another line. One plane cell never lies over two curtains.

**A line of one hole** needs a heading for its margins, which today come from the end segment. The heading is drawn from the seed: a wild colony's from its site's hash, a founding's from the game's stream. The line grows from either end when a daughter lands beyond it.

**A wild colony starts its own line** (rule 2), placed when the colony wakes. Its site is chosen so that rule 2 holds against the start line and its neighbours' sites, with margins as wide as one-world's.

**Pheromones, occupancy and the fungus's grids** are made per (colony, layer) only when first used. Most colonies only ever use the plane and their own curtain.

**Lines don't join, for now (proposed).** Two lines whose ends come near are both blocked from growing towards each other by the clearance. Joining them would renumber one curtain's columns into the other. It is left for later, with polydomy (`ja-4h2`, `ja-lp4.9`).

**What the side view shows** is the curtain under the line the player clicked, or the line the followed ant is on. Each line keeps its own camera.

## 6. Awake and frozen

**The awake set** is the ground within W of anything awake:
- every awake colony's holes;
- every awake ant (an ant walking out keeps the ground around it awake);
- the fungus's body: its mycelium, its spores and its hosts.

**Proposed:** W = 2 U (280 cells), the far end of a forager's reach ([nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game)).

**A colony wakes** when an awake ant or the fungus comes within W of its hole. The first time, it is generated (§4).

**A colony freezes** when nothing awake from outside it has come within W for T seconds and the fungus has no host in it. Its ants, curtain and scent then cost nothing to tick, and its chunks drop to their deltas (§2). It resumes exactly where it stopped.

**The start colonies** are awake from the first tick.

**The camera never changes the simulation.** Looking at frozen ground shows it as it was when it froze. Otherwise a replay, a golden master or an assay would depend on where the player happened to look.

**An awake cap.** The number of awake colonies is capped (proposed: 6, today's `MAX_COLONIES`, which is set by the tick, not the page's colours). When waking another would pass the cap, the awake colony farthest from the fungus's body freezes first. If none can, the newcomer waits, frozen. The tick is then bounded by the cap, not by the world.

**Does freezing break the vision?** No ant chooses anything by it. It is a rule of the world, like generation: while a colony is awake every choice still comes from its policy over what it senses. The honest cost is that a frozen colony doesn't starve, grow or raid. The world is still while nobody is there. A coarse model of far colonies was offered and declined (owner, 2026-11-13). It would be a second model to keep in step, and colony-wide counts are what the vision keeps out of choices.

## 7. Storage and memory

**`ChunkLayer`** (`chunks.ts`) gains three things:
- **A generator on miss** for layers that have one (rock, food, quality). It fills a chunk on its first read, so `rockAt`'s explicit bounds go.
- **Eviction:** `drop` with a delta kept by the layer's owner.
- **A table that doesn't grow with the square of the spread.** The choice between a hashed map (`Map<chunkKey, A>`) and a two-level table (regions of 16 × 16 chunks, each a dense table) is made by a bench of `get()` in the ants' sensors, the hottest read in the game. Today it is an index into a dense array, and a `Map` lookup may cost too much there. A cache of the last chunk read may close the gap.

**Pheromones:** a chunk that falls asleep is dropped back to the pool, not kept zeroed. The rule pheromone.ts uses for a missing rock chunk ("no ground, holds nothing", and a missing neighbour reads as rock) changes to ask the generator.

**Flat keys go:**
- the fungus's `sporeCells` and `base` are keyed by chunk and cell (no `regrid`);
- regrowth's piles are noted per chunk when the chunk is generated, not by one scan at the start;
- `#outField` becomes a window round the colony's own holes on its own line, a few hundred columns wide, not the whole curtain;
- `cellKey` widens to the chunk key's range.

**The memory budget**, a soak test (E4):
- a scout walks 50 U out and back;
- colonies are founded far apart on several lines;
- the heap after a forced GC, and the chunks allocated per layer, must grow with the awake area plus the changed area, not with the explored area.

The numbers are set from E1's measurements. Nothing measures memory today.

## 8. Saves and the page

**Saves:** the seed, the lines, the wild sites that have woken, each colony's state (awake or frozen), and a delta per changed chunk. Rock that was never changed is not saved. Scent is saved only for awake chunks. Size then grows with ground changed, not ground seen. The plane-size check in `Game.load` goes. Compression waits for a measurement over ~20 MB, as U4b decided.

**The page:**
- **Camera:** no hard clamp. The view can go anywhere revealed, plus a margin, with a fixed least zoom instead of "the whole map". "Zoomed in", which turns the minimap on, becomes a zoom level.
- **Chunk canvases** (`ColonyField.tsx`): evicted when far off-screen, and repainted only when their chunk changed (a dirty flag per chunk), not every frame.
- **The minimap:** a window of a fixed number of chunks round the camera, drawn from the same chunk canvases, with nests marked beyond its edge by arrows.
- **Fog of war:** one bit per chunk, revealed. **Proposed:** revealed where the fungus's hosts have walked, plus a disc round the start nests. The fog then shows the fungus's own reach, and spreading it is the way to see. A frozen region shows its last-seen state. The owner decides (§10).
- **The side view:** the line under the click, or the followed ant's line.

## 9. Building it: stages and guards

Each stage is one PR. The bounded game's golden masters stay bit-exact through E1–E5, except where E1 changes the golden hash's format once (said so in its PR). The stages wait on S2 (`ja-fnd.3`), which replaces the plane's generator, and on `ja-fnd.5.4.2`, which lets `Game` hold N colonies.

| Stage | What | Guard |
|---|---|---|
| E1 storage (`ja-qpv.1`) | generator on miss, drop and eviction, the table chosen by bench; flat keys re-keyed; `#outField` windowed; `cellKey` widened; sleeping pheromone chunks dropped | bounded goldens bit-exact (the hash first made blind to table order and all-empty chunks, re-recorded once); `colony-bench --one` within noise |
| E2 local generation (`ja-r84`) | per-chunk plane food and curtain food with local reach; the wild-site lattice | generation in any order is bit-identical; food per chunk within PRD §12's range |
| E3 many lines (`ja-qpv.2`) | `lines[]`, layer ids, the generalised founding rule, a one-hole line, saves | a one-line game bit-exact; property tests that no plane cell lies over two curtains |
| E4 awake and frozen (`ja-qpv.3`) | the awake set, freeze and thaw, wild colonies generated on waking, frozen chunks as deltas, the awake cap | the memory-budget soak; a freeze and thaw is invisible to a colony's journal; tick at the awake cap |
| E5 the page (`ja-qpv.4`) | camera, minimap window, fog, canvas eviction, line picking | `npm run e2e` updated; 60 fps in headless Chromium far from the start |
| E6 switch and assays (`ja-qpv.5`) | the endless world as the page's game (owner); the founding radius rechecked without edges; wild density tuned | assays on seeds 1–10, confirmed 11–20; `flight-failure.mjs` on the endless plane; PRD §65 filled in; unblocks `ja-1vg` |

**Measured at E6:**
- **The founding radius.** `ja-qpv`'s note asks for this. `FOUND_RADIUS` = 140 was set because edges failed half the flights at 70 ([nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game), proposal 2). Without edges, 70 may fail mainly near strangers, which reads better.
- **`ja-lp4.12`** (holes on the plane's rim) goes away with the rim.

## Play

- **See:** the world opens outward. Wild nests show as discs in the fog's edge. Following a host out past the start's ground reveals new ground. A side view of each nest group shows its own curtain.
- **Choose:** the player's levers don't change, but where to spread now matters: towards a wild colony (more hosts, a stronger stranger) or away (room to found). A daughter's landing click picks a new line or an old line's end.
- **Progression:** a slope, not a cliff. Wild colonies wake mature and are stronger than foundings, so reaching them takes the levers the fungus earns. The fog makes the frontier something to push, not a map handed over.
- **Cost:** none in Jev while answers are cached. Wild colonies use a preset doctrine whose answers ship, and no situation field changes. The cost is the tick and memory, bounded by the awake cap.
- **What could make it worse:**
  - **An empty world:** too few wild sites, nothing to meet. E6 measures contacts per hour.
  - **A world too full to found in:** too many wild sites. E6 measures flights landing near strangers.
  - **A runaway cost:** an awake set that only grows. The cap and the memory soak watch it.
  - **A frozen colony that looks dead:** the page draws it as still and says it is asleep.

## 10. Decided, and still open

**Decided (owner, 2026-11-13):**
1. **Many lines.** Each group of nests has its own line and curtain. A founding near a line's end grows that line. A colony far from every line starts a new one. Lines keep a clearance from each other.
2. **Freeze far ground.** Only ground near awake things is stepped and stored in full. A far wild colony waits frozen until something awake comes near. A coarse far-away model and simulating everything were both declined.
3. **Design first.** This note, PRD §65 and the beads come before code.

**Still open, each with a recommendation:**
1. **Wild density.** Recommend one site per 4 × 4 chunks to start, tuned at E6 by flights landing near strangers and contacts per hour.
2. **A wild colony's size on waking.** Recommend the size a start colony reaches in 10 minutes, measured in E4.
3. **What reveals the fog.** Recommend where the fungus's hosts have walked, plus the start nests.
4. **W, T and the awake cap.** Recommend W = 2 U (280 cells), T = 60 s and a cap of 6, rechecked against the tick at E4.
5. **Lines joining.** Recommend not yet. The clearance keeps them apart until polydomy.
6. **Whether the bounded game stays.** Recommend keeping it as a test bed for the goldens and assays until E6, then deciding with the owner, as the side and top-down maps went (PRD §55).
