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

The top-down and side maps are retired.

**Blocked by:**
- `ja-d6c`: trail choice, the faint-alarm draw and the raid trail must run on one world's surface.
- `ja-lp4.6`: guards and assays on one world.

1. **Inventory.** 35 of the 54 colony test files build an open or side map. List each of them, and each assay in `ASSAYS` and each slow guard, as one of:
   - port to one world
   - covered by a one-world test
   - delete
2. **Port the assays that carry PRD baselines** to one world. Record the new baselines in the PRD, choose by the worst seed, and confirm on seeds 11–20.
3. **Re-record the golden masters on one world only:** fast and slow.
4. **Delete:**
   - `generateWorld`, `generateSideWorld`, `OPEN_WORLD`, and whatever of `transect.ts` the curtain does not use
   - the view proxies: `#entrance === null`, `map.sky`, and `this.queen` read as "side view"
   - the colony-wide strategist (`StanceSituation`)
   - the side-only and top-only params
   - `fungusContext(view)`
   - the plane/curtain twins, merged into one function each: `#believe`, `#dropOut`, `#markMidden`, `heapMound`, `takeLoose`

   Contexts that name a view change, so ship the answers of a live check (`--import`) and note each lane's hourly cost in the PR.
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
4. **`tick()` as a pipeline:** perceive → decide → steer → move and dig → carry and drop → body → cross. Each ant gets a `Perception` record instead of a shared buffer, and RNG draws stay in order.
5. **Tuning by domain**, under `colony/tuning/`.
6. **`experiment.ts`** splits into a harness (`runGame`, `Arena`, probes) and the assay catalogue. Probes read through the facade.

Each module gains direct unit tests; that is where development gets quicker.

**Order of work, and what is built** (`ja-fnd.4`):
- *Declarations out* (built, `ja-fnd.4.7`): `colony.ts` lost the 700 lines after its class and the parameter block before it, moved verbatim by a script (`params.ts` the colony's parameters and defaults; `tuning.ts` the tuning constants; `grid.ts` the free functions over the map; `situation.ts` the situation as an index). `colony.ts` still re-exports every name it exported, so nothing outside changes. 7,015 → 6,195 lines.
- *Private state reachable* (built, `ja-fnd.4.2`): the colony's 34 `#private` fields and 150 private methods are ordinary members now (a rename, `#x` → `x`; four names that collided with public ones were renamed: `loadLayer`, `placeNewborn`, `atHome`, `touchProbe`), so a module can be a set of functions over the colony (`this.` becomes `c.`). Saves: the state written by name in `private` is the list `COLONY_STATE` (saved and restored by one loop each), `COLONY_SKIP` names what is code or rebuilt, and any other property is saved with the public fields; the source-scanning test became a check of those lists against the colony's own properties.
- *One seam a PR* (`ja-fnd.4.3`, children `.1`–`.6`): the method clusters, each moved verbatim into functions of its module by a script (a method `m(i)` becomes `m(col, i)`, `this` becomes the parameter, `this.m(x)` at a call site becomes `m(this, x)`), found from the call graph: a cluster is a method and the helpers only it calls. Built: tunnel (`tunnel.ts`, 552 lines: `walkTunnel` and its 13 helpers; `colony.ts` 6,160 → 5,625). Next: nest work, dig, homing, sense, the rest. The mode indices `EXPLORE`..`FIGHT` moved to `vocab.ts` so a module can use them.
- *`tick()` as a pipeline* (`ja-fnd.4.4`) last: it is about 1,270 lines and calls the rest.
Each step keeps the golden masters bit-exact and the random draws in order; a script moves the text so a reviewer reads moves, not rewrites.

## Stage 4: species, channels, schemas, lanes

1. **The situation schema as data.**
   - A table of fields (name, values, legend line) generates the encoder, the decoder, `SITUATIONS`, the cache key, the state sent to Jev, `COLONY_LEGEND` and the `policyText` rows.
   - A snapshot test proves every string is byte-identical to today's.
2. **A lane registry (`LaneSpec`)**, declared once in `colony/lanes.ts` (one file: three rows do not need a directory; slices in `ja-fnd.5.2`). Each lane lists:
   - its name, id prefix, context and version
   - its schema, question, pack/read/valid and local rule
   - its batching and reconsider rule
   - a sample situation and a token estimate
   - its explainer rows and its "decided by" text

   Everything else loops over the registry:
   - `ui/colonyJev.ts` keeps only the runtime state.
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
2. **Game rules out of components.** The flight, pen and founding flow, and the Lab's founding (which matches on error text), become session methods with typed results. Dev hooks move to `src/dev/`.
3. **`ColonyField` in parts:**
   - a plain-TS `FieldRenderer`, with layers: ground, nest, ants, overlay, minimap
   - a camera controller
   - an input hook
   - the HUD
   - a read-only scene adapter, so a species or nest kind brings its own drawer
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
