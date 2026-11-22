# Splitting ColonyField (ja-fnd.6.3)

The plan for taking `web/src/ui/ColonyField.tsx` apart: what it is, where it is going, how each slice is proved, the order, and what can go wrong. It is the detail behind `docs/refactor.md` S5.3; the work is tracked as the epic `ja-fnd.6.3` and its children. Written 2026-11-22 after the first two slices, and revised the same day after the review of the first draft (#291), which found that the frame does more than draw.

## Why

`ColonyField` draws the map: the one world's plane and curtain, the ants, the nests, the fungus, the minimap and the overlays, and takes the pointer, the keys and the wheel. It is the place a new species, a new nest kind or a new tool has to add a branch, and it is the file every feature session edits (37 commits since 2026-11-08, 2,612 lines on 2026-11-22; #276 added 383 lines net and #286 touched it again while the first slices were in review). It has no test beyond `camera.test.ts`. The roadmap (`docs/refactor.md` S5.3) asks for a plain-TypeScript renderer in layers, a camera controller, an input hook and a read-only scene adapter, so a species or nest kind can bring its own drawer instead of a branch.

**Definition of done** (the epic's acceptance): `ColonyField.tsx` under about 300 lines; the draw layers, the camera controller and the input hook plain TypeScript under `ui/field/` with no React; a headless renderer test in the unit tier; every pixel scene matching the baseline of the main each slice branched from; `npm run e2e` green (its flakes are tracked, below).

## Where the code stands (2026-11-22)

One React component. Props, refs and their sync effects are lines 332 to 472. Its render effect is **lines 473 to 2141 (1,669 lines)**: it builds the sprite sets and caches, defines about 16 draw helpers and `draw()` as closures over one shared set of variables, then (inside the same effect, after `draw`) the wheel handler, the sprite loads, the frame subscription and the cleanup. Below the effect: the pointer and key handlers (about 2296 to 2478: pan, pinch, the pen's click, the tweezers and the builder's strokes, the lens probe, the link click, pick), `showAll` and `goNest`, the page's handle on the cameras (`FieldApi`, about 2175 to 2203) and the JSX (the canvas, the Go to menu, the chamber-labels toggle, about 2500 to 2612).

| helper (about line) | what it draws or holds |
|---|---|
| `paintChunk`, `ground*` (655) | the ground a 64×64 chunk at a time, with the close-up sprites (#276) |
| `stripAt` (640) | the strip's cell lookup, used by the minimap |
| `paintMini` (857) | the minimap's picture: a second canvas and a clock |
| `drawHexes` (924) | the hexagon rows when zoomed in (uses `Path2D`) |
| `drawHyphae` (1026), `chainsFor` (303, module level) | the fungus's hyphae and cords (uses `Path2D`) |
| `pill`, `label` (1151, 1177) | text in a rounded box (badges, tags, chamber names) |
| `traceColumns` (1198), `drawLine` (1208), `drawHoleNames` (1238), `drawBends` (1265) | the ground line over the plane, the holes' names, the line's bends on the curtain |
| `drawStripAnts` (1291) | the strip's ants on the curtain |
| `drawPen` (1338) | the queen's pen: her flight's circle and where she would settle (remembers its preview in `penSeen`) |
| `draw` (1408 to 2096, 688 lines) | the prelude (below), the ground and the heat and night wash, the fungus, the nests and their life underground (about 1580 to 1880: brood, corpses, the queen, alates), the ants (odour bands, dots by load), the specimens and the followed ant's ring, the builder's traces, the aphids, the overlays, the minimap, the inspection, then the outputs (below) |

### What a frame shares (the state that decides the shape)

The first draft said the layers share the context and the chunk cache. They share much more; each row says where it goes.

| state | where it goes |
|---|---|
| set by `bind()` (542) every frame and by `rebuild()` (529): `lv`, `m`, `gx0`, `gw`, `gh`, `ext`, `geoMap`, `alarms`, `spores`, `strip`, `trails`, `sensedLayer`, `smellAll` | `FieldCtx` fields, filled by a `bind` step in the shell each frame. `rebuild` (clearing the chunk cache when the map's size changes) is called from that step, so invalidation stays with the shell |
| `theme`, a `let` replaced by `retheme()` (612: reads CSS variables, clears `tilePaint` and the worker and nest tints, resets `miniAt`) | a theme loader on `FieldEnv`; the shell calls `retheme` on a theme change; layers read `ctx.theme` |
| the chunk cache, `MapChunkPaintCache`, the `framePaints` and `frameHits` counters | owned by `ground.ts`; the counters come back in the frame's result |
| the minimap: the `mini` canvas, `miniImg`, `miniAt` (written in `retheme`, `rebuild` and `draw`) | owned by the minimap part of `ground.ts`, with the clock from `FieldEnv` |
| `penSeen` (the pen's remembered preview), `paths` | owned by the layer that uses them (`overlays.ts`, `ground.ts`) |
| refs and props read inside `draw`: `follow`, `layers`, `aphidsRef`, `tracesRef`, `pinnedRef`, `penRef`, `buildRef`, `labelsOn`, `orbit`, `hover` (written by the pointer handler, read by `drawPen`), `sensed`, `colonies`, `fungus`, `world`, and module state through `mapInspectionNow()` | one read-only `FieldInputs` snapshot the shell fills from its refs each frame and hands to the frame |
| objects built in the effect: `CadaverSprites`, `FungalMapSprites`, `WorkerSprites`, `NestSprites`, `ResourceSprites`, `SurfaceLeaves`, `MapLeafSprites`, `WorkerGait`, `MapVoxelPass` (built with `() => draw()`) | built by the renderer from `FieldEnv`; the renderer takes a redraw callback, which the sprite sets call when their images load |

### The frame is not only drawing

`draw()` also steers, and writes state other code reads:
- **The prelude** (about 1414 to 1441): the follow runs (it can null `follow.current` and call `followCb`), the camera re-centres on the followed ant, the crossing logic runs (`antLayer`, `carryTo`, `crossCb`), then the camera eases (`s.cam = aimed(...)`, `s.zoomedIn`). This is camera and follow logic, and it is the code `ja-18u` blames for an e2e flake. Nothing tests it today.
- **The outputs** (about 1898 to 1905 and the end): `orbit`, `orbitAxes.hidden`, `angled` (which the wheel and pointer handlers read), and the `canvas.dataset.*` attributes the e2e and the dev hook read (`hexCssPx`, `workerStyle`, `nestStyle`, `mapRenderer`, `voxelAlpha`, and in dev `chunkPaints`, `chunkCacheHits`, `fieldDrawMs`).

So `FieldRenderer.frame(inputs)` takes an **already-updated camera** and **returns a small result** (`angled`, `canRotate`, the renderer's name, the voxel alpha, diagnostics) that the shell writes to the refs and the dataset. The prelude stays in the shell as a `prepareFrame` step until the camera controller takes it, and the stage list excludes it; a characterisation test of its carry logic is written before anything moves it.

## The target shape

```
web/src/ui/field/
  env.ts          FieldEnv: what a frame needs from the outside world (below)
  ctx.ts          FieldCtx and FieldInputs: what a frame's layers share and read
  overlays.ts     drawLine, drawHoleNames, drawBends, drawStripAnts, drawPen, pill, label (+ traceColumns)
  fungus.ts       drawHyphae, stalks and knots, the spore wash
  ground.ts       paintChunk, paintMini, drawHexes, stripAt, the sprite ground, the chunk cache, the minimap
  nests.ts, ants.ts, marks.ts   the stages of draw(): nests, ants, and the specimens, ring, traces, aphids, inspection
  renderer.ts     FieldRenderer: frame(inputs) calls the stages in order and returns the result
  camera.ts       the per-view cameras and their controller, FieldApi's camera and centreOn, the prelude
  useFieldInput.ts   the pointer, key and wheel handlers
  Hud.tsx / GoToMenu.tsx   the small components the shell keeps
web/src/ui/ColonyField.tsx   the shell
```

**`FieldEnv`** is what makes a Node test possible. In Node 22 `document`, `Image`, `Path2D`, `OffscreenCanvas` and `matchMedia` are undefined and `import.meta.env.DEV` throws, and the frame code uses all of them: `Path2D` in `drawHexes` and `drawHyphae`, `document.createElement` for the minimap and the chunks (and in `nestSprites.ts`), `new Image()` in the sprite sets, `matchMedia` for reduced motion, `window.devicePixelRatio`, `getComputedStyle` for the theme, `performance.now()`, `canvas.dataset`. `MapVoxelPass` already takes factories (`mapVoxel.ts`); the other sets do not. `FieldEnv` carries `newCanvas`, `newPath`, `now`, `dpr`, `reducedMotion`, `dev`, the theme loader, and the sprite sets or fakes that report ready. Each slice introduces the port it needs: `now`, `dpr`, `dev` and `reducedMotion` with the prelude and result slice, `newPath` with the fungus and ground slices (`drawHyphae` and `drawHexes`), `newCanvas` with the ground slice (the minimap and the chunks) and the nests slice (`nestSprites.ts`).

**The stage list is the scene adapter.** `FieldRenderer` takes its stages as a list; a species or nest kind that needs its own drawer adds a stage, not a branch in `draw()`.

## How each slice is proved

A move of drawing code must change no pixel. Two proofs:

1. **The pixel guard** (`scripts/field-shots.mjs`, `npm run field-shots`, by hand in Chromium, about 85 s a run). `record <dir>` renders 18 fixed scenes of the one world's canvas and hashes each; `check <dir>` renders again and names the scenes that differ. Deterministic by construction (a fresh paused game of seed 3, stepped a fixed number of ticks through the dev hook, the canvas read once it has held still); a change to one draw call fails the scenes that draw it and only those.
   - **The protocol for a moving slice:** `record` on **current main** before the edit (a baseline is of that code), make the move, `check` after it; all scenes must match. The baseline belongs to the machine and its Chromium (`check` refuses another one) and is never committed.
   - **A layer with no scene gets one first or with the slice** (below). A move of a layer no scene draws is not proved.
2. **The recording fake context** (starts with the first layer that moves, `ja-fnd.6.3.5`). `FieldRenderer`'s layers run in the unit tier against a fake `CanvasRenderingContext2D` and a fake `FieldEnv` that record every call and its arguments; each layer gets a log test as it moves (the first log is of the post-move behaviour, and the Chromium guard is what shows it equals the old pixels), and the headless slice composes the scenes. It runs in seconds with no browser.
   - **What it cannot see:** real image decoding, rasterisation and fonts, and the loaded-sprite path unless the fake reports its sprites ready (it must, or the log is of the ink and symbol fallbacks, which no Chromium scene shows). The Chromium guard stays the arbiter of pixels; the log is the everyday check that no call changed.

The input handlers are not drawing, so neither proof covers them: `npm run e2e` (pan and zoom, the follow carry, the pen, the builder, the lens) and unit tests on the controller are the proof, with the carry logic characterised by a unit test before it moves.

### What the scenes cover, and do not

The 18 scenes (seed 3 unless said): the generic ant's world above (10 s and 100 s of game time) and below; each nest zoomed above and below (the minimap shows); a followed ant on each layer; the queen's pen; the chamber labels; the dark scheme (above, a nest, below, a nest); the desert ant's noon, dusk and night (the heat and night washes).

Not seen yet, each added with or just before the slice that moves its layer and shown to fail on a mutant of that layer: aphid clumps, stalks and knots, the curtain's spores, hole bends and the strip's ants, pheromone trails, hyphae and cords on a well-grown fungus (the cheap ones, in `ja-fnd.6.3.4`); ants by stance, a pinned specimen's ring, the builder's marks (sugar, walls, the clump, a moved ant's trace) and a phone-sized page (with the stage slices that move them). Mutants confirmed not caught today: spores read from the wrong layer, aphids drawn on both views, stalks read at layer 0. (The lens card is DOM; nothing in `draw()` paints lens marks, so it is not a canvas layer.)

## The slices

Each is its own small PR that **merges the day it opens**, with a fresh review, and the next starts from the new main. The **bead id is a label, not the order**: the order is this table and the dependencies set in beads.

| order | bead | slice | proof |
|---|---|---|---|
| 1 | `ja-fnd.6.3.1` | **done (#282)**: the pixel guard, 18 scenes | records and checks agree; mutants caught |
| 2 | `ja-fnd.6.3.2` | **done (#285)**: the null-world path deleted | 18 scenes match |
| 3 | `ja-fnd.6.3.3` | the one-map fallbacks outside the field: `lens.ts`, `LensLayer.tsx`, `lens.test.ts`, `inspectionPatch.ts` (76, 115), `cellInspection.ts` (103), a comment in `fungusSight.ts`; and the comment nits carried from #282 and #285 | unit tier; grep; 18 scenes match |
| 4 | `ja-fnd.6.3.4` | the cheap scenes: aphids, stalks and knots, curtain spores, hole bends and strip ants, trails, a grown fungus's hyphae and cords (script only, no app code; parallel with 5) | each fails on a mutant of its layer |
| 5 | `ja-fnd.6.3.13` | `FieldEnv`'s first ports (`now`, `dpr`, `dev`, `reducedMotion`), the frame's result, and the prelude as `prepareFrame`; a unit test of the carry logic first | the new unit test; 18 scenes match; e2e |
| 6 | `ja-fnd.6.3.5` | `FieldCtx` and `FieldInputs`, the overlay layers out (`overlays.ts`), the recording fake context and the first log tests | 18 scenes match; logs |
| 7 | `ja-fnd.6.3.6` | the fungus's drawing out (`fungus.ts`), `newPath` | 18 + the new scenes match; logs |
| 8 | `ja-fnd.6.3.7` | the ground and the minimap out (`ground.ts`), `newCanvas`, cache invalidation from the shell's `bind` | same |
| 9 | `ja-fnd.6.3.17` | **owner decision**: make the canvas state explicit per layer or not (below); decide before the stage slices so they are written with it in mind | a decision recorded on the bead |
| 10 | `ja-fnd.6.3.14` | the nests stage out (`nests.ts`: brood, corpses, the queen, alates), with `nestSprites`' canvas | same |
| 11 | `ja-fnd.6.3.15` | the ants stage out (`ants.ts`: odour bands, dots by load), with a scene for ants by stance | same |
| 12 | `ja-fnd.6.3.16` | the specimens, the followed ant's ring, the traces, the aphids and the inspection overlay out (`marks.ts`), with scenes for a specimen, the builder's marks and a phone page | same |
| 13 | `ja-fnd.6.3.8` | `FieldRenderer` and the stage list | same |
| 14 | `ja-fnd.6.3.9` | the headless renderer test composes the scenes, with sprites reported ready; says what fraction of the frame it cannot see | mutants of each layer change a log; under 10 s |
| 15 | `ja-fnd.6.3.11` | the camera controller, `FieldApi`'s camera and `centreOn`, the prelude and the input hook out; **can run in parallel with 10 to 14** once `ja-fnd.6.3.13` is in (it shares only `angled`, `orbit`, the follow prelude and the cameras with the renderer) | e2e and controller unit tests; the carry logic was characterised in slice 5 |
| 16 | `ja-fnd.6.3.10` | the canvas state made explicit per layer, **if** the decision says so; pixels move on purpose and the moved scenes are named | the re-recorded baseline, scenes named |
| 17 | `ja-fnd.6.3.12` | `ColonyField.tsx` is a shell under about 300 lines (`Hud.tsx` and `GoToMenu.tsx` extracted); docs; the epic closes | acceptance above |
| any | `ja-fnd.6.3.18` | optional: a label-triggered workflow that records on the base and checks on the head on one runner (about 3 minutes a slice) | the next slice's PR can cite it |

## Decisions taken (and what overturns them)

These were open in the review of #291; I took them so work can start, and each is one line to change.

- **The order above**, as the review recommended: scenes land with or just before the slice that needs them (not one PR adding eleven groups); the ports and the prelude get their own slice before the first move so `FieldCtx` has its real shape from the start; the recording fake context starts at the first move instead of waiting for the last; `draw()` is split into three stage moves and the renderer; the camera and input slice runs alongside.
- **The canvas state (slice 9, then 16).** The moves keep the state exactly as it is, so they stay pixel-identical. Making it explicit changes pixels, so it is an owner decision with its own bead, **before** the stage slices; if declined, the slice is dropped and the epic closes without it (the epic's close does not depend on it). The leak, measured in the review of #282: resetting `lineCap` to `butt` at the start of a frame changed 6 of 8 scenes; resetting `lineJoin`, `lineWidth`, alpha, text, dash or styles changed none of those 8 (which never had labels on); resetting everything changed 16 of 18, including the labels scene. `lineJoin` and `lineWidth` leak only after chamber labels have been on (the labels scene is therefore last on its page); `lineCap` leaks always. It is cosmetic in play, and a new stage can look wrong depending on whether labels were toggled.
- **Where the pixel proof runs.** By hand for now, with the recording fake context as the everyday proof from the first move; the label-triggered workflow is an optional bead (`ja-fnd.6.3.18`).

## Risks

- **Churn.** `ColonyField` changed 37 times in two weeks. A slice that stays open a few days conflicts. Hence small slices, merged the day they open, a baseline recorded on the main each branched from, and a check of the open PRs that touch the file before starting one (`gh pr list`; #287, a map tilt, edited it and should land before slice 5). Other sessions are not blocked: they add to the stages after the move as they added to the effect before it.
- **The effect closes over a lot.** See the state table: the plan depends on `bind`, `retheme`, the minimap and the sprite sets being given a home, which is why the ports and the prelude come before the first layer moves.
- **The e2e flakes.** Step 4 ("follow an ant through a hole") fails about 5% of runs on main (`ja-18u`: 3 of 60 unloaded, 7 of 60 under CPU load); step 14 ("notices") failed once in CI (`ja-9ib8`); the builder's tweezers step failed in CI on #252 and #254 (`ja-18u`'s notes), and the camera and input slice moves exactly that code. A failure there alone is not a slice's: one re-run, then say so on the PR.
- **Behaviour is not touched.** The colony is untouched by every slice, so the golden masters and the Jev cost are unchanged; each PR says "Jev cost: none".

## Log

| date | slice | PR |
|---|---|---|
| 2026-11-18 | 1: the pixel guard | #282 |
| 2026-11-18 | 2: the null-world path deleted | #285 |
