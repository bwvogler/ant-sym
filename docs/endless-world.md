# Endless world: chunks from the seed, many lines, far ground frozen

*Design note, 2026-11-13, epic `ja-qpv` (MR 9). Nothing here is built. It answers the owner's request (2026-11-13) to start on an endless world, and builds on [one-world](one-world.md), whose model it extends. Decisions: PRD §66. Revised after the review of #124 (2026-11-13). Code references are to `web/src/` on main at b610e1c.*

## TL;DR

- **The world is the seed plus what the game changed.** Every chunk can be generated alone, in any order, from `(seed, chunk)` and pure inputs. What ants change (dug cells, food taken, spoil, chambers) is kept per chunk as a delta. Faded scent is dropped.
- **Many lines** (owner, 2026-11-13). Underground stays a curtain under a line through holes ([one-world §2](one-world.md#2-the-model-a-plane-and-a-curtain)), but the world holds as many lines as it needs. A founding far from every line starts a new line; one near a line's end grows it. Each line's ground has its own salt.
- **Queens fly farther** (owner, 2026-11-13). The 1 U flight was forced by the bounded plane's edges. On the endless plane it lengthens towards real queens' 5 U or more ([nest-spacing §3](nest-spacing.md#3-how-far-a-founding-queen-flies)), so daughters start lines of their own. The distance is measured at E6.
- **Far colonies are frozen, and only the fungus wakes them** (owner, 2026-11-13). Freezing is per colony: its ants, its scent and its curtain stop. Colonies in contact freeze together. A wild colony is a point on the map until the fungus's body comes within reach or an awake host enters its nest ground. Then it wakes, generated mature from its own seed. Other ants never wake anything, so waking can't chain. A cap on awake colonies may freeze even a colony the fungus lives in, by rank (owner, 2026-11-13).
- **Wild colonies** come from a pure lattice of sites, sparser than real harvester-ant fields ([nest-spacing §1](nest-spacing.md#1-how-far-apart-mature-nests-are)), so foundings have room.
- **Cost** is CPU and memory, not Jev. No situation field changes, and wild colonies of the game's species ask under a preset doctrine whose answers ship. The awake set, not the explored area, bounds the tick.
- **Six stages, E1–E6** (§9), after S2 (one world only, `ja-fnd.3`) and N colony specs (`ja-fnd.5.4.2`). The bounded game stays bit-exact until E6 switches the page.

## 1. Where we are

One world is a bounded plane, 512 × 368 cells (`DEFAULT_WORLD.size`, `colony/world.ts`), plus one curtain under one line, which grows only from its ends (`colony/transect.ts`, `canFound` rule 1). The storage was built to grow: 64 × 64 chunks with signed coordinates (`colony/chunks.ts`, PRD §12, "the hook for the endless map"). Some of generation is already pure, and some is whole-map.

**Already a pure function of position:**
- Plane rock: `heightAt`, `chamberAt` and `chunkRock(seed, cx, cy, …)` (`world.ts:269`), which builds one chunk alone. Today it is only called for every chunk at once.
- Curtain ground: `groundCell` by `(groundSeed(seed), depth, x, y)` and `curtainColumn` (`oneWorld.ts:186`), by column *s*, so growing the line renumbers nothing (U4a).
- Food's random streams: one per plane chunk (`hash4(seed, 77, cx, cy)`, `world.ts:783`) and one per 64-column curtain block (`hash4(seed, 79, …)`, `buryAlong`).

**Whole-map today:**
- `blankLayers` (`world.ts:517`) allocates every chunk the map touches and pads the edge with rock.
- Nest placement: up to 40 tries for the first nest, each with a full `reachable` pass; 400 samples for the second (`world.ts:725-772`).
- Food: each patch must land on ground reachable from nest 0 over the whole map, then `keepReachableFood` (`world.ts:811`) prunes again. It also sets `foodTotal` and `foodLeft`, which the assays' `foodHome` divides by (`experiment.ts:116`) and the page shows. The curtain does the same after `buryAlong`, keeping pockets clear of every nest, founded ones included (`growWorld`).
- `mainGround` (`oneWorld.ts:256`): one pass over the whole plane per founding (~14 ms), for founding rule 4. `growWorld` (`oneWorld.ts:209`) runs `reachableFrom` over the whole curtain.

**Dense or flat state that assumes a size:**
- `Colony.#outField` (`colony.ts:1556`): an `Int32Array(w·h)` of the home curtain per colony, rebuilt at most every 0.5 s.
- ~~The fungus's `sporeCells` and `base`: flat `y·w + x − x0` keys, re-keyed by `regrid` when the curtain grows (`fungus.ts:1294`).~~ Done in E1.3: keyed by `cellKey`, and `regrid` is gone.
- ~~Regrowth: `#notePiles` scans every cell once and keeps flat indices (`game.ts:754`).~~ Keyed by `cellKey` in E1.3; noting piles per chunk as it is generated is E2's.
- The minimap: one bitmap of the whole map, resampled cell by cell twice a second (`ui/ColonyField.tsx`).

**Memory only grows:**
- ~~`ChunkLayer.drop` exists but only a test calls it.~~ Done in E1.1: a sleeping pheromone chunk is dropped.
- ~~A pheromone chunk that falls asleep is zeroed but stays allocated (`pheromone.ts`).~~ Done in E1.1 (PRD §66).
- ~~`SensedMap` (`ui/fungusSight.ts`, PRD §65), one `Float32` chunk layer per layer of where hosts sensed scent, is never dropped. It grows with the ground hosts have walked.~~ Done in E1.3: a chunk faded right out is dropped and leaves a revealed bit.
- ~~The chunk table is a dense bounding box (`chunks.ts`, `#cover`): two busy spots far apart allocate every slot between them, and `forEach`, saves and the golden hash walk all of them.~~ Done in E1.2: regions of 16 × 16 chunks (PRD §66).
- A save writes every allocated chunk of every layer, rock included, though the plane's rock never changes.

**Edges assumed:** the camera's clamp and fit (`ui/camera.ts`); homing belief and search clamps (`colony.ts`, with `EDGE` in `tuning.ts`); occupancy clamps in `battle.ts`, `recognition.ts` and `fungus.ts`; `Game.load`'s plane-size check; the e2e's camera clamp (`scripts/e2e-one-world.mjs`). ~~`cellKey` (`grid.ts:60`) is `y · 65536 + x`, so columns are capped at ±32k.~~ E1.3: one `cellKey` (`hex.ts`) for every packed cell, ±2,097,152 on both axes.

**Two colonies assumed:** `generateOneWorld` refuses more than two nests; `Game.rival` is `colonies[1]`; "the world's own colonies" are `colonies.length − founded.length` (`fallen`, `outcome`); names go by index (the minimap colours by odour since PRD §65); `MAX_COLONIES` is 6 (`game.ts:120`). `ja-fnd.5.4.2` (Game over N colony specs) replaces these.

**What it costs to run today:** a tick is 10.7–10.8 ms at 1,200 + 1,200 ants after `ja-web`, over the owner's 10 ms gate (`ja-lp4.6.7`), and the ants' step is ~73 % of it (PRD §51, U6a). Cost follows ants, not area: the pheromones already step only awake chunks.

## 2. The model: the seed plus what changed

**A chunk is generated, then changed.** The first time anything reads or writes a chunk, its generator fills it from `(seed, cx, cy)`: rock, food, the plane's quality. Underground the unit is a column block of a line. From then on the game changes it. A chunk can be dropped and regenerated at any time, and comes back the same, plus its delta.

**Generation reads only pure inputs.** A chunk's contents may depend on its own position and on pure functions of its neighbours' positions (their `chunkRock` before any food clears it, their wild-site candidates), never on anything the game did: no founding, no dug cell, no order of visits. This is the rule `ja-r84` asks for. Without it two games walking the same seed in different orders would get different worlds, and a save could not regenerate what it dropped. Underground the rule is "pure given the line" (§5).

**The delta** is what an ant or the fungus changed against the generated chunk:
- rock dug or filled, with `digHeading`, `dugAt`, `filledAt`, and the forks;
- food taken or dropped, the plane's spoil and loose pellets, chambers;
- spores on the ground and hyphae.

**Scent is not part of the delta.** Trails, alarm, the floor marks (`royal`, `brood`, `store`, `reception`) and the midden's mark are all pheromone channels (`pheromone.ts`). They stay in their chunks while those chunks are awake or frozen (§6). A channel's chunk that has faded below `SLEEP` (1e-4) everywhere holds nothing worth keeping and is dropped back to the pool (built in E1.1). A level of 1 falls below `SLEEP` after about 13 half-lives, without spreading: ~37 s for alarm, ~154 s for the food trail, ~461 s for the home trail and ~15 min for the floor marks (half-lives 2.8 s, 11.6 s, 34.7 s and 69 s; [ant-communication §2](ant-communication.md#2-distance-and-time-scales)).

**Where the delta lives.** Chunks within W of an awake colony or the fungus (§6) are kept as they are. A frozen colony's scent chunks are kept too, unstepped, since scent belongs to a colony (one `Pheromones` per colony and layer, `colony.ts`). Every other chunk keeps only its delta, stored compactly: a list of changed cells, or the whole chunk when most of it changed. A chunk with no delta and no scent holds no memory at all.

## 3. Local generation

**Plane food** keeps its per-chunk stream and its 1.5 patches per chunk (PRD §12). The two whole-map checks become local:
- **Reachable:** a patch is kept when its cells join open ground that leaves the chunk's 3 × 3 neighbourhood (an `escapes`-style check, `world.ts:639`, over the window). The check reads `chunkRock` before any patch clears it. A patch clears a disc of radius 2–4 (`world.ts:790-797`) that can spill into a neighbour, but setting food and clearing rock are idempotent, so the order patches land in doesn't matter. Food sealed in a rock pocket inside the window is dropped. A pocket larger than the window can still hold food no colony reaches. That is accepted: the endless plane has no "main ground" to measure against, and a pocket nobody can enter costs nothing.
- **Away from nests:** 24 cells from every nest the *world* placed (the start nests and the wild sites of §4, both pure). Foundings are history, so they don't count. A queen may found beside food, as real ones do.

**The start nests** are placed by the same rule as wild sites (§4), near the origin: the first candidate that passes the local `escapes` check, then the second about `nestGap` (140) from it. No whole-map pass.

**Curtain food** keeps `buryAlong`'s stream per 64-column block, salted by the line (§5). Its reach check (`keepReachableFood` over the whole curtain, `oneWorld.ts:154`) becomes a check within the block and its two neighbours, by digging from the crust. Pockets keep clear of the nests the world placed on that line (a wild colony's or a start nest's), not of foundings. Underground almost everything is reachable by digging, so the check mostly drops food inside stone.

**Food totals.** `foodTotal` and `foodLeft` mean nothing once food appears as chunks are generated. They become the food generated so far plus regrowth, kept as chunks are made. The assays' `foodHome` instead divides a colony's stores by the food first generated within 2 U of its hole: a fixed disc, the same in any order of generation. The page shows food stored and carried, not food left in the world.

**The guard:** a property test generates a ring of chunks in several random orders and compares every layer bit for bit. A second test compares a chunk generated alone with the same chunk generated amid its neighbours.

**The bounded game is untouched** until S2 (`ja-fnd.3`) retires `generateWorld`. The endless generator is new code beside it, with its own golden.

## 4. Wild colonies

**Sites are pure.** The plane is divided into regions of R × R chunks, R ≥ 3 (proposed 4, one site per region at most). At R ≥ 3 a site's reserved line (its hole and 64 cells each way, plus the 12-cell clearance) reaches only the eight regions round its own, which are the ones its check reads. Each region draws one candidate point from `hash(seed, region)` and keeps it when:
- it is open ground, and an `escapes` check within the region's neighbourhood says ants could walk out of it;
- it is more than `NEW_LINE_GAP` (140, §5) from the start nests, and at least `WILD_GAP` from its neighbours' candidates (proposed: 140 too);
- the one-hole line it will start (its hole plus a margin each way along a heading drawn from the same hash) keeps the clearance from the start line and from the reserved lines of its neighbours' candidates (pure, so the check never recurses);
- a density draw from the same hash accepts it.

Both the candidate and its neighbours' candidates are pure, so a region can be judged alone.

**A site is a reserved line from the start**, woken or not. The founding rule (§5) counts every site's one-hole line, margins included, as if it were already there. A daughter can't land on a site, within 140 of one, or grow a line across one, so a site that wakes late never finds a curtain in its way.

**How dense.** Real fields are full. Harvester ants nest about 9–14 m apart, overdispersed, about 30–37 colonies a hectare ([nest-spacing §1](nest-spacing.md#1-how-far-apart-mature-nests-are)). The game's U is 140 cells. Hex rows are √3/2 apart, so a chunk covers about 3,550 square units and U² is about 5.5 chunks. One colony per U² is therefore about one per 5.5 chunks. A field that full leaves a founding queen nowhere to land outside the survival line of 0.6–0.9 U ([nest-spacing §2](nest-spacing.md#2-where-new-colonies-survive)): she would always land beside a mature stranger. Desert ants are much sparser, about 3 a hectare ([desert-ant](desert-ant.md)). **Proposed (design):** start at one wild site per 4 × 4 chunks (about 0.35 per U², sites about 238 units apart on a lattice), then tune with the assay of §9 E6: how often a flight lands within 0.6–0.9 U of a stranger, and how often the fungus's hosts meet a stranger per hour. The owner sets the number.

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

**The world holds a list of lines.** Each line is a `Transect` (`transect.ts`) with its own curtain, a `WorldMap` with its own `x0`. An ant's layer, today `PLANE` or `CURTAIN` (`colony.ts`), becomes the plane or curtain *k*. A colony knows which line its hole is on.

**Each line's ground is its own.** The curtain's ground is keyed by `groundSeed(seed)` and the column *s* (`oneWorld.ts:93`, `:186`), its food by `hash4(seed, 79, …)`, and every line starts with V₀ at *s* = 0. Unsalted, two lines would have the same stones and food under their first holes. Each line's salt is a hash of its first hole's plane cell, mixed into both seeds. The first line's salt is 0, so its ground and food keep today's seeds and the bounded goldens hold (E3). The first hole never changes when a line grows, so the salt is fixed for the line's life.

**The founding rule, generalised.** For a point *p*, in this order:
1. **If *p* is farther than `NEW_LINE_GAP` (140) from every hole**, of every line and every wild site (§4), it starts a new line of one hole, provided that line, its margins included, keeps the clearance (12) from every line and every site's reserved line, margins included.
2. **Else, if the nearest hole is an end of its line** (never an unwoken site), that line grows by today's rules 1–3 ([one-world §3](one-world.md#3-the-line-and-where-a-new-nest-may-go)).
3. **Otherwise** it is refused, and `nearestValid` moves it as today.

A far landing whose new line would break the clearance is refused under rule 1 and falls to rule 2 or 3: `nearestValid` moves it to the nearest point within `FOUND_RADIUS` where rule 1 or 2 holds, and if none does the flight fails, as today.

The 140 is measured to holes only. The clearance check does the geometry. The new-line test runs first, because today's rule 1 has no length limit and would send every far point to the nearest line's end.

Rule 2's clearance holds between lines as well as within one: no new segment or margin comes within the clearance of another line or a site's reserved line. One plane cell never lies over two curtains.

**Most daughters will start lines of their own.** With 2 U flights a daughter lands within 140 of a hole only when her landing is pulled back towards one. So one-hole lines are the common case, and growing a line's end the rarer one. E6 counts how many foundings do each.

**Rule 4 becomes local.** Today it asks `mainGround`, a reach pass over the whole plane, which never ends on an endless one. It becomes the bounded `escapes` check of §4: a founding's hole must join open ground that leaves a disc of about 1 U round it.

**Flights lengthen on the endless plane** (owner, 2026-11-13). `FLIGHT_2D` = 140 was set by the bounded plane, whose edges failed half the flights at shorter ranges ([nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game), proposal 1). At 140 a daughter lands exactly `NEW_LINE_GAP` from her mother's hole, which lies on her mother's line, so she could never start a line of her own. **Proposed:** about 2 U (280 cells) to start, towards the 5 U or more real queens fly, set at E6 by `scripts/lab/flight-failure.mjs` on the endless plane. The founding radius is rechecked there too.

**A line of one hole** takes its margins' heading from `outward` (`transect.ts:62`: west at the start, east at the end). Drawing the heading from the seed instead (a wild colony's from its site's hash, a founding's from the game's stream) is a choice, made in E3, so a field of lines doesn't all run east–west. The line grows from either end when a daughter lands beyond it.

**A wild colony starts its own line** (rule 1), placed when the colony wakes. Its site is chosen so that the rule holds against the start line and its neighbours' sites, with margins as wide as one-world's.

**Pheromones, occupancy and the fungus's grids** are made per (colony, layer) only when first used. Most colonies only ever use the plane and their own curtain.

**Lines don't join, for now (proposed).** Two lines whose ends come near are both blocked from growing towards each other by the clearance. Joining them would renumber one curtain's columns into the other. It is left for later, with polydomy (`ja-4h2`, `ja-lp4.9`).

**What the side view shows** is the curtain under the line the player clicked, or the line the followed ant is on. Each line keeps its own camera.

## 6. Awake and frozen

**Freezing is per colony.** A frozen colony's ants, its scent channels on every layer and its curtain stop. Its ants leave the occupancy grids, so no ant meets them. Its scent chunks are kept as they are, unstepped, so its trails and floor marks are where they were. Its curtain, the fungus's body in it included, is not stepped. An awake colony's scent steps wherever it has chunks, near a frozen colony or not, so its own trails fade as usual.

**Ground-wide layers** follow the ground, not a colony:
- **Food regrowth** steps in chunks within W of an awake colony's hole or the awake fungus. Elsewhere it waits.
- **Spoil and the mound** don't step today, so nothing changes.
- **The fungus's ground state** (spores, the mycelium on the plane) steps wherever the fungus is awake, which is everywhere outside a frozen colony's curtain.

**Groups.** Colonies whose ants have been within sensing range of each other in the last T seconds form a group. A group freezes and wakes together. Without this, two neighbours that forage over each other's ground, such as the start colonies 140 apart, would keep each other awake for good.

**Only the fungus wakes** (owner, 2026-11-13). A frozen group, or an unwoken wild site, wakes in two ways:
- **The fungus's body** (on the plane, or in an awake curtain) comes within W of one of its holes.
- **An awake host enters its nest ground** (owner, 2026-11-13, D4 of the third review): a disc round a hole where it meets the residents, proposed at 16 cells, about the reach of a young colony's mound (U3c measured 95 % of pellets within 10–21 cells of the hole); E4 sets it. A host merely foraging past, within W, wakes nothing.

Frozen hosts and the fungus's body inside a frozen curtain wake nothing. A wild site is generated the first time it wakes (§4). Other ants never wake anything, so waking can't chain from one colony to the next, however close the sites are. **Proposed:** W = 2 U (280 cells), the far end of a forager's reach ([nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game)). A host forages past many sites (1–2 U out, within W of about 8–16), but enters few nests, so waking stays rare.

**A group freezes** when no member has had the awake fungus within W of its hole for T seconds. The start colonies are awake from the first tick and freeze by the same rule, together, once the fungus has left them. A daughter that lands beyond the fungus's reach freezes after T as a lone queen, until the fungus follows her.

**The awake cap may freeze a colony the fungus lives in** (owner, 2026-11-13, by rank). The number of awake colonies is capped (proposed: 6, today's `MAX_COLONIES`, which PRD §50 took from the page's colony names, not from the tick; E4 measures the tick at the cap and may lower it).
- **The rank** of a colony is how long since the fungus last *touched* it: a host entering its nest ground, a new host made there, or the fungus's body growing within W of its hole. The most recent touch ranks highest. A colony woken just now was touched just now, so it ranks highest by the same rule.
- **When a colony wakes** and the cap would be passed, the lowest-ranked awake groups freeze, with their hosts, until there is room. A group freezes whole, so it never splits. A group larger than the cap on its own may run over it; E4 counts how often.
- **Hysteresis.** A colony frozen by the cap may not wake again for T.
- **Room comes back.** When a slot frees (a group freezes by itself, or a colony dies), the highest-ranked cap-frozen colony that still holds the fungus (frozen hosts, or the fungus's body in its curtain) wakes, once its T has passed. Without this, a colony frozen by the cap could be stranded: if every host in the awake colonies died, nothing could reach it again.
- **At the cap the colonies rotate.** Each new nest the fungus enters freezes the stalest one, and none can come back for T, so the awake set turns over no faster than once a T. That is the steady state, not a fault.
- **Tests:** at the cap, no colony freezes and wakes more than once within T; with every awake host dead, a cap-frozen colony holding the fungus wakes when a slot frees.

The tick is then bounded by the cap, not by the world. The player sees part of their organism pause when it spreads over more colonies than the cap: the page draws a frozen colony's hosts as asleep.

**The camera never changes the simulation.** Looking at a frozen colony shows it as it was when it froze. Otherwise a replay, a golden master or an assay would depend on where the player happened to look.

**Does freezing break the vision?** No ant chooses anything by it. It is a rule of the world, like generation: while a colony is awake every choice still comes from its policy over what it senses. The honest cost is that a frozen colony doesn't starve, grow or raid. The world is still where the fungus is not. A coarse model of far colonies was offered and declined (owner, 2026-11-13). It would be a second model to keep in step, and colony-wide counts are what the vision keeps out of choices.

## 7. Storage and memory

**`ChunkLayer`** (`chunks.ts`) gains three things:
- **A generator on miss** for layers that have one (rock, food, quality). It fills a chunk on its first read, so `rockAt`'s explicit bounds go.
- **Eviction:** `drop` with a delta kept by the layer's owner. A region left with no chunk is freed with its last one (`ja-qpv.1.5`).
- **A table that doesn't grow with the square of the spread.** Built in E1.2: a dense box of regions of 16 × 16 chunks, each a dense array of chunk slots, with no map and no cache, so a read is still two array indexes. Chosen by `scripts/lab/chunk-table-bench.mjs` and `colony-bench` (PRD §66): on today's plane it reads about as fast as the dense bounding box it replaced, where a `Map<chunkKey, A>` was 20–30 % slower and a map of regions with a last-region cache lost 4–8 % of the game's tick; two places 100 × 60 chunks apart cost 1,584 slots a layer in the bench against the box's 7,659.

**Pheromones:** a chunk that falls asleep is dropped back to the pool, not kept zeroed. The rule pheromone.ts uses for a missing rock chunk ("no ground, holds nothing", and a missing neighbour reads as rock) changes to ask the generator.

**Flat keys go:**
- the fungus's `sporeCells` and `base` are keyed by `cellKey` (no `regrid`) (E1.3);
- regrowth's piles are noted per chunk when the chunk is generated, not by one scan at the start;
- `#outField` becomes a window round the colony's own holes on its own line, a few hundred columns wide, not the whole curtain;
- `cellKey` widens to the chunk key's range (E1.3: one key in `hex.ts`, where `grid.ts`, `hyphae.ts`, `transect.ts` and the forks each had their own).

**`SensedMap`** today keeps the time a host last sensed each cell, at full resolution, forever. From E1 it keeps those times only in chunks sensed within `SENSED_FADE` (20 s), which the trails' picture needs. An older chunk is dropped and leaves one revealed bit for the fog (§8).

**The memory budget**, a soak test (E4):
- a host walks 50 U out and back;
- colonies are founded far apart on several lines;
- the heap after a forced GC, and the chunks allocated per layer, must grow with the awake area plus the changed area, not with the explored area.

The numbers are set from E1's measurements. Nothing measures memory today.

## 8. Saves and the page

**Saves:** the seed, the lines, the wild sites that have woken, each colony's state (awake or frozen), the scent chunks still kept, and a delta per changed chunk. Rock that was never changed is not saved. Size then grows with ground changed, not ground seen. The plane-size check in `Game.load` goes. Compression waits for a measurement over ~20 MB, as U4b decided.

**The page:**
- **Camera:** no hard clamp. The view can go anywhere revealed, plus a margin, with a fixed least zoom instead of "the whole map". "Zoomed in", which turns the minimap on, becomes a zoom level.
- **Chunk canvases** (`ColonyField.tsx`): evicted when far off-screen, and repainted only when their chunk changed (a dirty flag per chunk), not every frame.
- **The minimap:** a window of a fixed number of chunks round the camera, drawn from the same chunk canvases, with nests marked beyond its edge by arrows.
- **Fog of war:** one revealed bit per chunk. **Proposed:** revealed where `SensedMap` says a host has sensed (PRD §65 already draws trails only there), plus a disc round the start nests. The fog then shows the fungus's own reach, and spreading it is the way to see. A frozen region shows its last-seen state. The owner decides (§10).
- **The side view:** the line under the click, or the followed ant's line.

## 9. Building it: stages and guards

Each stage is one PR. The bounded game's golden masters stay bit-exact through E1–E5, except where E1 changes the golden hash's format once (said so in its PR). The stages wait on S2 (`ja-fnd.3`), which replaces the plane's generator, and on `ja-fnd.5.4.2`, which lets `Game` hold N colonies.

| Stage | What | Guard |
|---|---|---|
| E1 storage (`ja-qpv.1`) | generator on miss, drop and eviction, the table chosen by bench; flat keys re-keyed; `#outField` windowed; `cellKey` widened; sleeping pheromone chunks dropped; `SensedMap` kept per chunk | bounded goldens bit-exact (the hash first made blind to table order and all-empty chunks, re-recorded once); `colony-bench --one` within noise |
| E2 local generation (`ja-r84`) | per-chunk plane food and curtain food with local reach; the start nests and the wild-site lattice; food totals per chunk | generation in any order is bit-identical; food per chunk within PRD §12's range |
| E3 many lines (`ja-qpv.2`) | `lines[]`, layer ids, each line salted (the first with 0), wild sites as reserved lines, the generalised founding rule with a local rule 4, a one-hole line, saves | a one-line game bit-exact; property tests that no plane cell lies over two curtains, reserved lines included, and that two lines' curtains differ |
| E4 awake and frozen (`ja-qpv.3`) | freezing per colony and per group, waking by the fungus only (hosts by entering nest ground), wild colonies generated on waking, far chunks as deltas, the ranked awake cap | the memory-budget soak; a freeze and thaw is invisible to a colony's journal; a wild colony's ants never wake another; a host foraging past a site wakes nothing; two colonies in contact freeze together after T; at the cap no colony freezes and wakes more than once within T; a cap-frozen colony holding the fungus wakes when a slot frees; tick at the awake cap |
| E5 the page (`ja-qpv.4`) | camera, minimap window, fog, canvas eviction, line picking, frozen colonies drawn asleep | `npm run e2e` updated; 60 fps in headless Chromium 20 U from the start |
| E6 switch and assays (`ja-qpv.5`) | the endless world as the page's game (owner); flight distance and founding radius set without edges; wild density tuned | assays on seeds 1–10, confirmed 11–20; `scripts/lab/flight-failure.mjs` on the endless plane; PRD §66 filled in; unblocks `ja-1vg` |

**Measured at E6:**
- **The flight and the founding radius.** `ja-qpv`'s note asks for this. `FOUND_RADIUS` = 140 was set because edges failed half the flights at 70 ([nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game), proposal 2). Without edges, a shorter radius may fail mainly near strangers, which reads better. The flight is set in the same run.
- **`ja-lp4.12`** (holes on the plane's rim) goes away with the rim.

## Play

- **See:** the world opens outward as the fungus spreads. Wild nests show as discs in the fog's edge. Following a host out past the start's ground reveals new ground. A side view of each nest group shows its own curtain.
- **Choose:** the player's levers don't change, but where to spread now matters: towards a wild colony (more hosts, a stronger stranger) or away (room for daughters to found). A daughter's landing click, 2 U out, usually starts a new line. A daughter that lands beyond the fungus's reach freezes after T, a lone queen, until the fungus follows her.
- **Progression:** a slope, not a cliff. Wild colonies wake mature and are stronger than foundings, so reaching them takes the levers the fungus earns. The fog makes the frontier something to push, not a map handed over. The fungus's reach is the frontier: what it hasn't reached stays still.
- **Cost:** none in Jev while answers are cached. Wild colonies use a preset doctrine whose answers ship, and no situation field changes. The cost is the tick and memory, bounded by the awake cap.
- **What could make it worse:**
  - **An empty world:** too few wild sites, nothing to meet. E6 measures how often hosts meet strangers per hour.
  - **A world too full to found in:** too many wild sites. E6 measures flights landing near strangers.
  - **A runaway cost:** the cap and the memory soak watch it.
  - **A frozen colony that looks dead:** the page draws it as still and says it is asleep.

## 10. Decided, and still open

**Decided (owner, 2026-11-13):**
1. **Many lines.** Each group of nests has its own line and curtain. A founding near a line's end grows that line. A colony far from every line starts a new one. Lines keep a clearance from each other.
2. **Freeze far ground.** Only what is near awake things is stepped; far colonies wait frozen (made per colony in §6). A coarse far-away model and simulating everything were both declined.
3. **Design first.** This note, PRD §66 and the beads come before code.
4. **Only the fungus wakes far ground** (review of #124, D1). The awake fungus (its body and its awake hosts) wakes colonies; other ants never do, so waking can't chain. Freezing is per colony, and colonies in contact freeze together.
5. **Queens fly farther on the endless plane** (review of #124, D2), so daughters start lines of their own. The distance is set at E6.
6. **The awake cap may freeze a colony the fungus lives in** (re-review of #124, D3), by rank: the colony longest untouched by the fungus freezes first, with hysteresis, and room that comes back goes to the highest-ranked cap-frozen colony holding the fungus. The fungus can spread over any number of colonies while only the cap's number run.
7. **A host wakes a colony only by entering its nest ground** (third review of #124, D4), about 16 cells round a hole; the fungus's body still wakes within W.

**Still open, each with a recommendation:**
1. **Wild density.** Recommend one site per 4 × 4 chunks to start, tuned at E6.
2. **A wild colony's size on waking.** Recommend the size a start colony reaches in 10 minutes, measured in E4.
3. **What reveals the fog.** Recommend where `SensedMap` says hosts sensed, plus the start nests.
4. **W, T, the nest ground and the awake cap.** Recommend W = 2 U (280 cells), T = 60 s, a nest ground of 16 cells and a cap of 6, rechecked against the tick at E4.
5. **The flight distance.** Recommend 2 U to start, set at E6.
6. **Lines joining.** Recommend not yet. The clearance keeps them apart until polydomy.
7. **Whether the bounded game stays.** Recommend keeping it as a test bed for the goldens and assays until E6, then deciding with the owner, as the side and top-down maps went (PRD §55).
