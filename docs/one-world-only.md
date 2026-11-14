# One world only: what the old maps' tests, assays and slow guards become

*Stage 2 of the foundation refactor ([refactor.md](refactor.md#stage-2-one-world-only-owner-2026-11-11)), step 1: the inventory (`ja-fnd.3.1`). Written 2026-11-14 from a read of the tests; nothing was run.*

Paths are relative to `web/src/colony/` unless they start `ui/`.
Test names are quoted as their prefix: the whole name is in the file at the line given.

**Read this first: what S2 can actually delete.** `generateOneWorld` builds its plane with `generateWorld(seed, { ...OPEN_WORLD, ...opts.plane })`
(`oneWorld.ts:70`), and `generateWorld` starts from `DEFAULT_WORLD` (`world.ts:688`): the plane takes its size (512 × 368), `foodPerCell`,
`nestCount` and `nestGap` from there. So the open-ground generator *is* the plane's generator, and tests of `generateWorld(…, OPEN_WORLD)`
terrain test the plane: they are **port**, not delete. The top-down soil map is not separate code either: it is `DEFAULT_WORLD`'s `soil`,
`rockiness` and `patchesPerChunk` with `OPEN_WORLD` left off, so deleting `DEFAULT_WORLD` would change the plane and its golden. The curtain
reads `SIDE_WORLD`'s `rockiness`, `soil`, `patchesPerChunk`, `foodPerCell` and `foodMinDist` (through `buryPockets`, `world.ts:844-855`), and
uses `groundCell`, the side view's ground rule (`oneWorld.ts`). What S2 does: fold `DEFAULT_WORLD` + `OPEN_WORLD` into one set of plane
options; move those `SIDE_WORLD` values and `groundCell` into the curtain; then delete `generateSideWorld`'s own surface, walkway, ground line
and mound.

Two more points apply across the tables:
- **Hand-made fields** (`worldFromArrays`, `hexMap`, the builders' `arena()`, experiment `Arena`) run the top-down branch (`entrance === null`).
  That branch is also the plane's code (`colony.ts:1762`, `1781`, `1798`, `1944`), so their per-ant tests stay. But **`Game` becomes one-world
  only** (owner, 2026-11-14, review of #181 D1): each such test moves onto `oneArena(field, seed)` (the field as the plane, a hole at each nest,
  the curtain under it), so its "keep" means **keep (swap to `oneArena`)**. The queenless path a hand-made colony takes (it grows straight from
  its stores, `colony.ts`) goes with the old maps, so a hand-made test of growth, the stores or ageing on that path is **delete** or **port
  (curtain)**, not keep.
- **The colony-wide strategist** (`StanceSituation`, `localStance`, the stance lane `c0`, `stanceGate 0` broadcast, `strategyChoices`) is deleted by S2.
  So are its tests, even on hand-made maps. I list them under **delete**.

## 1. Test files

`builds` key: **S** `generateSideWorld` (usually `SMALL_SIDE`), **T** `generateWorld` top-down (**T-open** with `OPEN_WORLD`, **T-soil** without),
**H** hand-made (`worldFromArrays` / `hexMap` / `arena()`), **O** one world, **—** no map.

### Colony unit tier (`tests/unit`)

| file | builds | what it tests (≤ 15 words) | verdict | target or covering test / note |
|---|---|---|---|---|
| unit/backfill.test.ts | H | backfilling unused dead ends, pellets not dug back out, youth guard | keep | hand-made soil field |
| unit/bindPolicy.test.ts | T-soil 120×80 | policies bound through `bindPolicy`; no outside code assigns a policy field | keep (swap map) | `smallOne()`. Test "a colony's mode and stance policies…": its stance half binds the strategist's lane, so **delete** that half with `StanceSituation` |
| unit/chapters.test.ts | S (test 2) | chapter order; the landing: spores by the hole, first host within 2 min | port (test 2) | test 1 has no map (keep). "landing: spores fall by the hole…" → `generateOneWorld`. `int/oneWorldGame` "the landing is on the plane by the hole…" covers where it lands and the plane-only dose. It does not cover "nobody dosed", "lands once", "first host < 2 min" or "rival stays clean" |
| unit/crowd.test.ts | H (own `arena`) | crowd felt builds over CROWD_HALF | keep | |
| unit/emission.test.ts | H (`arena(6.5)`) | deposit gain, cross-laying, silent fights, fungus emission levers | keep | not in the grep list (uses builders `arena`) |
| unit/fungusHome.test.ts | S, one T-soil | what a host feels underfoot; muddle; crown; midden sporulation; corpse load; nest-odour drift | port (curtain), mostly | Tests "what the fungus feels underfoot…", "muddle…", "crown (lethal…)", "crown below a high load…", "a host's corpse keeps its load…" → curtain (`smallOne`, the royal and brood chambers). "on the midden a Bloom host's corpse sporulates; a Garden host's doesn't": the Bloom half is **covered** by `int/oneWorldGame` "a corpse carried up goes to the plane's midden…"; port the Garden negative. "crown grows with a host's load; muddle and crown are offered only where there is a nest": port the load half; **delete** the top-down "no nest" half (`new Fungus(generateWorld(2))`; one world always has a nest, `oneWorldGame` asserts `g.fungus.hasNest`). "the nest's odour drifts toward hosts in its royal chamber…": the royal half is **covered** by `oneWorldGame` "the nest odour drifts toward the ants in the royal chamber…"; port the brood-chamber and disc negatives |
| unit/hunger.test.ts | S + `broodChamber` | energy use, eating, starving, hunger felt by touch, old foragers carrying to brood | port (curtain) | the two pure tests ("a larva begs…", "the felt grid…") keep. The other four → curtain of `smallOne`. No one-world test covers hunger |
| unit/journal.test.ts | S (`small()`); one O | journal spec, events (mode, death, birth, fallen, stance, infection), filters | keep (swap map) | `small()` and the two `nestCount: 2` games → `smallOne`. "founded…" is already O. "stance, queen and infection" sets `c.stance = "raid"`: keep it only if a colony `stance` field survives the strategist's removal |
| unit/laneBinding.test.ts | — (`fungusContext` views) | lane registry: variants, stance lane, fungus `contextOf(words, view)` | delete (parts) | not in the grep list. The registry's `["top","side"]` variants row, "the fungus lane is the fungus brain…" `contextOf(…,"top"/"side")` asserts, and "the fungus row takes no species words" (`"top"`) all go with `fungusContext(view)`. "the stance lane is the stance brain" and "the stance lane with a species' words…" go with `StanceSituation`. The mode, growth and refusal tests keep |
| unit/nestGuards.test.ts | S | porter's drop asked with enemy flag; `atHome`; `onMiddenRing` | port (curtain) | "a porter putting food down…" and "atHome…" → curtain. "onMiddenRing…" is **covered** by `int/oneWorldMoundGates` "a corpse the ant puts down at will… only out on its ring" |
| unit/perception.test.ts | H | host perception gains (food, alarm, clock), rival trail misread | keep | |
| unit/queenHost.test.ts | S | queen infected by attendants; queen's own levers and signal; reaching a queen opens doctrine | port (curtain) | `oneWorldGame` only checks the negatives ("a loaded queen passes nothing to the ants on the plane", "spores on the plane over the queen don't reach her"). Infection by curtain attendants, the signal lever, and "doctrine opens and a save keeps it" are not covered |
| unit/regrow.test.ts | S | food regrowth off by default; on: piles regrow, books balance | port | `smallOne` with `regrow`: regrowth on both layers. One world plays `GAME_REGROW` and no one-world test checks regrowth |
| unit/restFetch.test.ts | S (stocked stores) | `restFetch`: starving ants fetch from stores, take food on, get up from rest | port (curtain) | `smallOne` curtain. The stores and shaft come from the side layout, so the coordinates need re-deriving |
| unit/sight.test.ts | H | `inReach`, scent reach through soil, digging to buried food | keep | |
| unit/species.test.ts | T-soil | species params/responses reach colonies; founding; save carries species | keep (swap map) | `smallOne`. "a colony founded mid-game is of the game's species" then founds through one world's `addColony` |
| unit/weighted.test.ts | T-soil 120×80 | weighted answers: weigh, read, pick, reroll, Lab `setChoice` | keep (swap map) | game used only as a container |

### Colony int tier (`tests/int`)

| file | builds | what it tests (≤ 15 words) | verdict | target or covering test / note |
|---|---|---|---|---|
| int/addColony.test.ts | S | mid-game founding: hole, chamber, queen; save; second hole; fallen founded colony | covered (mostly) | "a colony founded mid-game has its own hole…" → covered by `int/oneWorldFounding` "a colony founded beyond an end starts its ants in the curtain, with its queen…" and "after foundings at both ends… 30 s… every colony alive". "a save holds the colonies founded mid-game…" → covered by `int/oneWorldSave` "foundings replay…". "founding twice at one spot…" → covered by the `oneWorldFounding` property test plus `int/transect` "rules 3 and 4: a hole gap from every hole". "a founded colony that falls does not end the game…" → **keep (swap map)**. "with the rival off, a founded colony takes the nest it dug…" → **port?** (see Unsure) |
| int/ageStructure.test.ts | S, T-soil | age bands are lifespan shares; queenless top colony ages/larder | split | "the age bands are shares…" → keep (swap map). "a colony with no queen (the plane)…" and "a queenless colony of a species… replaced from the larder" → **delete**: the queenless top-down colony and larder replacement don't exist in one world |
| int/chambers.test.ts | S | royal chamber floor; backfill under chambers; roomy nest digs less | port (curtain) | No one-world chamber tests beyond "royal chamber exists" (`oneWorld.test` "each hole… its shaft leads… to the royal chamber") |
| int/colony.test.ts | H, two T | local rule, homing, wall-following, digging, mound, backfill on hand-made maps | keep (mostly) | ~30 tests on hand-made maps keep. "the colony forages on the local rule alone: food comes home within a minute" (T-open) → **port** (`smallOne`; `oneWorldGame` "food and ants are conserved" checks conservation, not "stored > 200 in 60 s" or "both trails laid"). "soil is conserved underground…" (T-soil) → **covered** by `soak/oneWorldMound` "one world over 200 s: the mound's books balance…" (`dug = out + filled + carried + lost`) |
| int/desertPlume.test.ts | T-soil 40×30 (first test), O | the plume's falloff; rebuild period; save; plane only; draws desert ants | keep (swap map) | Only the "plume: 1 on food, falling with steps…" grid uses `generateWorld`. A hand-made field does the job. The rest is already O |
| int/fungalPolicy.test.ts | H, T-soil games | fungal situations, presets, levers, the gate, grooming, hiding, cull, lane request | keep (mostly) | Arena tests keep. "hiding protects a visible strain…" (real game, T-soil 160×100) → **port** (`smallOne`). "hiding holds…" → keep (swap map). "the fungus lane's request…": **delete** the `fungusContext("a","side")` assert (view) |
| int/fungus.test.ts | H, T-open | strains, contact, grooming, priming, spore brush, spores on ground, advance | keep (mostly) | "a game with no spores runs as before…" → keep (swap map). "in a real game, the dial shows: Lockpick holds… Bloom is groomed…" (T-open 160×100) → **port** (`smallOne`). "one world: the panel's count…" is already layered |
| int/homing.test.ts | S, T | surface vector, search, road signs, Bug2 on ground, far-off vectors, rival hole | split | "the surface vector: its error grows…" → **covered** by `int/oneWorldHoming` "plane: the vector starts afresh up out of its own hole…" and "plane: the drift's size… is PI_DRIFT". "a carrier whose vector is 12 cells off…" → **covered** by `oneWorldHoming` "plane: a carrier whose vector is 12 off…". "only its own hole resets…" → **covered** by `oneWorldHoming` "plane: coming up a rival's hole leaves the vector as it was". "road signs: underground, a strong nest trail… fades the in-nest memory's error" → **port (curtain)**. "a homing ant whose vector is nearly right never searches…" → **port (plane)**. "a carrier whose vector is far off still gets home: 90 and 150 cells…" → **port (plane)**: `oneWorldHoming` "a belief past the plane's edge…" covers only the edge case. "top-down maps keep no vector…", "Bug2 on the ground tries the other side…" and "in the side view a searching ant on the home trail…" → **delete** (view-only) |
| int/oneWorldGame.test.ts | O; one S | (one-world file) | delete (one test) | "a game on one map: each colony has one layer…" (S) tests the single-map `Game` |
| int/oneWorldPatience.test.ts | O; T-soil, S | `planePatience` | delete (part) | In "planePatience: not in the nest, not in the side view, not on a top-down map", delete the side and top halves and keep "not in the nest" |
| int/oneWorldSaveMutations.test.ts | O; S | (one-world file) | delete (part) | In "a save into the wrong kind of game, or another world, is refused", delete the side-game half (or swap it for a second one-world seed) |
| int/oneWorldSettle.test.ts | O; S | (one-world file) | delete (one test) | "settleAt on a game of one map is refused" |
| int/oneWorldSite.test.ts | O; T-soil | (one-world file) | delete (one test) | "site fidelity: not on a top-down map…" |
| int/queen.test.ts | S, T | queen lifecycle, nurses, orphaning, queen killed, larva feeding; strategist larder | port (curtain), mostly | "queen to worker…", "nurses take eggs…", "orphaned…", "strangers at her side kill the queen…", "a larva is fed before it pupates…" → curtain. "the side view's colony has a queen; the top-down maps keep the larder…" → **delete** (view proxy; queen presence is in `oneWorldGame` "two layers… a queen…"). "the strategist reads the larder as full…" (`stanceSituation`) → **delete** |
| int/speciesChannels.test.ts | T-soil 40×30; O | a lacking channel takes no scent | keep (swap map) | test 1 only |
| int/speciesModes.test.ts | O; S (one test) | follow-free species; founded colony takes the species' rule | keep (swap map) | "a colony founded mid-game takes the species' rule…" → found through `smallOne`'s `addColony` |
| int/speciesSituation.test.ts | O; T-soil (one) | species schema refused if missing modes or too big | keep (swap map) | `new Colony(generateWorld(…))` is only a container |
| int/testSpecies.test.ts | T-soil 120×80 | a descriptor species plays: no trails, short life, words | port | "a species of the descriptor's pieces alone plays a game…" → `smallOne`, minus the queenless "replaced from the larder" part. "the generic ant on the same world lays trails and does not age out" → port the trail half; **delete** "does not age out" (top-down queenless only: with a queen the generic ant ages). "its Jev words…" has no map: keep, but its `LONE.lanes.stance` assert goes with the strategist |
| int/undertakes.test.ts | S | a non-undertaking species leaves its dead; the generic ant buries | port | `smallOne` (burial is now on the plane midden) |
| int/world.test.ts | T-open, T-soil, H | generator, terrain purity, blocked, pheromone steps, chunks, underground, golden | split | "generateWorld: the same seed is the same world" → **port (plane)**, folded into the plane golden below: `int/oneWorld`'s "golden: generateOneWorld is pinned" hashes the line and the curtain, never the plane's rock or food. "terrain is position-pure…" (T-open) → **port (plane)**. "generateWorld, open ground: a nest on main ground, food it can walk to, rock about 22 %" → **port (plane)** (`oneWorldFounding` "a founding joins the plane's main open ground…" is founding only). "golden: the generator is deterministic…" (T-open) → **port (plane)**: `oneWorld.test`'s golden hashes the line and the curtain, not the plane's rock or food. "underground (the default): mostly soil…" → **delete** (T-soil map). "OPEN_WORLD has no soil at all; soil and rock both block…": the OPEN_WORLD half → port (plane), the hand-made half keeps. "blocked…", "the sparse step matches the dense one…", "asleep costs nothing…" → keep (swap map). The rest (ChunkLayer, noiseAt, Pheromones, CountGrid, reachable…) keep |
| int/zoning.test.ts | S, T | age bands; young stay in; young deeper; only middle-aged dig; old out by shaft | port (curtain) | "bands: on the top-down maps every ant is old; in the side view by age" → **delete** the top half, port the side half. "the young never go out; the old do, more than the middle-aged" → the young half is **covered** by `oneWorldGame` "the young never go out…"; port the old > middle comparison. "the young sit deeper… only the middle-aged dig" and "an old forager in a dead-end tunnel…" → curtain |

### Colony soak tier (`tests/soak`)

| file | builds | what it tests (≤ 15 words) | verdict | target or covering test / note |
|---|---|---|---|---|
| soak/assays.test.ts | S, T-open, arena | runGame determinism and page parity; overrides; A3/A4 gate; heldProbe | split | "runGame builds the game the page builds (side view…)" → **port** (`runGame`'s default map is `generateSideWorld`, `experiment.ts:111`; the page builds `generateOneWorld`). "overrides: channel params…" and "overrides: a fight override…" (T-open `Colony`/`Game` as containers) → keep (swap map). "heldProbe: a carrier that won't put its food down…" (T-open) → keep (swap map → `oneArena`). "runGame: the same seed…", "overrides: responses…" and A3/A4 on arenas → keep, or point them at the `ONE_ASSAYS` deplete/alarm if the legacy arena list retires (A3 and A4 are 10/10 on the plane, one-world.md §5) |
| soak/evolution.soak.test.ts | S | queen's grooming cap is the evolving game's only | port | `generateOneWorld` |
| soak/evolution.test.ts | H, S | lever reach, mutations, mycelium, min dose, landing, founded parity, Garden, queen levels | split | Arena tests keep. "every lever has a reach…" (S only because crown needs a nest) → keep (swap map: `smallOne`). "the game's landing: an evolving fungus roots by the hole…", "a colony the world starts with has nothing a founded one can't get", "a weak start loses in the nest…" and "the queen's levels are held too…" → **port** (`generateOneWorld`; `soak/hyphaeGame` "the patch lands on the hole's inner side…" covers placement only). "spores a full patch can't hold…" → keep (swap map). "the fungus's save holds every private field…": keep; its "one map: no layers" assert goes if single-map `Fungus` goes |
| soak/food.soak.test.ts | S | food conserved over a game: map + jaws + larder + brood; put down anywhere | port | `generateOneWorld`, both layers plus larder and brood. `oneWorldGame` "food and ants are conserved over 90 s" checks the plane's food and the crossings only. `unit/foodLeft` checks food left |
| soak/food.test.ts | S + `broodChamber` | larder, porters, reception, brood fed from stores, larva taken in | port (curtain) | 9 tests. Only `int/oneAssays` "nestFlowProbe reads the curtain's chambers (A8)" touches this, at probe level |
| soak/game.test.ts | H (own `arena`, `worldFromArrays` 60×20), T-open | fights, contact, alarm, raids by trail, per-ant stance; generator; strategist; whole game | split | ~16 tests on hand-made fields keep (fights, contact, graded alarm, raids by trail, per-ant stance, raid recruitment, raid as a bias). "localPolicy: enemies near…" keeps (pure). "generateWorld: two nests, a walk apart, joined on foot…" (T-open) → **port (plane)**. "localStance: defend a nest under attack, raid…" → **delete** (`StanceSituation`). "the game: both colonies forage and grow, they meet and fight, no strategist…" (T-open) → **port** (`smallOne`; drop the `strategyChoices` assert). "the outcome: a colony with no ants… is beaten" → keep (swap map) |
| soak/marks.test.ts | S, T-open | chamber roles and road signs; asked where it is in the nest; ja-qnx both views | port | "roles and road signs…" and "inside the nest an ant is asked where it is…" → curtain (`int/oneWorldLeave` "an ant at the gate senses its place as `hole`…; deeper in, its tunnels and chambers" covers place sensing in part). "ja-qnx: a policy that always says 'return'…" (both views) → `smallOne` |
| soak/midden.test.ts | S | midden on the ground; facing the rival; rot; raids in at rival's hole | split | "the dead are carried out to the midden…" → **covered** by `soak/oneWorldMound` "one world: a corpse carried up goes on the midden, off the mound…" and `oneWorldGame` "a corpse carried up goes to the plane's midden…". "raiders leave their own nest and go in at the rival's hole…" → **covered in part**: `oneWorldGame` "a raider on the rival's hole goes down the rival's shaft" checks one recruited raider's step down; the walk across the plane (≥ 40 raiders on the rival's side, ≥ 3 in under its hole) comes with the A11/A12 port. Its setup binds the strategist's stance. "a raider walking at the rival's hole shies from its midden" → **covered** by `oneWorldMound` "a rival raider on the plane shies from the colony's midden". "each colony's midden lies toward the other: a boundary" and "any number of colonies: raids go to the nearest rival, the midden faces the nearest neighbour" → **delete** (replaced: ja-k4k.5 puts the midden on a ring off the mound, not facing a rival, and nearest-rival raids aim at nest coordinates). "an undertaker that dies leaves the corpse…; the unclaimed dead rot" → **port (plane)** (`oneWorldMoundGates` "a corpse carrier killed on the plane leaves the corpse on the plane…" covers the first half, not rot). "a corpse lying past the midden is carried back…" → **port (plane)**. "a raiding colony of every age: the young stay in…" → **port** (raiders via `leave` = raid at the gate, not the bound stance). "a raid in force gets past the rival's midden…" → **port (plane)**, together with A11 |
| soak/mound.soak.test.ts | S 320×200 | spoil out, spread, backfilled, books balance, nobody buried, way in open | covered in part | `soak/oneWorldMound` "one world over 200 s: the mound's books balance…" checks the books, the cap, the open rings, the spreading and the backfill. **Port (curtain)** the rest, with soak/side's crust check in one curtain test: "nobody is buried" (`maxSolid < 0.2` s, `:51`) and "the way in stays open" (the chamber reaches the hole, no tunnel opens onto the ground line, `:57-68`) |
| soak/mound.test.ts | S | the side sandpile; two colonies' spoil; pellet dropped where carrier stands; holes keep funnels | covered / delete | "a sandpile round the hole: slopes… walkway riding on top…" → **delete** (the side mound; its plane replacement is pinned by `oneWorldMound` "heapPlane: pellets dropped on one cell pile into a cone…"). "two colonies: each picks up the other's spoil…" → **covered** (`oneWorldMound` 200 s, both colonies' books). "a pellet is carried out along the ground and dropped where the carrier stands…" → **covered** (`oneWorldMound` "spoil carried up keeps going… heaped where its vector says…"). "one colony's mound never buries another's hole" → **covered** (`oneWorldMound` "heapPlane: the ring round every hole keeps it open…" plus the 200 s test) |
| soak/recognition.soak.test.ts | T-open 160×100 | real game: Garden in one colony moves odour halfway, rival too | port | `generateOneWorld` |
| soak/recognition.test.ts | H (`arena(6.5)`), T-open | odour bands, calm, tolerance, fungal share, unity latch; real-game unity | split | ~20 arena tests keep. "a colony whose nest smells like ours is no rival: the strategist forages…" → **delete** (strategist). "in a real game: Garden in both colonies brings them to one odour and the fighting stops" (T-open) → **port**. Its one-world twin, `slow/oneWorld.test.ts` "unity, one world…", is **skipped** (ja-lp4.6.6), so nothing covers it today |
| soak/responses.test.ts | H, S | response hooks: get, drop, carry, trail, alarm, arrive, rest, fatigue, quality, noEntry, leave | keep (mostly) | Hand-made tests keep. "get is asked for loose soil, corpses and brood too…" → **port (curtain)**. "arrive in the side view: a fresh forager returning to the royal chamber…" → **port (curtain)** (the tired half is near `oneWorldLeave` "a tired returner goes down to rest…"). "fatigue (ja-q47): the young never tire; carrying neither tires nor rests outside…" → **port** (`smallOne`) |
| soak/royal.test.ts | S | queen's scent, gynes, nanitics, alates, flights, daughters, food conserved | port (curtain), mostly | No one-world test rears a gyne or follows an alate out. Port "the queen's scent…", "a young, well-fed larva… gyne", "nurses feeding a gyne…", "a gyne larva is fed three times…", "a nanitic ecloses…", "an alate waits, walks out… flies" (now up the shaft to the plane), "an alate picks up the fungus…", "a daughter raises her first brood…", "food is conserved through gynes, flights…", "a young colony's queen feeds…" (×2) and "a nanitic eclosing…". **Covered**: "daughters landing together dig apart…" by `int/transect` "the hole gap keeps founded royal chambers apart…" and "ja-tjo's assay…"; "a queen landing where no hole fits is lost…" by `oneWorldFounding` "a flight with no room within her radius is lost…". "with autoFound off a flight waits for the page…" is **covered in part** by `oneWorldSave` "a save with a flight pending…" and `ui/tests/pen.test.ts`. "a queen founding alone doesn't hold unity at nothing" → keep (swap map) |
| soak/save.test.ts | S, T-open; O | save/restore bit-exact per view; fight-death tick; schema guards | split | "a save restored into a fresh game runs on exactly… (side/top)" → **covered** by `int/oneWorldSave` "a save runs on exactly as the unbroken game…". "a save on a tick with a fight death… (side/top)" → **covered** by `oneWorldSave` "a save on a tick with a fight death on the plane/curtain…". "a save of another version is refused", "what a colony saves…" and "the game's save holds every private field…" → keep (swap map). "every Layer key…" and "a one-world colony's save…" keep. "a single-map save's shape…" → **delete** (single-map saves; the page refuses them, `ui/tests/saves.test.ts`) |
| soak/side.test.ts | S | the side world's terrain, walkway, entrances, sky, side homing, crust, defaults, golden | delete (mostly) | "the side world: sky above a ground line…", "at full size too, the walkway…", "each nest: its entrance an open hole…", "the walkway follows the ground…", "scent never sits in the air…", "the side world's defaults…", "golden: the side world's generator is pinned…" and "a homing ant on the walkway cell above the hole…" → **delete**. "homing in the side view: a carrier… down to the chamber; a pellet carrier comes up…" → **covered** by `oneWorldGame` "a carrier on the plane goes down its hole…" and "spoil carried up the shaft goes out onto the plane…". "foraging in the side view: carriers… in sight of the hole make for it…" → **covered in part** by `oneWorldHoming` "plane: a carrier walks to where its vector says…; in sight of the hole it goes straight down", which follows one carrier; the old test is a 200 s, 400-ant statistic (≤ 10 % of carrier samples moving away from the hole). "the ground line's crust stays…" → **port (curtain)**: `oneWorld.test` "the crust is solid except at the holes" checks a freshly generated curtain, and no one-world test runs a game and then checks the crust. Run `smallOne()` with ants for ~120 s, then assert no crust cell outside `line.sHole` is open and nothing is filled above it (with mound.soak's two checks). "a carrier homing along the ground passes the rival's hole without going in…" → **port (plane)**: no test has a non-raider cross a rival's hole |
| soak/solo.test.ts | T-open | solo colony keeps foraging; nobody turned fighter | port | `smallOne`, `rival: false` |
| soak/underground.test.ts | T-soil 256×192 | top-down underground digging, soil and food books | delete | Retired top-down soil map. Soil books are **covered** by `oneWorldMound` 200 s, food by `oneWorldGame` "food and ants are conserved…" |
| soak/oneWorldMound.test.ts | H fields; O | `heapPlane` on hand-made planes | keep | |
| soak/oneWorldRoute.test.ts | O; T-soil (one) | (one-world file) | delete (one test) | "route memory: not on a top-down map…" |

### Slow tier and golden masters as files

These are in the guard and golden tables below: `slow/chambers.test.ts`, `slow/economy.test.ts`, `slow/side.test.ts`, `golden/golden.test.ts`, `slow/golden.test.ts`.

### UI tests that use the old maps or `fungusContext(view)` (`web/src/ui/tests`)

| file | builds | what it tests | verdict | note |
|---|---|---|---|---|
| ui/tests/aimChange.test.ts | T-soil; `fungusContext(aim,"top")` | a new aim's questions and caching | keep (swap map) | drop the view argument |
| ui/tests/colonyJevReview.test.ts | T-open containers | fungus menu changes, 409s, configure | keep (swap map) | |
| ui/tests/follow.test.ts | H | a followed ant's death | keep | |
| ui/tests/growthLane.test.ts | T-soil container | the growth lane wiring | keep (swap map) | |
| ui/tests/nest.test.ts | T, S, O | `nestView` | split | "a top-down map has no nest to show" → **delete**. "the side view's nest: its own chambers only, the royal one with the queen…" → **port (curtain)**: "one world's nest…" covers plane-vs-curtain only |
| ui/tests/pen.test.ts | O; S (one assert) | the pen | delete (part) | the "none off one world" side game in "the pen's circle…" |
| ui/tests/saves.test.ts | T-open (one test) | single-map save never offered | keep (fixture) | still a migration guard. After S2 no `Game` can produce a single-map save, so it needs a stored old-format record |
| ui/tests/rehearseCopy.test.ts | — (binds the `stance` policy) | rehearsal copies the policies | delete (part) | `:9` binds the strategist's `stance` policy and asserts `stancePolicy` |

### Strategist tests on no old map (the grep's misses)

These build no open or side map, so the grep missed them, but they test the colony-wide strategist S2 deletes (open question 2).

| file | what it tests | verdict | note |
|---|---|---|---|
| unit/schema.test.ts | the strategist's schema | delete (part) | `:74` "the strategist's schema has 324 views…", and the `STRATEGY_LEGEND, STANCE_SCHEMA` row of the `:170` test |
| unit/colonyBrain.test.ts | stance requests | delete (part) | `:54` "stances: key, pack and read; their own context per doctrine" (`packStanceRequest`, `readStance`, `c0`) |
| int/desertAnt.test.ts | the desert ant has no stance lane | delete (part) | `:21` (`lanes.stance` undefined) and `:62` (`g.strategyChoices`) |

### Test helpers

| file | what | verdict |
|---|---|---|
| tests/builders.ts | `SMALL_SIDE` (`:16`), `walkway()` (`:62`), `broodChamber()` (`:68`) | delete with the side map, after the ports that use them move to `smallOne()` |
| tests/hexmaps.ts | `hexMap` | keep, with the hand-made fields |
| experiment.ts | `runGame`'s default is the side map, and its doc comment (`:87`) still calls it "the page's" default (stale since PRD §55) | port: one world as the default |
| ui/tests/speciesLanes.test.ts | T-soil | species lane words in the client | keep (swap map) | "a species with no stance lane has none in the client…" → **delete** (strategist lane) |
| ui/tests/speciesLearn.test.ts | T-soil | species rule text and requests | keep (swap map) | "the client says whether the colonies have a stance lane at all" → **delete** |
| ui/tests/int/colonyJev.test.ts | T-open, T-soil | the Jev client: runs, caches, doctrines, fungus lane | keep (swap map) | "the strategist's stance goes through its own cached lane" and "the stance count is every colony's too…" → **delete**. Lines 888 and 904 `fungusContext(…, g.map.sky ? "side" : "top")` → drop the view |
| ui/tests/int/laneWiring.char.test.ts | T-soil, O | lane wiring characterisation | split | "the fungus lane asks and answers under the view its game has: top without a nest, side with one" → **delete**. The `fungusContext(AIM,"side")` seeds drop the view. "each lane sends its own ids…": drop the strategist's `c0` |
| ui/tests/int/speciesAsk.test.ts | T-soil | species requests | keep (swap map) | "…and no stance question" goes with the strategist |
| ui/tests/laneRegistry.char.test.ts | `fungusContext(a,v)` | lane characterisation hashes | re-record (top only) | "…the fungus's two views" → one context. One world already asks the fungus lane under the `"side"` context (`ui/colonyJev.ts`, `hasNest ? "side" : "top"`; `fungusBrain.ts` adds `-side`), so if the view-less `fungusContext` keeps the `-side` form byte for byte, only the `"top"` variant's hash goes |
| ui/tests/lanes.test.ts | `fungusContext(…,"side"/"top")` | context prefixes, ids | keep (edit) | drop the view. "…c0 for stances…" goes with the strategist |
| ui/tests/precache.test.ts | `fungusContext(aim,"side")` | shipped bundles match contexts | keep (if the context keeps `-side`) | "every preset aim ships fungus answers for the side view…": keep the shipped answers by keeping the `-side` form in the view-less context (see laneRegistry). Re-shipping, which needs a live check and costs money, is only needed if the string changes |

`ui/tests/agentDocs.test.ts` lists `SMALL_SIDE` among the builders' symbols (line 31). Drop that entry when `SMALL_SIDE` goes.

## 2. Assays in `ASSAYS` (`experiment.ts:1546`)

All the A-assays except G, G′, A8 and L run on hand-made top-down arenas (`Arena`), not on `generateWorld`. G, A8 and L run on `runGame`'s
default `generateSideWorld(seed)` (`experiment.ts:111`). G′ runs on `generateWorld(s, OPEN_WORLD)`. "Covered" below means `ONE_ASSAYS`
has the one-world twin (`experiment.ts:2646`). S2 step 2 still has to record its baseline in the PRD, and several twins fail their marks on one world.

| assay | PRD baseline? (§) | one-world equivalent | verdict | note |
|---|---|---|---|---|
| `bridge` A1 | yes: §42.2, §45.3, §46.4, §54.3 | `onPlaneAssay(bridge)` | covered | plane 6/10 at U6a, 8/10 after §56/§58 (fails 5, 9). The legacy is 10/10 |
| `twin` A2a | yes: §42.2, §45.3 | `onPlaneAssay(twin)` | covered | plane 10/10 |
| `richPoor` A2b | yes: §45.2–45.3, §54.3 | `onPlaneAssay(richPoor)` | covered | plane 9/10 (seed 4 picks the poor one) |
| `deplete` A3 | yes: §42.2 | `onPlaneAssay(deplete)` | covered | plane 10/10 |
| `alarm` A4 | yes: §42.2, §46.4 | `onPlaneAssay(alarm)` | covered | plane 10/10 |
| `regulate` A5 | yes: §42.2, §48.4 | `onPlaneAssay(regulate, gateProbe)` | covered | **plane 0/10** (PRD §58), against legacy 10/10 (§48.4) |
| `regulateStop` A5b | yes: §48.2, §48.4 | `onPlaneAssay(regulateStop, gateProbe)` | covered | plane 8/10 |
| `pass` A6 | yes: §42.2, §46.4, §49.3, §54.3 | `passAssay(onPlane)` | covered | **plane 5/10**: fought in the tunnels (one-world.md §5 says U6b should revisit) |
| `open` A6 control | report only (part of A6) | `onPlaneAssay(open)` | covered | |
| `raidFind` A11 | yes: §49.3, §49.7, §54.3 | none: `ONE_PENDING` "U6b: raids by trail on one world" | **port** | slow guard `slow/raidFind.test.ts` |
| `raidStop` A12 | yes: §49.3, §49.7, §54.3 | none: `ONE_PENDING` (same reason) | **port** | slow guard `slow/raidStop.test.ts` |
| `contact` A9 | yes: §46.4, §54.3 | `onPlaneAssay(contact)` | covered | **plane 3/10** (worst 9.99 lost per 100 food, PRD §58's latest one-world run) |
| `defendHome` A13 | yes: §54.3 (15/20; food 0.63, broadcast 0.62) | **none**, in neither `ONE_ASSAYS` nor `ONE_PENDING` | **port** | its `broadcast` arm uses `stanceGate: 0`, the colony-wide stance S2 deletes, so the score needs a new control |
| `faintAlarm` A10 | yes: §46.4 | `onPlaneAssay(faintAlarm)` | covered | plane 0/10 (legacy 3/10–5/20; the slow test is `todo` ja-je8) |
| `game` G | yes: §42.2, §46.4 | `game1` (G1) | covered | G1 slow guard on seeds 4, 5, 9 passes (route memory, §59) |
| `gameTop` G′ | yes: §42.2, §46.4 (G′ table) | none | **delete** | report-only bench bed on `OPEN_WORLD`, no queen. G1 replaces it as the whole-game measure |
| `nestFlow` A8 | yes: §43.4, §46.4 (report only) | `nestFlowOne` | covered | one world: beyond 0.77 (worst 0.37) against 1.00 (one-world.md §5) |
| `lifecycle` L | yes: §50.19, §50.21 | none | **port** | solo side game with the fungus landed; → `generateOneWorld` solo |
| `lifecycle-signal` L | yes: §50.19, §50.21 (table), seeds 11–20 too | none | **port** | as above |
| `lifecycle-scent` L | yes: §50.19, §50.21 | none | **port** | as above |

## 3. Slow guards (`tests/slow/*.test.ts`)

| file | builds | what it guards | verdict | note |
|---|---|---|---|---|
| slow/assays.test.ts | arena (A1, A2a, A2b, A5, A5b, A9, A10 todo); O (D1, D2 todo, D3) | assay pass marks on seeds 1–2 | port (the A-tests) | Point A1/A2a/A2b/A5/A5b/A9 at their `ONE_ASSAYS` twins, re-marked from one-world baselines. **A5 (0/10) and A9 (3/10) would fail today on the plane**; A1 fails seeds 5 and 9. D1–D3 are already one world |
| slow/chambers.test.ts | S | a crowded nest digs chambers; chambers never touch, none too shallow | port (curtain) | `int/transect` "the hole gap keeps founded royal chambers apart…" covers founding chambers only |
| slow/economy.test.ts | S (one colony, 0.3 food) | an hour: founders replaced, larvae fed, size held; ja-xu6 old feed brood | port | `generateOneWorld` solo (food reaches the curtain from the plane). No one-world hour-long guard exists |
| slow/golden.test.ts | S | "side view war, seed 6" golden | re-record on one world | S2 step 3 |
| slow/oneWorld.test.ts | O | unity on one world | keep | **skipped** (ja-lp4.6.6) |
| slow/oneWorldG1Seed4/5/9.test.ts (via oneWorldG1.ts) | O | G1 held-food bound | keep | |
| slow/oneWorldRoute.test.ts | O | R1 pocket carriers | keep | |
| slow/raidFind.test.ts | arena | A11, seeds 1–10 | port | `ONE_PENDING` |
| slow/raidStop.test.ts | arena | A12, seeds 1–2 | port | `ONE_PENDING` |
| slow/side.test.ts | S | held-food bound, seeds 4 and 6 (#16's guard) | covered | G1 slow guard (`oneWorldG1Seed4/5/9`), same bound of 2. Delete it once G1 stays green |

### Golden masters

| scenario | file | view | verdict |
|---|---|---|---|
| "side view, seed 4" (300 ants, 90 s, alarm at 30) | golden/golden.test.ts (`golden.json`) | side | re-record on one world |
| "top-down war, seed 3" (150 ants, 150 s, alarm 20/60/61) | golden/golden.test.ts | top | re-record on one world |
| "side view war, seed 6" (600 ants, 600 s) | slow/golden.test.ts (`slow/golden.json`) | side | re-record on one world |
| "one world, seed 7" | golden/oneWorldGolden.test.ts | one | keep. It re-records only if S2 changes behaviour (merging the twins should be bit-exact) |

`tests/goldens.ts` `Scenario.view: "side" | "top" | "one"` and `record`'s side and top branches go once the three old scenarios move.
Other pinned hashes that S2 touches: `int/world.test.ts` "golden: the generator is deterministic" (port to the plane), `soak/side.test.ts`'s
golden (delete), and `ui/tests/laneRegistry.char.test.ts` (re-record when `fungusContext` loses its view).

## 4. Maintained scripts (outside `web/src`)

S2's deletes break these, and `npm run typecheck` will catch them when the symbols go. Porting them moves the per-lane cost figures that
CLAUDE.md asks PRs to quote, since those come from `colony-cost` and `fungus-cost` on these maps.

| script | builds | port to |
|---|---|---|
| scripts/colony-cost.mjs | its default is the top-down soil map (`generateWorld(seed)`, `:65`); `--one` is one world | one world as the default; re-measure each lane's $/h |
| scripts/fungus-cost.mjs | side map only (`:39`) | one world; re-measure the fungus lane |
| scripts/precache.mjs | side map only (`:100`) | one world |
| scripts/colony-live.mjs | top-down or side (`:170`) | one world |
| scripts/colony-bench.mjs | the open and side sizes besides `--one` (`:58-68`) | `--one` only |
| scripts/unity.mjs | the side map besides `--one` (`:89`) | `--one` only |

## Summary

**Colony test files**: 61 in all. That is the grep's 59 plus `unit/emission` (builders' `arena()`) and `unit/laneBinding` (`fungusContext(view)`). Of these, 58 are in section 1 and 3 slow files are in section 3.
Each file is counted once, under the verdict for most of its tests. Many files are split per test, as the notes say.

| verdict (file level) | count | files |
|---|---|---|
| port | 22 | soak: mound.soak (two checks). unit: chapters, fungusHome, hunger, nestGuards, queenHost, regrow, restFetch. int: chambers, homing, queen, testSpecies, undertakes, zoning. soak: evolution.soak, food.soak, food, marks, midden, recognition.soak, royal, solo |
| covered | 2 | addColony, mound (its sandpile test is a delete); mound.soak is now covered in part, its two missing checks ported |
| delete | 3 | side (one test port, three covered), underground, ageStructure (one test keep) |
| keep, hand-made field | 6 | backfill, crowd, emission, perception, sight, oneWorldMound |
| keep (swap map) | 8 | bindPolicy, journal, species, weighted, speciesChannels, speciesModes, speciesSituation, desertPlume |
| keep, with port or delete tests inside | 11 | colony, fungus, fungalPolicy, world, game, recognition, responses, save, evolution, assays, laneBinding |
| keep, minus one old-map test | 6 | oneWorldGame, oneWorldPatience, oneWorldSaveMutations, oneWorldSettle, oneWorldSite, oneWorldRoute |
| re-record | 1 (+1 slow) | golden/golden.test.ts (2 scenarios); slow/golden.test.ts (1) |

Per-test totals, counted roughly from the notes: about **93 port**, about **30 covered** and about **35 delete**. The rest keep.
About 60 of the ports are in-nest mechanics (curtain): chambers, brood, queen, gynes, food flow, hunger, zoning.
For those, the work is mostly swapping `generateSideWorld(2, SMALL_SIDE)` for `smallOne()` and re-deriving cells in the curtain, since the curtain runs the side view's nest code.

**Assays** (20 in `ASSAYS`): covered 13 (A1, A2a, A2b, A3, A4, A5, A5b, A6, A6-open, A9, A10, G → G1, A8 → nestFlowOne); port 6 (A11, A12, A13, L ×3); delete 1 (G′).
**Slow guards** (10 files): port 5 (assays' A-tests, chambers, economy, raidFind, raidStop); covered 1 (side → G1); re-record 1 (golden); keep 3 (oneWorld, G1 ×3, route).

**Riskiest: a PRD baseline and no one-world coverage**
1. **A13 `defendHome`** (§54.3): in neither `ONE_ASSAYS` nor `ONE_PENDING`, so it is easy to drop by accident. Its `broadcast` control uses `stanceGate: 0`, which S2 deletes, so the score needs redefining, not only porting.
2. **A11 `raidFind`, A12 `raidStop`** (§49.3, §49.7, §54.3): pending since U6b. These are the slow guards `raidFind.test`/`raidStop.test`. (`ja-d6c`, the raid trail on one world's surface, is closed: raids from a scout's trail run on the plane since `ja-web`.)
3. **L lifecycle ×3** (§50.19, §50.21): gynes, flights and daughters. The only measure of them, plus `soak/royal.test.ts`'s ~12 tests, all in the side nest. No one-world test rears a gyne.
4. **A5 and A9 as slow guards**: the legacy arena passes 10/10, the plane 0/10 and 3/10. Porting the slow guard as-is fails, so S2 step 2 must re-mark them with the owner (the worst-seed rule).
5. **Side economy hour** (`slow/economy.test.ts`, PRD §41/§50.18; ja-xu6): the only long-run nest-economy guard.
6. **Unity in a real game** (`soak/recognition*.test.ts`, PRD §53): its one-world twin is skipped (ja-lp4.6.6).
7. **Plane generator guards**: `world.test` "generateWorld, open ground…", "terrain is position-pure", the generator golden, and `game.test` "two nests, a walk apart…". If S2 deletes them with `generateWorld`, the plane's terrain loses its only checks: `oneWorld.test`'s golden hashes the curtain, not the plane.

## Open questions (before steps 2-4)

Also decided (owner, 2026-11-14, review of #181 D2): `ja-d6c` stays closed. The four mechanics run on the plane and are measured there; A5 (0/10) and A10 (0/10) are tracked by their own beads (ja-lp4.6.8, ja-je8), and don't hold S2 up.


- ~~**Is a single-map `Game` kept?**~~ **Decided (owner, 2026-11-14, review of #181 D1): no, `Game` becomes one-world only.** About 25 "keep" files move onto `oneArena(field, seed)`; the queenless grow-from-stores path a hand-made colony takes goes with the old maps; `new Fungus(map)`'s one-map save shape (`evolution.test` "…one map: no layers") and `soak/save` "a single-map save's shape" go too.
- **What exactly is "the strategist"?** I took it to be `StanceSituation`, `localStance`, `stanceSituation()`, the stance lane (`c0`), `strategyChoices` and `stanceGate: 0`'s broadcast stance. Tests that set `c.stance` directly (`journal` "stance, queen and infection", `game.test` "raid stance as a bias…", which uses `stanceGate: 0`) may keep or go, depending on whether a colony-level `stance` field survives.
- **`addColony` "with the rival off, a founded colony takes the nest it dug…"**: a side-world bug (founding reused the world's unused second nest). I did not check whether `generateOneWorld` with `rival: false` still has a spare second nest that founding could pick, so port vs delete is open.
- **Arena assays and their gate tests** (`soak/assays` A3/A4, `slow/assays`): these are hand-made top-down arenas, not `generateWorld`. I don't know whether S2 retires the legacy `ASSAYS` list (leaving only `ONE_ASSAYS`) or keeps the arena runs as a bench. If they stay, those tests are keep, not port.
- **How "covered" the split covers are**: where a one-world test covers only part of an old test (landing, nest odour drift, `autoFound` flights, place sensing in the nest), I wrote "covered in part" and ported the rest. Someone should confirm the parts left over are worth keeping.
- **The side-world generator constants**: the curtain uses `SIDE_WORLD.rockiness`, `SIDE_WORLD.soil` and `buryPockets(…, SIDE_WORLD, …)`. "Delete `SIDE_WORLD`" has to mean moving those values into the curtain. `soak/side.test.ts`'s golden goes, and `oneWorld.test`'s golden then pins them.
- **Per-test counts are approximate** (I counted from test names and map calls, not by running anything).
