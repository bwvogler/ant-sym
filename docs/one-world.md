# One world: the surface and a curtain under the line between the holes

Design note. U1, the line's geometry, is built (`web/src/colony/transect.ts`); the rest is not. It answers the owner's request (2026-11-08) to make the top-down view and the side view two views of **one** game, and records the model chosen, the geometry rule that keeps it consistent, what changes in the code, and the order to build it in. Beads: epic `ja-lp4`; stages U1–U6 are `ja-lp4.1`–`ja-lp4.6`, and the research bead is `ja-lp4.7`. Decisions: PRD §51.

## 1. Where we are

The page has two separate games on two unrelated maps, and the Ground control switches between them by throwing the game away (ants, food, trails, the fungus).
- **"Side view"** (`generateSideWorld`, 768 × 368 cells): a cross-section. Sky, a ground line one cell thick, soil and stones below. Two nests 340 columns apart, each a dug shaft and royal chamber. Foragers walk a one-cell walkway along the ground line.
- **"From above"** (`generateWorld(seed, OPEN_WORLD)`, 512 × 368): the open surface. Rock and walkable ground, food in patches, two nests as discs about 140 apart. No soil, no queen.

The split was never decided. It appeared in MR 13 (PRD §27) when the owner asked to see spoil carried above ground, and the surface map was kept so earlier numbers still reproduce. Since then the two have drifted:

| Only the side view has | Only the top-down map has |
|---|---|
| the queen, brood, nurses, porters, undertakers (`#nestLife`, `#nurse`, `#port`) | a larder where every 4 food makes an ant (`foodPerAnt`) |
| chambers, floor marks, road signs | 2D foraging: Deneubourg's trail choice, the food-trail cap (`foodCapTop`), carriers homing by trail and vector |
| a drifting home vector (`#believe`, `#integrate`) | an exact nest position |
| the mound as real soil, the midden | the faint-alarm pull; the bridge assay A1 |
| the fungus's nest levers (`muddle`, `crown`) | |

Each half is missing what the other has. The side view's foragers live on a line, which is not how ants forage. The top view's colonies have no nest, so nothing the fungus does underground can be seen there.

## 2. The model: a plane and a curtain

**The plane** is the surface, a 2D hex map like today's open map: rock, ground, food piles (which regrow, PRD §50.5), the mound and the midden. An ant on it moves with today's top-down physics. The top view shows the plane.

**The curtain** is everything underground. It is one vertical 2D sheet that hangs under a line drawn through the nests' holes (§3), with coordinates *(s, depth)*:
- *s* is distance along the line;
- *depth* is rows below the ground.

An ant in the curtain moves with today's side-view physics: the shaft, chambers, the queen and brood, porters, digging and floor marks. The side view shows the whole curtain, unrolled flat, so no tunnel is ever off-screen.

**The surface belongs to the plane alone.** The curtain starts one row below the ground. The ground strip along the top of the side view is drawn from the plane cells under the line, with whichever ants stand on them, so nothing is simulated twice.

**A hole is the only way between the two.** An ant standing on a hole cell on the plane steps down into the curtain at *(s_hole, 0)*, and an ant climbing out of the shaft steps up onto the plane at the hole. The curtain's top row is its crust and is never dug except at a hole. Today `#crust` is a soil cell touching sky; the curtain has no sky, so in one world the crust is simply the curtain's row 0. No other way between the layers exists. A second hole for a colony (polydomy, `queens-and-merging.md` open question 3) would be a later, deliberate act: breaking through as a sensed choice (`ja-4h2`), then new entrances in one world (`ja-lp4.9`).

**State.** Each ant carries a *layer* (plane or curtain) and its *x, y* in that layer. Each layer has its own copy of:
- every colony's pheromones;
- the occupancy grids that fights read;
- its food: piles on the plane, buried pockets and chamber stores in the curtain.

The fungus's own body, the mycelium it grows where it lands by a hole (`Fungus.root`, PRD §50.12), lies **in the curtain**: in the soil walls of the shaft just under the hole, not on the plane. *Metarhizium* lives in soil and around roots ([fungus-body §1](fungus-body.md#1-growth-without-a-host)), and the owner holds (2026-11-08) that sunlight's UV would kill exposed spores and hyphae; primary sources are pending (`ja-2qv`). Its mass lives in the wall's soil and it sporulates onto the shaft's open cells beside it, so ants pick spores up on every trip in and out. The landing's first spores fall by the hole; after that, its spores reach the plane only on the ants that carry them, and on corpses on the midden. Today's game roots it on the open cells by the hole, the ground ants walk on; that changes with it (`ja-yo3`).

Fights happen within a layer. Two ants in different layers never meet, except across a hole.

**Why one sheet is honest enough.** Ground-nesting ants build what Tschinkel calls a "shish-kebab": a near-vertical shaft with flat chambers off it, about 1 cm high, largest near the top, with gaps that grow with depth ([nest-and-home: nest structure](nest-and-home.md#nest-structure)). A vertical sheet keeps that shape. It loses chambers that branch off sideways out of the plane. A full 3D volume was considered and set aside (owner, 2026-11-08): it costs depth-times the memory and tick time, needs 3D digging and homing, and its side view would be a cut that misses tunnels.

## 3. The line, and where a new nest may go

**The transect** is the holes in order, V₀ … V_k, joined by straight segments on the hex grid. It extends a margin past each end, so an end hole isn't drawn at the edge of the side view and an end colony has room to dig outward: about 64 cells (one chunk), with rock beyond. The mound no longer needs that room, because it lies on the plane (§4); U2 sets the margin from how far the side view's nests dig today. The game starts with two nests, so the line starts as one segment, Ink to Amber.

**The founding rule** (the owner's, made precise). A colony may be founded at point *p* only when all of these hold:
1. **Its nearest hole is an end** (V₀ or V_k). The owner's rule: no founding nearer an interior nest's hole, so the line always grows from an end and stays one unbranched strip. Ties are settled so a game replays exactly: a point as near an interior hole as an end is invalid, and a point as near both ends grows the line at V₀. With two nests both are ends, so the first founding may go beyond either.
2. **The new segment doesn't fold back.** It may not turn back on the end segment by more than 120° (so the angle between them at the shared vertex is at least 60°). Away from that vertex (beyond the clearance) neither it nor the margin it will carry past the new hole crosses the line, the far end's margin included, or comes within a clearance (about 12 cells) of it (owner, 2026-11-08: the new margin is curtain too). The clearance is excused on both sides of the vertex, which makes it agree exactly with the 120° limit. Otherwise the curtain would pass under itself, and one surface cell would sit over two places underground.
3. **It doesn't crowd a hole.** *p* is at least a hole gap from every hole, as a 2D distance. Today `Game.addColony` keeps `HOLE_GAP` (8) columns between holes in the side view and `NEST_GAP` (12) between nests top-down, and moves a founding rather than refusing it; one world uses one 2D gap. Rule 2's clearance already covers most of this.
4. **It is on open ground** on the plane.

**The line on the hex grid.** Column *s* of the curtain lies under *P(s)*, a plane cell on the line. Columns are hex steps (owner, 2026-11-08): a segment's columns are the hex line between its two holes, one column per step, so neighbouring columns always lie over the same or adjacent cells. Columns spaced 1 apart along the line could not promise that: two points 1 apart fall in cells 2 steps apart wherever the line clips a hex corner. A segment is therefore `hexDistance` columns long, the same as its length running east–west and up to ~15% longer at a slant, never shorter, so the curtain is no shortcut. A cell sits over two columns only right at a bend. U1's property tests check both over random lines.

**A landing that breaks the rule** (a queen's flight, `ja-lo8.9`, closed but not yet on main on 2026-11-08, whose landing rule U4 changes; the lab's "found a colony" button) moves to the nearest valid point within the flight's radius. If none lies within it, **the flight fails**: the queen dies, as most real foundresses do, and the game says why ("no room beyond the line's ends within her flight"). Decided by the owner (§8); `new-queens.md` §3 says so too.

**What growing the line does to the curtain.** The curtain is indexed by *s*, so what is dug underground keeps its place when the line grows; growing at V₀ uses negative *s*, so nothing is renumbered, which fits the endless world's outward chunks (`ja-qpv`). What changes is the old end's margin: its range of *s* now runs along the new segment instead of straight on, so tunnels dug there keep their *s* but lie under different ground. Spoil and the midden are plane data and stay where they are. Beyond the old margin the curtain is new, undug ground.

**A colony that falls keeps its vertex.** Its hole and tunnels stay. A later colony could take them over, which is the "abandonment" branch of `queens-and-merging.md` open question 3.

**Neighbours meet underground.** Adjacent nests are adjacent along *s*, so their tunnels can meet. Along the curtain the distance between two holes is the segment's length, the same as on the surface, so this is no shortcut. **Allowed** (§8): strangers who meet in the curtain fight or flee by the same contact response as on the surface (`combat.md`). A rule stopping diggers short of a neighbour would read another nest's position, which the vision counts as a gap.

## 4. What changes in the colony code

**The switch moves from the map to the ant.** Today everything side-only switches on the map's kind: `#entrance`, `map.sky`, `map.hasSoil`, or a queen being present (`queens-and-merging.md` notes `queen !== null` as a side-view flag in about 20 places). In one world each of those becomes a check of the ant's own layer:
- in the curtain: today's side-view code;
- on the plane: today's top-down code.

Most behaviour carries over unchanged. The new work is the seam between the two:
- **Homing on the plane.** Use the side view's drifting vector (`#believe`, `#integrate`) in 2D, aimed at the hole. Today `#believe` keeps only the horizontal part (`b.y = goal.y`), and `#inOwnNest`, `#neighbour` and `#middenSide` measure only |x| to a hole. On the plane those become 2D distances. The vector resets inside the nest, as real ants' does ([nest-and-home: outside](nest-and-home.md#outside-home-is-the-hole)).
- **The mound becomes surface data.** It becomes a spoil count per plane cell around the hole, a height field. Diggers carry pellets up the shaft and drop them on the plane. The side view draws the heap's cut through the curtain's sky rows. `heapMound` and the pellet pickers (`#pickLoose`, `takeLoose`) move to the plane, and the funnel that keeps every hole open becomes a ring on the plane.
- **The midden** becomes a disc at the edge of the cleared ground, facing the nearest hole in 2D ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs)).
- **The economy is the side view's: there is always a queen.** The larder stays, as the side view keeps it (the mode situation's `larder`, the queen laying while it holds), but it no longer turns into ants: "every 4 food makes an ant" is retired from one world.
- **Raids** walk the plane to the target hole and go down its shaft. Today's side-view raid does the same thing in one dimension (`raidTarget`, `#aimRaids`, the scout's trail of PRD §49).
- **The fungus** reads the ant's layer for its "ground" sense:
  - in the curtain: chamber or tunnel;
  - on the plane: the home-scent ratio.

  `muddle` and `crown` are always offered, because there is always a nest. One world asks under the side view's fungus context.

**Jev's cost should not change.** The mode situation keeps its fields and their meaning. `homeTrail` is a trail level on the plane and a place in the curtain, as today in each map. Confirm with `colony-cost` when the colony code lands; any change to a situation, legend or question needs its new figure in the PR (CLAUDE.md).

**Tick cost will rise; measure it.** The open map with 1,200 + 1,200 ants runs at 3.3–3.9 ms a tick (PRD §12, §14). The side view, which is what the curtain will run, is the slower of today's maps: 7.0–7.3 ms at 1,200 + 1,200 (PRD §36, §37), its nest life costing more than the open map's foraging. One world runs both, each for the ants in it, so budget about 7–9 ms and measure before switching the page (U6).

## 5. Two views of one game

- **Ground becomes a camera switch,** "above" or "below", and no longer builds a new game.
- **The top view** is the plane, with the line drawn dashed, the holes and each colony's mound disc. A label at each vertex names its nest.
- **The side view** is the unrolled curtain.
  - Each bend in the line is a faint vertical rule, labelled with the turn ("↱ 35°").
  - The strip along the top is the plane under the line.
  - Ants elsewhere on the surface aren't in this view.
- **The two views are linked:**
  - Clicking the line in the top view opens the side view at that *s*, and clicking the side view's ground strip opens the top view there.
  - A followed ant can carry the camera across at the hole, as an option.
  - Each view keeps its own camera (`camera.ts` is already pure) and minimap.
- **On wide screens**, U5 ships the switch alone. Both views at once (side by side or stacked) is a follow-up, `ja-lp4.8` (§8).
- **The Learn drawer's Nest tab** always has a nest to show. The field guide gains an entry for the line and the curtain.

The renderer reads `colony.map.rock` row by row today (`paintChunk`, `drawHexes`, the minimap). The side view needs one more step: a column *s* maps to the plane cell *P(s)* for its ground strip. Below ground the curtain is a plain grid, so it draws exactly as the side view does now.

## 6. Building it: stages and guards

The page keeps today's two maps until one world passes its own guards. U6 then takes them off the page (§8). The side view and the open map stay as test beds, with their golden masters bit-exact, until their assays are re-baselined on one world.

| Stage | What | Guard |
|---|---|---|
| U1 (built) | `transect.ts`, pure: the line, *s* ↔ plane cell, signed *s*, `canFound` and `nearestValid` (the four rules of §3, with their ties), the turn limit, crossing and clearance tests | unit tests, with property tests over random lines: neighbouring columns map to the same or adjacent cells; no valid founding makes the curtain overlap itself |
| U2 | `generateOneWorld`: the plane from the open-map generator, the curtain from the side-view generator along the line. Both views drawn, with no simulation yet | map invariants: each hole is open on both layers; the curtain's ground row lies under *P(s)* |
| U3 | colonies on two layers: per-ant layer, hole crossings, 2D homing, the mound and midden on the plane, the queen economy | a new golden master for one world; the old ones bit-exact |
| U4 | founding on the line: `Game.addColony` checks `canFound`; the lab button becomes "found beyond ‹end nest›"; the queen's landing (`ja-lo8.9`) moves to the nearest valid spot or fails; saves | save round-trip; founding property tests |
| U5 | the page as one game in two views, linked (§5) | Playwright: switch views mid-game, follow an ant through a hole |
| U6 | G1, a G-like whole-game guard on one world; assays A1–A10 rerun on the plane; tick cost measured (budget 7–9 ms at 1,200 + 1,200); the page's default switched; the Ground control's world switch retired | `npm run exp`, `test:slow`, the bench |

A research bead (`ja-lp4.7`) runs alongside: **nest spacing and flight distance.** No note gives a nearest-neighbour distance between nests or how far a founding queen flies, and the founding radius (§3) needs one. That needs primary sources, like every sense in the vision table.

## 7. What stays the same

- The policy, its situations, the doctrines and the local rules.
- The fungus's levers and its policy.
- Recognition and odour.
- The hex grid and its chunks.
- Behaviour MRs 1–5.2 as built. Each was tuned on one map kind, and in one world it runs on the layer it was tuned for.

## Play

*Added 2026-11-08 (`ja-gvt`). The case for play of one world; nothing here is built (PRD §51, `ja-lp4`).*

- **See:** one game in two views (§5). From above, 2D foraging, trails and raids round every colony's hole and mound; below, the curtain unrolled with every nest's chambers, queen and brood. Today each map shows only half (§1). The field guide gains an entry for the line and the curtain, and the Nest tab always has a nest (§5).
- **Choose:** every lever means something in the same game. The nest levers (floor marks, queen signal, crown) are always offered (§4), beside 2D foraging, where the trail levers act on branching trails rather than on the side view's one-cell walkway (§1). Where to land matters more: the mycelium lives in the shaft's soil under the hole (§2, PRD §51), and its spores reach the plane only on ants and corpses.
- **Counterplay and progression:** unchanged in kind (fungus-policy §6, PRD §50.12). The line shapes the late game: a daughter colony (chapters 5–6, PRD §50.4) may found only beyond an end, and a flight with nowhere to land fails (§3, §8); neighbours' tunnels may meet underground and fight by the contact response.
- **Cost:** Jev's should not change, since the mode situation keeps its fields (§4); U3 confirms it with `colony-cost`. One world asks under the side view's fungus context, so the side view's shipped fungus answers apply on the surface too (PRD §50.9 notes a top-down game has none). Not measured.
- **Risks:** tick cost, budget 7–9 ms at 1,200 + 1,200 ants against the open map's 3.3–3.9 ms (§4, PRD §51); at 4× the top bar's "running at" warning would show a shortfall (PRD §50.4). Legibility: ants elsewhere on the surface are not in the side view, and the mycelium is hidden underground. A founding rule the player can't read: the game must say why a flight failed (§3).
- **Owner decisions needed:** none. The founding radius is decided (§8).

## 8. Decided, and still open

**Decided (owner, 2026-11-08):**
1. **Underground meetings are allowed.** Neighbouring colonies' tunnels may meet in the curtain; the contact response decides what happens (§3).
2. **A flight with nowhere to land fails.** When no valid point lies within her radius, the queen dies and the game says why (§3). This replaces "the player's queen lands" in `new-queens.md` §3.
3. **Wide screens: the switch first.** U5 ships the above/below switch with linked clicks. Both views at once is a follow-up (`ja-lp4.8`).
4. **The old maps become tests only after U6.** The side and open maps leave the page and stay as test beds until their assays are re-baselined.
5. **The founding radius is 140 cells, the same as the flight** (`ja-lp4.10`; [nest-spacing §4](nest-spacing.md#4-the-numbers-for-the-game)). Measured: flight 140 with a 70-cell radius failed 51% of flights from end nests and 55% from interior ones; with 140, 6% and 28% (`scripts/flight-failure.mjs`, 300 seeds on the default plane). The hole gap and clearance stay 12. U4's assay on seeds 1–20, with the open map's rock, checks it; the endless world (`ja-qpv`) looks at it again, since the plane's edges drive most failures at a smaller radius.

**Still open:** nothing.
