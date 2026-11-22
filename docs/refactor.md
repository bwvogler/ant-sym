# Foundation refactor: the roadmap

*A review of the code on 2026-11-11, before new species (other senses and signals), new final structures, new interactions and a new UI. The decisions are in [PRD §57](PRD.md#57-foundation-refactor-decisions-ja-fnd-2026-11-11). The work is tracked in the bead epic named there; every numbered item below is a bead.*

## Why

The code grew through 55 milestones and three kinds of map. Each of the things we want to add next has no single home today:

- **The sim is one hub.** `colony.ts` is 6,528 lines. `class Colony` takes about 5,440 of them and `tick()` about 1,055. The class has about 95 per-ant typed arrays, about 70 `#private` fields, about 133 loose tuning constants and 548 `as number` casts. It changed in 81 of 261 commits.
- **There is no species.**
  - `#sense` reads three fixed channels into a fixed `Float64Array(9)`.
  - The `Situation` schema is written four times: the interface, `encode`/`decode`, `situationKey`/`situationState`, and `COLONY_LEGEND`.
  - Response hooks, modes, levers and physiology are each hard-coded.
  - A second species would touch about eight files.
- **The view is inferred, not stated.** Top-down is detected as `#entrance === null` (85 checks). Side is detected as `map.sky` or `this.queen`. One world is `line` or `#cur`. Several functions exist twice, once for the plane and once for the curtain. The page plays only one world (§55).
- **A Jev lane lives in about eight files.** The content is in `colonyBrain.ts` and `fungusBrain.ts`. Lane names are hard-coded about a dozen times in `ui/colonyJev.ts`, and again in `prompt.ts`, `useColonyJev.ts`, `LearnDrawer`, `AntCard` and `scripts/precache.mjs`.
- **The UI is monolithic.** `ColonyField.tsx` (1,437 lines) draws, moves the camera, takes input and shows the HUD; its renderer is one 950-line `useEffect`. `ColonyApp.tsx` holds game rules (flight, pen, founding). The stats re-render the whole tree about 7 times a second.
- **Tests are slow and not separated.**
  - `npm test` took 3 min 44 s of wall time and 13.6 CPU-minutes locally (610 tests, concurrency 4), and 310 s on CI.
  - `food.test.ts` was cancelled at the 60 s per-file limit (`ja-6mj`), which blocks every deploy.
  - About 40 helpers are copied between files: `SMALL` ×15, `arena` ×6, `run` ×9, `DT` ×12.
  - Pull requests run no lint, typecheck or tests.
  - The 22 `scripts/*.mjs` are neither type-checked nor linted, and 20 of them import colony internals.

The goal: a sense, a channel, a lane, a species, a nest kind and a renderer layer each have one obvious home and a fast test loop.

## Rules for every stage

- **Bit-exact.** A pure move keeps every golden master bit-exact, including the order of RNG draws. Only stage 2 re-records them, and its PR says so.
- **Jev's words do not move.** Generated legends, questions and keys produce the same bytes as today, so `precache.test` stays green and no answers are bought again. If any text must change, re-ship with `scripts/precache.mjs --import`.
- **No compatibility code.** Saves may break; there are no migrations.
- **One PR per stage or sub-stage,** each reviewed by a fresh review agent.
- **Not a mechanic.** This is refactoring, so `adding-mechanics` does not apply. A `Species` that adds no behaviour is structure.

## Stage 0: fast feedback (tests, CI, scripts)

1. **Fix `ja-6mj`.**
   - Split `food.test.ts`, about 900 sim-seconds of 200–400-ant games.
   - Give each soak test its own `{ timeout }`, as `recognition.test.ts` does with `GAME`.
   - `oneWorldSave`, `evolution`, `mound` and `recognition` are next in line (52–54 s on CI).
2. **Tiers by directory**, each a glob in `web/package.json`:

   | Tier | What goes in it | Target |
   |---|---|---|
   | `unit/` | hand-built state, pure functions, ui/server/worker | under 10 s |
   | `int/` | games of 60 sim-seconds or less | |
   | `soak/` | the 150–600 s games | |
   | `golden/` | the golden masters | |
   | `slow/` | as today | |

   Add `test:unit`, `test:watch` (`node --test --watch` on the unit tier) and `test:int`. `npm test` keeps running everything but `slow`.
3. **One long game per world for conservation.** Food or soil conservation is asserted in nine separate 90–300 s games. Run one shared game per world and let several assertions read it, or move the extra games to `slow`.
4. **`tests/builders.ts`.** It holds:
   - `DT`, `run`, the small side spec, `arena`, `placed`, `walkway` and `broodChamber`
   - the one-world kit
   - `editPrivate`, so private-field access lives in one place

   Move `saveHash.ts` out of the tests: `colony-bench` imports it.
5. **CI on pull requests.**
   - Every pull request runs lint, typecheck, unit + int + golden, and soak (sharded).
   - `slow` runs nightly or on a label.
6. **Scripts.**
   - Move the one-off spikes and benches to `scripts/lab/`, and delete those that only fed a closed PRD section.
   - Convert the maintained tools to `.ts`: `experiment`, `colony-cost`, `fungus-cost`, `colony-live`, `precache`, `e2e-one-world`, `colony-bench` and `ablate`.
   - Type-check and lint them, so a rename in the core fails `tsc -b` rather than failing at run time.
7. **Formatter and lint rules.** Run one formatting pass in its own PR. Add `no-explicit-any` and `exhaustive-deps`.

## Stage 1: one vocabulary (pure moves)

1. **`colony/vocab.ts`**, a leaf module, holds `Mode`, `Stance`, the trail level, `Situation`, `CellCounts`, `Layer`, `ENEMY` and `Mark`. `Role` is derived from `Mark`. This breaks the import cycles `colony↔responses`, `colony↔recognition` and `battle→colony`.
2. **Name collisions.** One meaning per name for:
   - `Trail`
   - `Touch` and `Place` (colony vs fungal policy)
   - `SumGrid` (defined twice)
   - `encode`
3. **No mutable module state.** `backfill` / `tuneBackfill` and `TUNNEL_DRIFT` / `setTunnelDrift` became colony params (`ColonyParams.backfill`, `ColonyParams.tunnelDrift`; done in S1).
4. **Drop the `as number` casts** on typed arrays. The compiler doesn't ask for them.
5. **`colony/index.ts` is the public surface** for the UI, scripts and experiments. No script imports `colony.ts` as a namespace.

## Stage 2: one world only (owner, 2026-11-11)

The top-down and side maps are retired. **Done 2026-11-22** (`ja-fnd.3`): stages S2.3a–g and the closeout are merged; per-stage notes are in [one-world-only.md](one-world-only.md). The inventory below is the plan as written.

**Blocked by:**
- ~~`ja-d6c`: trail choice, the faint-alarm draw and the raid trail must run on one world's surface.~~ Closed 2026-11-14: all four of the bead's mechanics (these three and activation) run on the plane and are measured there by their assays (`one-world.md`, U6a and `ja-web` as built); A5 0/10 and A10 0/10 are tracked by ja-lp4.6.8 and ja-je8.
- `ja-lp4.6`: guards and assays on one world.

1. **Inventory.** Each test file that builds an open or side map, each assay in `ASSAYS` and each slow guard, as one of:
   - port to one world
   - covered by a one-world test
   - delete

   Done (2026-11-14, `ja-fnd.3.1`): [one-world-only.md](one-world-only.md). 61 test files, 20 assays, 12 slow files (G1's three as one guard). The owner answered its open questions on 2026-11-14; one is left before steps 2-4: how much of each split cover is worth keeping.
2. **Port the assays that carry PRD baselines** to one world. Record the new baselines in the PRD, choose by the worst seed, and confirm on seeds 11–20. Then retire the legacy `ASSAYS` list and its arena versions, and point its gate tests (`soak/assays` A3/A4, `slow/assays`' A-tests) at the one-world twins: `ONE_ASSAYS` is the one list (owner, 2026-11-14). A6's and A13's attackers are walked to the defenders' hole by the assay harness, not by colony code (owner, #184 D2).
3. **Re-record the golden masters on one world only:** fast and slow.
4. **Delete:**
   - first fold `DEFAULT_WORLD` + `OPEN_WORLD` into one set of plane options (one world's plane is `generateWorld(seed, OPEN_WORLD)`, which the endless world's E2 later replaces), and move `SIDE_WORLD`'s `rockiness`, `soil`, `patchesPerChunk`, `foodPerCell`, `foodMinDist` and `chamberDepth` (`foundNest`'s default depth), and `groundCell`, into the curtain; then delete `generateSideWorld`'s surface, walkway, ground line and mound, and whatever of `transect.ts` the curtain does not use
   - the single-map `Game` (owner, #181 D1): tests on hand-made fields that build a `Game` run on `oneArena(field, seed)` (`harness.ts:481`); the queenless grow-from-stores path (`colony.ts:1568-1574`) goes. Bare-`Colony` tests on a field keep: a layer with no entrance stays the plane (owner, 2026-11-14), and only the top-down leave gate (`colony.ts:280`) goes
   - the view proxies: `#entrance === null` read as "top-down" (a layer with no entrance stays the plane; only the view reading goes), `map.sky`, and `this.queen` read as "side view"
   - the colony-wide strategist, all of it (owner, 2026-11-14): `StanceSituation`, `localStance`, the stance lane `c0`, `strategyChoices`, `stanceGate: 0`'s broadcast, the colony-level `stance` field and what reads it: `stanceOf`'s colony fallback (`colony.ts:1405`), the `col.stance === "raid"` test in `stanceStep` (`stance.ts:50`), the march at `raidTarget` with no raid gate (`steer.ts:425`, which A6's and A13's attackers ride; removing it drops one read of `raidTarget`, in the Raids row of the vision gap table) and the journal's `stance` category. A species with no stance lane (the desert ant, `LONE`) gets each ant's own stance like the others (owner, #184 D1), so D1–D3 are re-run
   - the side-only and top-only params
   - `fungusContext(view)`
   - the plane/curtain twins, merged into one function each: `#believe`, `#dropOut`, `#markMidden`, `heapMound`, `takeLoose`

   `fungusContext` keeps its `-side` form byte for byte, so the shipped fungus answers keep their keys and need no re-ship ([one-world-only.md](one-world-only.md), `precache` row). If a context's string does change, ship the answers of a live check (`--import`) and note each lane's hourly cost in the PR.
5. **Docs and beads.** Update CLAUDE.md's commands, `one-world.md` and the vision gap table. Close or supersede the beads that were only about the side view.

## Stage 3: take `Colony` apart (bit-exact)

1. **An ant store.** Each per-ant field is declared once: name, array type, initial value, saved or not, reset on spawn, reset by `asIs`. The store allocates the arrays and drives spawn, save and load; `asIs` stays hand-written (it runs for every healthy host each step) and a test ties it to the table. It replaces four hand-kept lists, and a schema test replaces the source-scanning guards in `save.test.ts`.
2. **Private state reachable from other modules.** The `#private` fields move to a context object, so behaviour can live in other files.
3. **Modules by seam**, each a set of functions over the context:

   | Module | What moves into it |
   |---|---|
   | `sense` | sensors, raid smell, floor marks |
   | `decide` | the mode decision and the response calls |
   | `steer` | steering per mode |
   | `tunnel` | walking tunnels, hugging walls |
   | `homing` | path integration, belief, the home field |
   | `dig` | digging, backfill, mound, spoil |
   | `nestWork` | porters, nurses, undertakers, the midden |
   | `body` | energy, laying, brood, alates |
   | `layers` | binding a layer, crossing between layers |
   | `grid` | the free helpers |
4. **`tick()` as a pipeline:** perceive → stance and raid bookkeeping → decide → steer → move and dig → arrive, each a stage function. Each ant's step passes between them through an `AntStep` record (the sensors still fill the shared buffer `col.s`), and RNG draws stay in order.
   - *How* (`ja-fnd.4.4`, children `.1`–`.6`, one stage a PR): a run of top-level statements of the per-ant loop moves, verbatim but for `this` becoming `col`, into a stage function called in its place. The locals that cross the boundary are copied into the per-ant `AntStep` record (`step.ts`, one per tick, reused) before the call and read back after it, so the stage's code is unchanged inside and the draw order with it. The layer switch at the top of the loop stays in `tick` (loop plumbing). Stages, in loop order: perceive (sensors, the enemy heading), stance and raid bookkeeping, decide (goal, mode, the policy ask, contact), steer (the heading per mode, alarm, trails), move and dig (the step, faces, landing), arrive (pick-ups, at the nest, rest, leave, integrate). Once all are out, the copies between them can become the record's fields directly.
   - The script that finds the crossing locals (with the TypeScript checker: the loop shadows some of tick's own lets, so names alone get them wrong) is `scripts/lab/tick-stage.mjs`.
   - Built: perceive (`perceive.ts`, 44 lines, ja-fnd.4.4.1; `colony.ts` 3,292 → 3,275, the loop 1,215 → 1,208 lines); stance and raid bookkeeping (`stance.ts`, `stanceStep`, ja-fnd.4.4.2: held at the gate, foes, threat and defending, recruits and the raid's end, a finder home to tell, the carry response, what it carries now; `colony.ts` 3,275 → 3,166, the loop 1,208 → 1,098 lines, `stance.ts` 157 lines). The first statement's leading comment moves with it. Decide (`decide.ts`, ja-fnd.4.4.3: where homing heads, the mode a load or the mode policy or the gate gives it, and the contact response over it; `colony.ts` 3,166 → 3,053, the loop 1,098 → 988 lines, `decide.ts` 181 lines). `scripts/lab/tick-stage-imports.mjs` adds a stage file's imports from tsc's missing names. Steer (`steer.ts`, ja-fnd.4.4.4: the heading per mode (homing by its vector, walls, trails, backfill and stale tunnels; following; fighting and raiding; exploring), then fleeing, alarm, the trail it lays, the wait at home and the last stretch into its hole; `colony.ts` 3,053 → 2,596, the loop 988 → 557 lines, `steer.ts` 527 lines). Move and dig (`move.ts`, `moveDig`, ja-fnd.4.4.5: the step its heading gives; faces glanced off, dug or dug on; blocked, wall-following or a bump; up out of the hole, which ends the ant's step: the stage's first `continue`, now `return true` after copying `h` out; `colony.ts` 2,596 → 2,378, the loop 557 → 376 lines, `move.ts` 224 lines). Arrive (`arrive.ts`, ja-fnd.4.4.6: food picked up, spoil and corpses carried out and dropped, a pellet on the mound or back as fill, pick-ups, home at the nest, rest and tiredness, leaving again, and the home vector, floor marks, nest work and route on the plane; a pellet carrier crossing up at its hole, or an ant going down a hole from the plane, ends its step (the stage's two `continue`s, now `return true`); a unit test now guards the crowd's running average (`crowdKeep`), which nothing else noticed dropped (review of #154); `colony.ts` 2,378 → 2,151, the loop 376 → 157 lines, of which most are the copies, `arrive.ts` 297 lines). The moved code has its own `col` and `c`, so the script names the colony parameter `colony` here. That ends the stages: the loop is the layer switch, six stage calls and the heading. Cleanup (ja-fnd.4.4.7, the review of #154's D1 (b)): what every stage reads and none writes (the tick's `p`, `rng`, `dt`, `a`, `ca`, `sa`; the bound layer's `map`, `ph`, `home` and gates) goes into the record once before the loop and again at the layer switch, not before each call: 38 copy-ins fewer (`colony.ts` 2,151 → 2,144, the loop 157 → 131 lines; Prettier puts each setter on its own line). Then (ja-fnd.4.4.8, (c)) the stages read one another's fields directly: tick keeps no per-ant copies (98 lines; `colony.ts` 2,144 → 2,046, the loop 131 → 33, `tick` 111), only the layer switch, the six calls and `this.heading[i] = s.h`; the count of held ants accumulates in the record (`s.heldNow`). Shown safe first by running every tier with all 29 per-ant fields poisoned at the start of each ant (NaN, or a proxy that throws on any read): bit-exact, nothing read. A NaN reads as false, so the 9 true/false fields were checked more strictly in the review of #159: every field stamped when a stage wrote it for this ant, every read checked against the stamp, 0 stale reads in 46.9 M ant-steps. `ui/tests/stageOrder.test.ts` keeps the order: a stage's prologue reads only fields an earlier stage writes at its top level, and no stage with nothing to return returns early.
5. **Tuning by domain**, under `colony/tuning/`. Built (`ja-fnd.4.5`): `homing.ts`, `foraging.ts`, `stance.ts`, `brood.ts`, `midden.ts`, `nest.ts` and `dig.ts`, each constant moved verbatim with its comment, in its old order within its file; `tuning.ts` re-exports them all, so no import changed. The constants in `hunger.ts`, `royal.ts`, `game.ts` and `fungus.ts` stay in those modules: each is already its domain's own file (other modules import them from it).
6. **`experiment.ts`** splits into a harness (`runGame`, `Arena`, probes) and the assay catalogue. Probes read through the facade. Built (`ja-fnd.4.6`): `harness.ts` (the run spec and `runGame`, events, the probes, `Arena`, `oneArena`/`onPlane`, `gateProbe`), `oneAssays.ts` (G1, S1, F1, R1) and `desertAssays.ts` (the desert ant's); `experiment.ts` keeps the arena assays and the lists `ASSAYS`, `ONE_ASSAYS` and `ONE_PENDING`, and re-exports the rest, so scripts and tests still import it by name. Moved verbatim; `npm run exp` output is identical. Not done: the probes still read the colony's arrays directly (`c.x`, `c.layer`, `c.n`), not through a facade; that half is `ja-fnd.4.13` (review of #195, D1), and needs the facade defined first.

Each module gains direct unit tests; that is where development gets quicker.

**Order of work, and what is built** (`ja-fnd.4`):
- *Declarations out* (built, `ja-fnd.4.7`): `colony.ts` lost the 700 lines after its class and the parameter block before it, moved verbatim by a script (`params.ts` the colony's parameters and defaults; `tuning.ts` the tuning constants; `grid.ts` the free functions over the map; `situation.ts` the situation as an index). `colony.ts` still re-exports every name it exported, so nothing outside changes. 7,015 → 6,195 lines.
- *Private state reachable* (built, `ja-fnd.4.2`): the colony's 34 `#private` fields and 150 private methods are ordinary members now (a rename, `#x` → `x`; four names that collided with public ones were renamed: `loadLayer`, `placeNewborn`, `atHome`, `touchProbe`), so a module can be a set of functions over the colony (`this.` becomes `c.`). Saves: the state written by name in `private` is the list `COLONY_STATE` (saved and restored by one loop each), `COLONY_SKIP` names what is code or rebuilt, and any other property is saved with the public fields; the source-scanning test became a check of those lists against the colony's own properties.
- *One seam a PR* (`ja-fnd.4.3`, children `.1`–`.6`): the method clusters, each moved verbatim into functions of its module by a script (a method `m(i)` becomes `m(col, i)`, `this` becomes the parameter, `this.m(x)` at a call site becomes `m(this, x)`), found from the call graph: a cluster is a method and the helpers only it calls. Built: tunnel (`tunnel.ts`, 552 lines: `walkTunnel` and its 13 helpers; `colony.ts` 6,160 → 5,625); nest work (`nestWork.ts`: `port`, `nurse`, `undertake`, `middenSmell`, `nestLife` and the helpers only they call, 14 functions, 682 lines; `colony.ts` 5,625 → 4,958). The homing helpers that cluster's closure reached (`around`, `climbOut`, `towardHole`, `holeMetric`, `targetHole`) stayed in the class until the homing seam, since `tunnel.ts` calls them too (`around` then moved with the sense seam). Dig (`dig.ts`: picking up and putting down pellets, dropping spoil on the plane or out of the hole, backfill and stale tunnels, unburying, the crust, a chamber face once dug and the cell a carrier takes to a chamber; 19 functions, 549 lines; `colony.ts` 4,958 → 4,418); `chamberSpot` and `chamberRoom` stay in the class, since `tunnel.ts` calls them too. The layer indices `PLANE` and `CURTAIN` moved to `vocab.ts` (re-exported from `colony.ts`) so `dig.ts` needs no value import from `colony.ts`. Homing (`homing.ts`: path integration, belief, route memory and search, the home field, the way to and out of the hole, the destination marks; 24 functions, 472 lines; `colony.ts` 4,418 → 3,967). `goal` became `homeGoal`, as the tick's local `goal` would shadow it; `swapBroodStore` moved to `pheromone.ts` beside `Mark` (re-exported from `colony.ts`); `tunnel.ts`, `nestWork.ts` and `dig.ts` call the moved functions directly. Sense (`sense.ts`: what an ant senses around it (nestmates, returning foragers, enemies and their heading), the situation it touches, the raid smell, where it perceives itself and the floor marks it lays; 15 functions, 299 lines; `colony.ts` 3,967 → 3,698). `around` never read the colony, so it lost that parameter (`around(g, x, y)`); `item` and `place` stay as small public methods (tests read them); the tests that asked `colony.touch(...)` call `touch(colony, ...)`. The mode indices `EXPLORE`..`FIGHT` moved to `vocab.ts` so a module can use them. Body (`body.ts`: each ant's energy and age each tick, dying and what it leaves, feeding home, workers aging out, newborns placed; 7 functions and the newborn-reset cache `spawnResets`, 280 lines) and crossing (`crossing.ts`: going up out of the hole or down into it, carrying out, the gate; 7 functions, 186 lines); `colony.ts` 3,698 → 3,248. The public entry points `kill`, `feed`, `spawn` and `putAnt` stay methods (the game, the fungus and tests call them) and call into the modules. The layer switch (`bind`, `store`, `loadLayer`) stays too: every module reaches it through the colony. `atGate` keeps a one-line delegating method, so `sense.ts` reaches it through the colony: importing `crossing.ts` there would close a runtime cycle through `homing.ts`. That ends the seams; next, the tick pipeline (`ja-fnd.4.4`). After the pipeline, a second seam pass (`ja-fnd.4.12`; the owner's target is no behaviour left in the class but the API every module uses, not a line count): save (`colonySave.ts`: the bodies of `saveState`/`loadState`, and COLONY_STATE, COLONY_SKIP and LAYER_STATE, re-exported from `colony.ts`); policy and situation (`localRules.ts`: `localPolicy`, `localStance`; `colonySituation.ts`: the bodies of `setSituation`, `stanceSituation`); plane foraging and site memory (`plane.ts`: `siteAim`, `mill`, `rememberSite`, `onMLine`, `pointDown`; `smellsFood` stays a method, a test spies on it); layers (`layers.ts`: the slots, the layer view, store and load; `bind` and `wire` stay methods). A method the game, the UI or tests call stays as a one-line delegate. `colony.ts` 2,088 → 1,597. Then pellets and the midden (`pellets.ts`: `pickLoose`, `takeUpLoose`, `clearPellet`, `markMidden`, `markMiddenPlane`), `seeHoles` to `layers.ts` (the game calls `seeHoles(c)`), and a layer's gates for a tick (`Gates`, `gatesFor`) to `step.ts` beside the record they fill; `colony.ts` 1,597 → 1,434. Last, `heatStep` (the only behaviour left that no module but `tick` calls) to `heat.ts`; `colony.ts` 1,434 → 1,414. The top-level types `Corpse`, `Queen`, `Layer` and `HoleCell` stay: they are the shapes every module reads, not behaviour.
- *`tick()` as a pipeline* (`ja-fnd.4.4`) last: it is about 1,270 lines and calls the rest.
Each step keeps the golden masters bit-exact and the random draws in order; a script moves the text so a reviewer reads moves, not rewrites.

## Stage 4: species, channels, schemas, lanes

1. **The situation schema as data.**
   - A table of fields (name, values, legend line) generates the encoder, the decoder, `SITUATIONS`, the cache key, the state sent to Jev, `COLONY_LEGEND` and the `policyText` rows.
   - A snapshot test proves every string is byte-identical to today's.
   - The response lanes' situation too (`ja-fnd.5.6`): `Touch`'s 14 fields are declared once (`responses.ts` `TOUCH_SCHEMA`), and `touchKey`, each hook's `responseKey` and `RESPONSE_LEGEND` come from them. A field's `key` may give null to leave itself out of the key (quality, when fair). `tests/unit/touchSchema.test.ts` checks every key against the hand-written ones over all 28,800 combinations of the key's fields and pins the legend's hash. `packResponseRequest` still picks each lane's fields by hand: the order of the ants' fields in the request is part of what Jev reads.
2. **A lane registry (`LaneSpec`)**, declared once in `colony/lanes.ts` (one file: three rows do not need a directory; slices in `ja-fnd.5.2`). Each lane lists:
   - its name, id prefix, context and version
   - its schema, question, pack/read/valid and local rule
   - its batching and reconsider rule
   - a sample situation and a token estimate
   - its explainer rows and its "decided by" text

   Everything else loops over the registry:
   - `ui/colonyJev.ts` keeps only the runtime state.
     Built for the client's lanes (`ja-fnd.5.7`): the fungus and growth lanes are their rows with the client's menu, view and local rule bound in, as the ants' are their rows with the species' words; `seed` checks a context's answers by its row (`#validFor`), not a lane built for the purpose; and the state's per-lane counters are one record, `state.lanes[name] = { asked, cached }`, so a lane added to the registry gets its counters without a new field.
   - `prompt.ts`, the token estimates, Learn, the follow card and `precache` read from it.
   - The response hooks become entries in it.
3. **A `Species` descriptor** (designed in [species.md](species.md): three tiers, tier 1 first, one species per game first; slices in `ja-fnd.5.3`) with:
   - the channels it lays and reads
   - its sensor layout
   - its situation schemas, and its modes with their steering
   - its lanes
   - its physiology constants and default params
   - its nest kind

   One species ships: today's ant, bit-exact. Pheromone channels are per species, and the fungus's levers are gains keyed by channel (perceive, emit) instead of named colony arrays.
4. **A policy API on the sim.**
   - `colony.bindPolicy(lane, fn)` replaces the UI assigning `colony.policy`, `stancePolicy` and `fungus.policy` (built, `ja-fnd.5.4.1`: `Colony.bindPolicy("mode" | "stance", fn)`, `Fungus.bindPolicy("fungus" | "growth", fn)`, the fields readonly, a source-scan test).
   - `Game` takes N colony specs instead of a fixed player and rival.
   - Doctrines are keyed by colony and species, not by position.
5. **A nest-kind interface** (the dug curtain today): chamber roles, entrances, the mound. This is the hook for new final structures.

**Acceptance:** a test species with one extra channel and one extra sense is added in a test file. Nothing outside `species/` and its own lane changes.

## Stage 5: the UI (any time after stage 0)

1. **A `GameSession` store.**
   - The loop, stats, saves, flights and founding move into a plain TypeScript class with `subscribe`, `getSnapshot` and a version.
   - Components select slices with `useSyncExternalStore`.
   - This ends the whole-tree re-render, the 250 ms and 500 ms forced ticks in `AntCard` and `NestTab`, and the loop restarting on pause.
   - A game context and a Jev context replace the prop drilling.
   Built, part 1 (`ja-fnd.6.1`): the loop is `ui/gameLoop.ts` (`GameLoop`: steps the game, takes the stats every 150 ms, counts frames, tells subscribers; the frame source is injected, so `ui/tests/gameLoop.test.ts` drives it by hand) and the stats are `ui/stats.ts` (`statsOf`, the types). `useColony` builds one loop per game and sets playing and speed on it, so a pause or a speed change no longer tears the loop down (it starts the windows over, as the restart did, and a new game's loop shows the old one's stats and frame count until its first frame); it no longer hands `stats` and `fps` to the page. Built, part 2 (`ja-fnd.6.1`): `ColonyApp` provides the loop through `SessionContext` (`ui/session.ts`), and each reader takes a slice with `useStats(select)` (`StatSelection`, `ui/statSelect.ts`: the same value comes back while the slice is unchanged, so a component draws again only when it changed). The page reads only what it needs at the top (is a queen in the air, can the fungus keep a mutation, the outcome and the chapter, for notices); the clock, the sun, the pace chip, the goal line, the fungus and mutation panels, the Lab's cards and the policy tab's cost sentence are leaves that select their own. Measured in Chromium with a counter in the page: it drew 60 times in 5 s of play before and 4 after. A component that reads game state the stats don't hold while it draws (a flag a tick sets, the fungus's reach, the clock to the tick) uses `useGameRead(read, eq)`, which re-reads on each stats tick and draws only when the result changed (the Lab's game time, the doctrines' closed notes, the lever notes). The forced redraws on timers (the ant card, the specimens, the lens, the nest tab, the Lab's history) are `useSimTick(everyMs, on?)`, which takes its pace from the loop's stats ticks (`gatedSubscribe`, `ui/statSelect.ts`), so they stand still with a hidden tab, go on while the game is paused as the loop does, and no component runs a timer of its own for the game. The stats come every 167 ms at 60 Hz, so a gate fires on every whole number of them above its interval: a 250 ms one about every 310 ms (the ant card, specimens and lens went from four redraws a second to about three), 500 ms about 600, 1,000 ms about 1,040. `ui/tests/noTimers.test.ts` names every timer the page's components have, with what it is for (wall-clock ages, a toast's life, the autosave), and fails on a new one or a name that has gone stale; the journal card reads its count with `useGameRead`. Left: the game and Jev contexts (Jev's state is still prop-drilled), and the founding functions as session methods.
2. **Game rules out of components.** The flight, pen and founding flow, and the Lab's founding (which matches on error text), become session methods with typed results. Dev hooks move to `src/dev/`.
   Built, part 1 (`ja-fnd.6.2`): a new queen's founding is `ui/flight.ts` (`foundOnWords`, `foundOnMothers`, `lostNotice`: typed `Founded` results with the notice and whether play resumes; `ColonyApp` shows them), and the lab's founding beyond an end is `Game.tryFoundBeyond` (its index or why not; `foundBeyond` throws on top of it), so `LabCards` no longer matches error text. Part 2: the dev hook is `dev/hook.ts` (`devHook` builds it from the page's handles, `installDevHook` puts it on `window`; ColonyApp installs it behind `import.meta.env.DEV`, and it is not in the production bundle: no `jevAnts` in `dist`), and `ui/tests/devHook.test.ts` pins every name the e2e guard calls and what each does. Left: `Game.found` still finds a loss by matching the error text on its side-view path, which `ja-fnd.3.3.4` (Game one-world only) removes with that path; and the functions become session methods with `ja-fnd.6.1`'s store, agreed with the page redesign (ja-mvo9).
3. **`ColonyField` in parts** (the plan, the slices, the proof for each and the risks are in `docs/field-split.md`; tracked as the epic `ja-fnd.6.3`):
   - a plain-TS `FieldRenderer`, with layers: ground, nest, ants, overlay, minimap
   - a camera controller
   - an input hook
   - the HUD
   - a read-only scene adapter, so a species or nest kind brings its own drawer
   Built, slice 0 (`ja-fnd.6.3`): `scripts/field-shots.mjs`, the map's pixel guard. `record <dir>` renders 34 fixed scenes of the one world's canvas in Chromium (seed 3 from a fresh paused game, stepped a fixed number of ticks: the generic ant's world above and below, each nest zoomed with the minimap, a followed ant on each layer, the queen's pen and the chamber labels; the dark scheme; the desert ant's noon, dusk and night) and hashes each; `check <dir>` renders again and names the scenes that differ, saving them beside the baseline. The scenes are deterministic (a record and two checks agree, as a subset too), and a change to a draw call shows in the scenes that draw it (the heat wash in the noon and dusk scenes, the night wash in the night scene, the labels in theirs). A pure move of drawing code is `record` on current main, then `check` after the move; the baseline belongs to the machine and its Chromium (`check` refuses another one), never committed. Seven scenes (`ja-fnd.6.3.4`) set a grown fungus (cords, stalks, knots, spores on the curtain) and a world with a third colony and an aphid clump (the line's bend, ants on the strip, trails) up through the dev hook; a mutant of each layer's own layer filter, colour or order failed one of them. Five more (`ja-fnd.6.3.20`) drive the page itself: the builder's tools by the real pointer (sugar, crumbs, rock, a crayon line, aphids), a pinned specimen, a moved ant's trace (its start ring only: the page is paused, so the ant never walks and no run, loops or end dot are drawn), and a 390 px touch page above and below. Four more (`ja-fnd.6.3.5`, review of #304) cover what the field reads each frame from the page rather than from the game: the pointer resting in the queen's pen (the settle preview), the theme flipped after the first frame, and the same world at two device pixels to a CSS pixel (`retina` page); a stale `inputs.hover`, `fctx.theme` or `fctx.d` in `draw()` fails one of them (a stale `fctx.ext` is not visible: the curtain's height never changes). Every stroke is proved to have landed (the game's food, terrain, crayons, aphids or ants must change) or the run stops. **Not covered yet** (added with the slice that moves that layer, whose PR says which scene covers it): ants of every stance, a specimen on an underground ant, the no-entry paint (a pheromone channel, drawn only with smell vision on), the trace's run and loops. The lens card is DOM and `draw()` paints no lens marks, so it is not a scene. Mutants no scene can see: a corpse's stalk level on its ground sprite (that sprite ignores it), and the plane's marks (stalks, a specimen's ring, a moved ant's trace) drawn on the curtain (they fall off screen at the scenes' zoom). One thing the scenes found: once chamber labels have been on, the canvas keeps the label block's `lineJoin` and `lineWidth` for every later stroke (ColonyField sets them and never resets them), so the labels scene is last on its page (`lineCap` is the most widespread leak: resetting it at the start of a frame changed 6 of the first 8 scenes); a split that gives each layer its own canvas state would change those pixels on purpose.
   Built, `ja-fnd.6.3.13`: the first three files of `ui/field/`, plain TypeScript with no React, DOM global or clock (`ui/tests/fieldPlain.test.ts` holds that line). `prelude.ts`: `prepareFrame`, the follow, the crossing through a hole (`carryTo`) and the camera's ease, which `draw()` ran inline and nothing tested; nine unit tests, each mutant of its logic caught. `result.ts`: `FrameResult` and `publishFrame`, what a frame writes to the shell's refs (the tilt, `angled`) and to `canvas.dataset` (what the Playwright guards read); four tests. `env.ts`: `FieldEnv` (`now`, `dpr`, `dev`, `reducedMotion`, `sprites`) and `browserEnv(dev)`, which ColonyField builds once per effect; a test gives fakes later. Pixels unchanged: all 30 scenes match a baseline of main and `npm run e2e` passes. Next: the layers (`ja-fnd.6.3.5` onward).
   Built, `ja-fnd.6.3.5`: the first layer out. `ui/field/ctx.ts`: `FieldCtx` (the 2D context, the theme, the device ratio, the viewport, the camera, the layer and map shown, the world, colonies and fungus; the shell fills the per-frame fields after `prepareFrame`) and `FieldInputs` (what a layer reads of the shell's refs: the pointer, the pen and its preview cache; the rest join as their layers move). `ui/field/overlays.ts`: `pill`, `label`, `traceColumns`, `drawLine`, `drawHoleNames`, `drawBends`, `drawStripAnts`, `drawPen`, plain functions over them; `colour.ts` takes the odour tones the layers share. `ui/tests/recordingContext.ts`: a fake `CanvasRenderingContext2D` that records every call and property set as a line of text (text measured as half the font size a character, so no machine differs), and `overlays.test.ts`: 8 log tests (the strip's as a full log of ants put on known cells; a pass at `d = 2`), and 70 mutants of the helpers (a colour, an alpha, a filter, an order, a clamp, a width, a dash) each fail one. Pixels unchanged: the 30 scenes that existed match a baseline of main, e2e passes. ColonyField is 2,296 lines (2,612 at the start of the epic).
   Built, `ja-fnd.6.3.6`: the fungus layer out. `ui/field/fungus.ts`: `drawHyphae` (the thin runs and the cords as two strokes, the fusions' bows, twigs once the cells are hexagons, the tips, the mass in transit as a glow, the knots and fruits), `drawFungusGround` (this layer's hyphae, then each colonised corpse, with the cadaver under a stalk when none is visible) and `drawStalksRaised`; the chain cache keeps its clock from `FieldEnv.now`. `FieldEnv` gains `newPath` (the Path2D, which `drawHyphae` needs and `drawHexes` and `paintChunk` will); `FieldCtx` gains `env` and `sprites`; `field/zoom.ts` holds `HEX_ZOOM` and `BRICK_ZOOM`. The spore wash is not here: it is painted into the ground's chunks, so it moves with `paintChunk` (`ja-fnd.6.3.7`). The recording fake context learns what the layer needs (`save`/`restore` keep the properties, the line dash, a recording `Path2D`, `stateAt` and `shape` helpers, and a call with a number that is not finite throws: a real canvas ignores it silently). `fungus.test.ts`: 7 log tests over a hand-built hyphal tree, and 41 mutants of the layer (an alpha, a width and its clamp, the distance at which twigs start, a window filter, the load threshold, a knot flag, the chain cache's rules) each fail one. Pixels unchanged: all 34 scenes match a baseline of main, e2e passes. ColonyField is 2,099 lines.
4. **A small kit:** buttons, segmented control, card, one dialog/drawer with a single Escape and focus manager, one policy editor (it exists three times today), lever chips, stats, bars.
5. **One theme.**
   - The canvas colours map into `@theme`.
   - The palette follows light and dark.
   - The colony colours come from one source for the canvas and the text.
6. **Content as data.** Sense tables, lane prose and the chip-to-Learn maps hang off the lane and species registry, as `guide.ts` and `policyText.ts` already do.

## Stage 6: server, worker, wire (any time after stage 0)

1. **Validated wire types in `shared/`** for the run summary, the proxy reply, health and the run body. The client parses replies instead of casting them.
2. **Shared plumbing.** The pass header, body limit and error envelope live in `shared/`. One body parser and one error reply serve the dev server and the Worker. One retry loop serves both Jev callers.
3. **The model is pinned by both transports**, not only the Worker. Drop `Buffer` and the `NodeJS.ProcessEnv` cast from the Worker's path.
4. **Debounce the browser cache's save.**

## Order

```
0 tests/CI/scripts ─► 1 vocabulary ─► 2 one world only ─► 3 take Colony apart ─► 4 species and lanes
        └─────────────► 5 UI  ·  6 wire (independent, after 0)
```

Stage 2 comes before stage 3 so that no effort goes into splitting code that is about to be deleted. Within stage 4, the lane registry can land before `Species`.

## Checks for each stage

- `npm run lint`, `npm run typecheck`, `npm test`; after stage 0, `npm run test:unit` in under 10 s.
- Golden masters bit-exact (stage 2 re-records them).
- `precache.test` green.
- `npm run e2e` for UI stages.
- `npm run test:slow` before merging colony stages.
- Stage 2: assay baselines on seeds 1–10, confirmed on 11–20.
