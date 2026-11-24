# Fog of war: the player sees only what its organisms sense

*Research and design note, 2026-11-23, epic `ja-1ypq`. Nothing here is built. It answers the owner's request (2026-11-23), made in preparation for the endless world ([endless-world](endless-world.md), `ja-qpv`): the player sees only what the fungus and its infected ants have sensed, and where an infected organism has left, the page stops drawing updates. Other organisms will be observers later. Decisions: PRD §89. Code references are to `web/src/` on main at 96832d4.*

## TL;DR

- **Three states per cell**, as in strategy games since Warcraft II: *unknown* (never sensed), *remembered* (sensed before, nobody there now) and *live* (an observer senses it this step).
- **The observers** are the fungus's hosts (every infected ant, of any colony, at its antennae's reach) and the fungus's living body (every hypha cell, patch cell and flower, about 2 cells round it). Spores and corpses see nothing (owner, 2026-11-23). Later organisms join through the same interface, each with the reach from its own sense table.
- **Remembered ground shows the last-seen state, never ants** (owner, 2026-11-23): rock, tunnels, food, spoil, mounds, chambers, hyphae and nests as they were when the last observer left, with "last seen N s ago". Ants, brood and queens show only where live.
- **The readouts follow the fog** (owner, 2026-11-23): a colony enters the stats, badges and the go-to menu once the fungus has sensed its nest or holds a host in it. Its numbers are live while hosts are inside, otherwise as of when the last one left.
- **The start reveals only the landing patch** and its sight (owner, 2026-11-23).
- **A picture only.** The simulation never reads it: golden masters stay bit-exact and Jev costs nothing. The cost is CPU per step and memory per explored chunk, both measured in the build.
- **Eight stages, F1–F8** (§8). F7 is the fog's share of the endless world's page stage E5 (`ja-qpv.4`).

## 1. Where we are

**What sees today.** `SensedMap` (`ui/fungusSight.ts`, PRD §65) was stamped once per render frame (`ColonyApp.tsx`, `onFrame`) before F1, which stamps after every sim step. Each living ant of any colony and any strain with `load >= INFECTED` marks the cells within `sensorDistance + REACH_MARGIN` (3 + 1 cells) with the sim time. Trails and alarm show in a cell as strongly as that mark is fresh, fading over `SENSED_FADE` = 20 s. A chunk faded right out is dropped and leaves a per-chunk `revealed` bit (E1.3, PRD §66), which nothing reads yet. The fungus's own body stamps nothing.

**What the page shows regardless.** The renderer and every card read the live `Game` objects directly. Only trails and alarm are gated. Everything else shows everywhere:

| Surface | What it shows of the truth |
|---|---|
| Ground chunks (`field/ground.ts`), hexagon mode, food sprites | rock, soil, food, quality, spoil and mound, spores, chamber tints |
| `drawNest`, `drawAnts`, `drawStripAnts` (`field/nests.ts`, `ants.ts`, `overlays.ts`) | every nest, brood pile, queen, alate, corpse and living ant of every colony |
| The voxel pass (`mapVoxel.ts` through `inspectViewport`) | every cell in view, ants and brood included |
| The curtain strip (`stripAt`) | the plane under the line, repainted every frame |
| The minimap (`field/minimap.ts`) | the whole map, every ant coloured by odour |
| Picking, `AntCard`, following (`field/hit.ts`, `follow.ts`) | any ant anywhere, its mode, position and Jev answer |
| Lens and cell inspection (`lens.ts`, `cellInspection.ts`) | workers, queens, brood, chamber food, midden, hole owner |
| Nest badges (`badges.ts`) | each nest's infection share and queen state |
| Stats, history, `FungusStatus`, goal toasts (`stats.ts`, `history.ts`) | every colony's population, brood, losses, infection share |
| Go-to menu and `n` (`FieldGoToMenu.tsx`) | every colony's nest, seen or not |
| Chamber labels and the nest tab (`LearnDrawer.tsx`) | every colony's chamber table |
| Specimens (`useSpecimens.ts`) | a pinned ant's death wherever it happens |

**What can be reused.** `MapChunkPaintCache` (`ui/mapChunkPaintCache.ts`) keeps a byte copy of each chunk's paint inputs to decide when to repaint. That is the snapshot's format already. The sim's clock is `Game.time`, saved with the game.

## 2. How games do it

**Three states.** Warcraft II (1995) is usually credited with the two-tier fog: a black shroud where nothing has been explored, and grey terrain where you explored but no unit sees now, with enemy units shown only in sight ([retrospective](https://www.gamedev.net/tutorials/game-design/game-design-and-theory/retro-mortis-rts-part-3-forged-in-steel-r3898); who was first is disputed). StarCraft II greys explored ground out of sight and darkens the unexplored ([Blizzard's guide](https://news.blizzard.com/en-us/article/4546768/game-guide-map-elements)). 0 A.D. names the three states shroud, fog and line of sight in its manual and codes them as `LosState { UNEXPLORED, EXPLORED, VISIBLE }` ([source](https://docs.wildfiregames.com/pyrogenesis/Los_8h_source.html)). All **unverified**: seen in search summaries, not read (the hosts are outside this session's network).

**What is remembered.** Buildings and terrain are kept as last seen, units are not:
- Age of Empires II's manual says a building in the fog shows "in its current state" as last seen until a unit returns ([manual](https://www.scribd.com/document/36345894/Age-of-Empires-II-Manual-PC), **unverified**). Players report ghosts: destroyed buildings that reappear or are doubled ([forum](https://forums.ageofempires.com/t/double-building-in-fog-bug-fog/72440)).
- OpenRA calls them "frozen actors" ([traits](https://docs.openra.net/en/release/traits/), **unverified**). Warzone 2100 tickets ask that a remembered object leak no change, such as a vanished tree or new damage ([#3959](https://developer.wz2100.net/ticket/3959), **unverified**).
- Factorio keeps a chart per force, one image per chunk. A chunk not re-charted for about 10 s keeps its last image. Trains are left off the chart because they move on ([radar](https://wiki.factorio.com/Radar), **unverified**). A save grows with the chunks revealed (forum, **unverified**).
- Dwarf Fortress's adventure mode forgets explored ground over time, by a Memory attribute ([wiki](https://dwarffortresswiki.org/index.php/Adventure), **unverified**): a memory that depends on the organism.

**Who sees.** In Pikmin (2001) the map shows only where the *leaders* went, not the Pikmin ([wiki](https://pikminwiki.com/Radar_Map), **unverified**): only some of your agents are observers. StarCraft II's Zerg creep gives no vision of its own; the tumours on it do ([guide](https://news.blizzard.com/en-us/starcraft2/5838584/game-guide-zerg-creep), **unverified**). Factorio's roboports chart the area their network covers. **No shipped game was found where a parasite sees through its infected hosts**: nine queries found none (Plague Inc., Carrion, Empires of the Undergrowth and fungus-network games have no such fog that a search turned up). The space looks open; an absence found by search is **unverified**.

**Techniques.**
- **Counts per cell.** Catlike Coding's hex map counts observers per cell and marks a cell explored on its first increment; visibility and explored state go to the shader in a per-cell texture ([part 21](https://catlikecoding.com/unity/tutorials/hex-map/part-21), **unverified**). 0 A.D. packs two bits per player per vertex and also counts observers. The risk of counts is a missed decrement that leaves a cell lit for good; rebuilding the set from the observers each step cannot drift.
- **Discs, not lines of sight.** 0 A.D. reveals plain discs and declined terrain occlusion.
- **Drawing it.** League of Legends keeps fog on a 128 × 128 grid, upscales it to 512 × 512, blurs it and darkens the world with it; more blur did not fix jagged edges, upscaling did ([Riot](https://technology.riotgames.com/node/39), **unverified**). Snapping the camera to the fog's texels cures edge flicker (forum).
- **The simulation never reads the fog.** Age of Empires ran lockstep by sending only players' commands ([Bettner & Terrano 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond), **unverified**), so every client holds the whole state and a map hack only reads memory. Here there is one player on localhost: hiding data from the player doesn't matter, keeping the player's view out of the simulation does.

**In the game:** three states per cell; a per-cell explored bit; live rebuilt from the observers each step rather than counted; remembered chunks hold the paint inputs as last seen and change only when an observer returns; ants are never remembered (Factorio's trains); the fog mask drawn at low resolution, upscaled and blurred. A remembered chunk says how old it is, so a ghost doesn't pass for the present.

## 3. Can a fungus see?

**What the parasite does inside an ant.** Fredericksen et al. (2017, PNAS) imaged *Ophiocordyceps unilateralis* s.l. in manipulated *Camponotus castaneus* in 3-D. "Fungal cells were found throughout the host body but not in the brain", and they formed connected networks around the muscles. The authors conclude that the fungus's control of the body "occurs peripherally", perhaps by chemical means, and call the networks a possible "collective foraging behavior" of the parasite ([PMC5703306](https://pmc.ncbi.nlm.nih.gov/articles/PMC5703306), read in full; the discussion only through a summary). Nothing there shows the fungus reading its host's senses. Will, Attardo & de Bekker (2023, Sci. Rep.) point at disrupted neurotransmitter signalling during summiting and name the clock and olfaction genes as possible targets ([paper](https://www.nature.com/articles/s41598-023-40065-0.pdf), **unverified**): the fungus changes what the host senses and when it acts, it does not use it as eyes.

**What a fungus senses of its own.** An entomopathogen meets its host by contact: "Infection begins with attachment of single-celled dispersive forms of the fungus" to the cuticle, by "non-specific passive adsorption" then consolidation, through hydrophobins and the MAD1 adhesin, and the cuticle's lipids and hydrocarbons "promote or inhibit fungal attachment" (Ortiz-Urquiza & Keyhani 2013, *Insects*, [PMC4553469](https://pmc.ncbi.nlm.nih.gov/articles/PMC4553469), read in full). Hyphal tips steer toward chemical gradients at short range ([hyphal-traffic](hyphal-traffic.md#mechanism-what-a-tip-could-sense-of-a-passing-ant-2026-11-23)). **No measured sensing distance for mycelium was found** in this search or in hyphal-traffic's nine.

**In the game:** the player is the fungus, and "seeing through the hosts" is a game abstraction, marked **design**: the parasite's cells reach every part of its host (Fredericksen 2017), and the player is shown what the host's antennae reach. The body's own sight of about 2 cells is **design** too, the order of contact plus short-range chemistry, below the 3 cells of the tip's traffic sense ([vision.md](vision.md), sense table). Neither is a policy input: no ant and no fungal lane reads the fog.

## 4. The model

### 4.1 Observers

One source interface, so later organisms plug in without touching the fog (`ja-1ypq.1`, `ja-1ypq.8`):

- **Hosts:** every living ant, of any colony, with `load >= INFECTED`, at `sensorDistance + REACH_MARGIN` on the ant's layer. Strain doesn't matter (owner, 2026-11-23). Queens and alates are hosts too, but the stamp still skips them: left for a later change (`ja-1ypq.1` notes).
- **The body:** every hypha cell (`hyphaeOn(l).parent`, mats included), patch cell (`patchOn(l)`) and flower, at `BODY_SIGHT` = 2. Spores on the ground and colonised corpses see nothing (owner). The body changes on the hyphae's clock (a tip step every 1–2 s), so it is stamped incrementally or on a coarser interval; the cost is measured at a big mycelium before it is chosen.
- **On the sim clock.** Stamps follow `Game.time` steps, not render frames, so a slow machine sees what a fast one sees.

**In the game:** sight is a property of the player's organism and its hosts, read from what the simulation already holds. It adds no sense, no action and no situation field.

### 4.2 Three states per cell

- **Explored:** a bitset per layer and chunk, one bit a cell (512 B a chunk), set on first sight and never cleared. Per cell rather than per chunk (the endless note's first proposal): a chunk is 64 cells across, about 16 host reaches, so a per-chunk bit would show far more than was sensed.
- **Live:** stamped by an observer at the current step, or within `GRACE` = 1.5 sim s of it, so the edge of a walking host's disc doesn't flicker and the body, stamped every `BODY_EVERY` = 1 s, stays live between stamps (`GRACE` must exceed `BODY_EVERY`; a test holds it).
- **Remembered:** explored and not live.

### 4.3 Last-seen snapshots

- **Built (F2, `ui/fog/knowledge.ts`):** a snapshot per chunk and source, kept up to date cell by cell while a cell is sensed: the cells an observer senses are copied from the truth in the same step. So a remembered cell keeps what it held when last sensed, and cells of one chunk that different hosts left at different times each keep their own last sight. A cell still live within the grace is at most `GRACE` stale, so the renderer draws every explored cell from its snapshot and nothing pops when it turns remembered. "Last seen" is kept per 8 × 8 block (256 B a chunk).
- A chunk never sensed has no snapshot. One whose snapshot equals the truth draws the same either way.
- Ants, brood, queens and alates are never in a snapshot (owner). Corpses on the ground are remembered as ground items, since they don't move (owner, 2026-11-23).

### 4.4 Known colonies

A colony is **known** once an observer has sensed a cell of its nest disc or it holds a host. From then on the readouts list it. Its numbers are live while it holds a host, and frozen at the step its last host left, with "as of". An observer that senses its nest again without a host learns that the nest is there (and, if it is gone, that it is gone), not its counts.

**Scent stays as §65 has it:** trails and alarm show where sensed within 20 s. In remembered cells they have faded; in live cells they are the truth.

## 5. The picture

### 5.1 The field (`ja-1ypq.3`)
- **Behind a setting.** `fog` off draws today's field pixel for pixel (`scripts/field-shots.mjs`).
- Ground, hexagon mode, the voxel pass, the strip and the minimap draw remembered cells from the snapshot, greyed, and unknown cells as fog.
- Ants, the queen, brood and alates draw only in live cells.
- The fog mask is drawn per cell at low resolution, upscaled and blurred, and snapped to the grid (§2).

**Built so far (F3.1, `ja-1ypq.3.1`, behind `?fog=1`; off by default until F6):** `SensedMap.knowledge` carries the `Knowledge`; ground chunks (`field/ground.ts`) paint unexplored cells as fog, sensed cells from their snapshots, and dim the ones nobody senses now; the food sprites read the snapshot; `actorCull` (`field/fogCull.ts`) draws ants, brood, the queen, alates and corpses only where live; a nest's disc, mound and entrance show once its place has been sensed. While the fog is on, the 3-D voxel pass falls back to 2D.

**F3.2 (`ja-1ypq.3.2`, same flag):** the curtain's strip and its cut are the plane under the line as last sensed (`planeGround` in `field/fogCull.ts`): fog where that plane cell was never sensed, dimmed where nobody senses it now; the plane's ants over the strip only where live. The minimap paints unexplored pixels as fog, the rest from snapshots (dimmed when remembered), and ants only where live. In hexagon mode the dirt pellets come from the snapshot. Spores and hyphae are the fungus's own body and always draw. Corpses show only where live for now: remembering them needs a corpse source (F3.3).

**F3.3 (`ja-1ypq.3.3`, same flag):** aphids draw only where live; chamber labels only where live (a role is read live); hole names and the strip's bends only at holes the fungus has sensed; the line and its hole dots only between and at sensed holes (owner call pending: fog like the rest, recommended; the alternative is a map the player always knows); the fungus's colonised corpses and stalks only where the place has been sensed; a remembered chamber is tinted plainly, since its role may have changed; and the dead are remembered as ground items (`fog/corpses.ts`, `CorpseMemory`): kept as they lay when last seen, shown a little fainter where nobody senses now, forgotten when an observer senses the place again and finds them gone. Still to do for the field: the followed ring, specimens, traces and the hover inspection (F4).

### 5.2 Picking and cards (`ja-1ypq.4`)
- Only ants in live cells can be picked.
- Following a non-host ends with "lost sight" when it leaves; hosts stay followable.
- The lens and cell inspection show the snapshot on a remembered cell with "last seen N s ago", and "unexplored" on an unknown one.
- Specimens lose track out of sight.
- Chamber labels appear only for known nests. The nest tab (`LearnDrawer.tsx` `NestCard`: queen, brood and ant counts per colony) follows §5.3.
- **Decided (D1, owner, 2026-11-23):** for a known colony with no host in it, the nest tab and stats show queen and brood counts "as of N s ago", and nothing is drawn on the map.

**Built (F4, `ja-1ypq.4`, same flag):** `pickAnt` finds only ants where live (so the lens's ant, the ant card and follow-by-click do too); a click on a chamber nothing has sensed finds none; a followed ant that is no longer sensed ends the follow and a toast says "Lost sight of ant #n" (a host is always sensed, so it stays); the lens (`probe`, `lensLines`) says "Unexplored" for a place never sensed and, for a remembered one, the ground, food and mound as last seen, a plain chamber and "Last seen N s ago"; cell inspection reads nothing of a place never sensed, no ant, queen, brood or aphid of a remembered one, and the dead as they lay when last seen; a pinned specimen out of sight shows only who it is, and a death out of sight is not reported until the place is sensed again; the queen's pen asks no preview of ground the fungus has not sensed. Review fixes: every route that would take the camera or a card to an ant goes through `canFollow` (`follow.ts`: the specimen row, `goTo`, a pinned lens card), a lost specimen's row is disabled, the 3-D patch's food, ground and spoil read the snapshot (nothing for ground never sensed), the cell card says "Unexplored" or "Last seen N s ago" (remembered ants, brood and counts are dashes), and the frame that loses sight draws no follow ring. Still open: the ant card shows the ant's Jev situation, which may include ground the fungus has not sensed (owner call: leave it, show it to hosts only, or blank the unknown fields), and the tutorial follows a non-host worker, so under `?fog=1` its follow step ends at once (F6). Not covered: the hover cell inspection's fungus part (hyphae, colonised corpses) reads live at an unsensed cell (the body is always sensed, so it is rarely unknown); traces of moved ants.

### 5.3 Readouts (`ja-1ypq.5`)
- Stats, history, goal toasts, nest badges, the nest tab and the go-to menu list known colonies only, live or as of (§4.4).
- The Lab's cards and the dev hook stay omniscient, since they are tools rather than play (owner, 2026-11-23).

**Built (F5, `ja-1ypq.5`, same flag):** `SensedMap.known` (a `KnownColonies` of each colony's `SideStats`, read at most every 0.5 s while a host is in it, kept as of the last host's leaving) is updated after each sim step. The "In the colonies" panel lists only known colonies, with "as of N s ago" where no host is in one and "its nest is known; no host has been in it yet" for one known by its hole alone, and shows the unity bar only when every colony is known; the top-bar goal line and the ending toast say a colony is gone, or that the colonies are one, only once the fungus knows them (`endingKnown`); the Codex counts the known colonies' deaths and the odours' gap only while two are known; the Go-to menu and the `n` key list and cycle the known nests; the Learn drawer's nest tab has no card for an unknown colony and a last-known card (queen, brood, ants, as of when) for one with no host in it. A colony is known by its own hole (`holeCells[params.nest]`, a plane cell) or by a host; the command palette's nests follow the same rule. The Lab's cards, history and Policy tab stay omniscient (owner); the unity bar and the Codex's deaths read the known colonies' live numbers, and an ending is told once the colony is known, ever: both await the owner (review of #404, D1). Not covered: an ending missed while unknown does not toast later (the goal line shows it once known); the ant card's situation (F4 note); the panels' rendering has no test (the pure `knownView.ts` does).

### 5.4 The start and the builder (`ja-1ypq.6`)
- At landing only the patch and its `BODY_SIGHT` are explored. The landing colony's hole shows only if it lies within reach.
- Fog is off while the builder is on, as smell vision already overrides §65 there (PRD §73) (owner, 2026-11-23).
- The page's default flips to fog on once the owner has played it.

## 6. On the endless world (`ja-1ypq.7`, in E5 `ja-qpv.4`)
- **The camera** may go anywhere explored, plus a margin. That replaces the map's clamp, as [endless-world §8](endless-world.md#8-saves-and-the-page) asks.
- **Lines.** Knowledge is keyed by layer, so each line's curtain keeps its own.
- **Frozen colonies** need nothing special. A frozen colony is where the fungus is not, so it is remembered ground showing its last-seen state, which is what the endless note asks for.
- **Memory** grows with ground explored: 512 B a chunk for the bits, which is 5 MB at 10,000 chunks, plus snapshots. A snapshot of a chunk unchanged since it was seen can be dropped and drawn from the seed plus the chunk's delta, so snapshots grow with ground changed out of sight. A soak measures it: a host walks 50 U out and back.
- **Saves** carry the explored bits and the snapshots. No backward compatibility is needed (owner, 2026-11-10).

## 7. Other organisms (`ja-1ypq.8`)

[vision.md](vision.md#the-ladder)'s ladder gives each new organism its own sense table. The fog takes an observer's reach from that table: a termite host from its antennae, a lichen partner (PRD §85) from whatever its note finds it senses. The first one writes the contract test: an observer stamps only its reach, only while alive, only on its layer. Several organisms of the player's are then several observer kinds feeding one knowledge model.

## Play

- **See:** the map starts dark round a small landing patch. It opens as the mycelium grows and as hosts walk, and stays behind them as remembered, greyed ground, with ants only where the fungus is. A nest the fungus left is shown as it was, aged; what happened there since is unknown until a host goes back.
- **Choose:** where to spread now decides what the player can see. Infecting a forager that walks far is a scout. Growing the body toward a nest keeps it in sight. Which colony to work on is chosen from what is known, not from a map handed over.
- **Progression:** the visible world grows with the fungus, a slope. On the endless world the fog is the frontier the endless note wants ("the fog makes the frontier something to push").
- **Counterplay:** colonies that groom out their hosts blind the player there. Social immunity costs sight as well as hosts.
- **Cost:** no Jev tokens: no legend, question or situation changes, and a cached game still spends nothing. The CPU cost is stamping per step plus the fog mask per frame; the memory cost is §6's.
- **What could make it worse:**
  - **Too dark to learn from.** A new player sees little before the first host. Watch the tutorial's first steps and the time to the first host (§61.2's measurements).
  - **Ghosts that mislead.** A remembered nest that is long gone. "Last seen N s ago" says how old it is.
  - **A blind spell.** When every host dies, only the body sees. That is honest, but the readouts must still say what is known.
  - **Edge flicker** at a walking host's disc: the grace period and the blurred mask.
  - **A cost that runs away** at a big mycelium: F1 measures it before choosing how to stamp the body.

## 8. Stages

| Stage | What | Guard |
|---|---|---|
| F1 observers (`ja-1ypq.1`) | one observer interface; every host and the living body; stamped on the sim clock | goldens bit-exact; the same stamps at 30 and 60 fps; stamp under 0.5 ms a step at a big mycelium |
| F2 knowledge (`ja-1ypq.2`) | `ui/fog/`: explored bits, live with grace, snapshots on leaving, known colonies, a `FogView` | a change while away is not shown; a snapshot equals the truth when its chunk left sight; bytes per chunk measured |
| F3 the field (`ja-1ypq.3`) | ground, voxel, strip and minimap through the view; ants only where live; the fog mask | off is pixel-identical (`field-shots`); an e2e section; frame time within noise |
| F4 picking and cards (`ja-1ypq.4`) | live picking, "lost sight", last-seen lens and inspection, specimens, chamber labels | a test per surface on a remembered and an unknown cell |
| F5 readouts (`ja-1ypq.5`) | known colonies in stats, history, toasts, badges, go-to | an unknown colony is absent; numbers freeze and resume |
| F6 start and builder (`ja-1ypq.6`) | the landing patch only; fog off while building; the default flips | the e2e landing section; the owner's go |
| F7 endless (`ja-1ypq.7`, in `ja-qpv.4`) | camera to explored ground; per line; saves; the memory soak | the soak; a save and load keeps the fog |
| F8 other organisms (`ja-1ypq.8`) | the observer contract | the contract test |

F1 and F2 change nothing on the page and can land before the endless world. F3–F6 work on today's bounded world behind the setting. F7 waits for E3 and E4.

## 9. Still open

**Decided (owner, 2026-11-23):**
1. The fungus's living body sees about 2 cells (hyphae, mats, patches, flowers); spores and corpses see nothing.
2. Remembered ground is ground, without ants, with "last seen".
3. Readouts cover known colonies, live or as of when they were last known.
4. The start reveals only the landing patch.
5. Every host sees, of any ant kind; strain doesn't matter.
6. Fog is off while the builder is on.
7. The Lab's cards and the dev hook stay omniscient.
8. Corpses are remembered in snapshots, as ground items.

**Still open, each with a recommendation:**
1. **The grace period.** Built as 1.5 s (it must exceed the body's 1 s stamp interval); F3 may tune it by eye.
2. **A hitch when the body is stamped.** Built as one stamp every `BODY_EVERY` = 1 s: about 0.16 ms a step averaged at 10,000 hypha cells, but the one step that pays costs about 5 ms (14 ms at 30,000). Spread it over steps if a real game's mycelium gets that big (review of #371).
3. **Memory that fades** (Dwarf Fortress). Recommend not now: revisit after the endless world's soak.

## Sources

Read in full:
- Fredericksen MA, Zhang Y, Hazen ML, Loreto RG, Mangold CA, Chen DZ, Hughes DP (2017). Three-dimensional visualization and a deep-learning model reveal complex fungal parasite networks in behaviorally manipulated ants. *PNAS* 114(47):12590–12595. https://pmc.ncbi.nlm.nih.gov/articles/PMC5703306
- Ortiz-Urquiza A, Keyhani NO (2013). Action on the surface: entomopathogenic fungi versus the insect cuticle. *Insects* 4(3):357–374. https://pmc.ncbi.nlm.nih.gov/articles/PMC4553469

Seen only in search summaries (**unverified**; the hosts were outside this session's network):
- Will I, Attardo GM, de Bekker C (2023). *Sci. Rep.* https://www.nature.com/articles/s41598-023-40065-0.pdf
- Blizzard, StarCraft II map elements: https://news.blizzard.com/en-us/article/4546768/game-guide-map-elements ; Zerg creep: https://news.blizzard.com/en-us/starcraft2/5838584/game-guide-zerg-creep
- Wildfire Games, 0 A.D. `Los.h`: https://docs.wildfiregames.com/pyrogenesis/Los_8h_source.html ; manual terminology: https://trac.wildfiregames.com/wiki/Manual_Terminology?version=16 ; terrain occlusion declined: https://trac.wildfiregames.com/ticket/3634
- Catlike Coding, Hex Map parts 21–22: https://catlikecoding.com/unity/tutorials/hex-map/part-21 , https://catlikecoding.com/unity/tutorials/hex-map/part-22/
- Riot Games, the fog of war in League of Legends: https://technology.riotgames.com/node/39
- Bettner P, Terrano M (2001). 1500 archers on a 28.8: https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- Factorio wiki, Radar: https://wiki.factorio.com/Radar
- Age of Empires II manual: https://www.scribd.com/document/36345894/Age-of-Empires-II-Manual-PC ; ghost reports: https://forums.ageofempires.com/t/double-building-in-fog-bug-fog/72440
- OpenRA traits: https://docs.openra.net/en/release/traits/ ; Warzone 2100 ticket 3959: https://developer.wz2100.net/ticket/3959
- Pikmin radar map: https://pikminwiki.com/Radar_Map ; Dwarf Fortress adventure mode: https://dwarffortresswiki.org/index.php/Adventure
- Gamedev.net, RTS retrospective part 3: https://www.gamedev.net/tutorials/game-design/game-design-and-theory/retro-mortis-rts-part-3-forged-in-steel-r3898

Not found: a measured sensing distance for mycelium; a shipped game where a parasite sees through its hosts; Factorio's own write-up on charting; StarCraft II's official snapshot rules.
