# Splitting ColonyField (ja-fnd.6.3)

The plan for taking `web/src/ui/ColonyField.tsx` apart: what it is, where it is going, how each slice is proved, the order, and what can go wrong. It is the detail behind `docs/refactor.md` S5.3; the work is tracked as the epic `ja-fnd.6.3` and its twelve children (`ja-fnd.6.3.1` to `.12`), one per slice below. Written 2026-11-22, after the first two slices.

## Why

`ColonyField` draws the map: the one world's plane and curtain, the ants, the nests, the fungus, the minimap and the overlays, and takes the pointer, the keys and the wheel. It is the place a new species, a new nest kind or a new tool has to add a branch, and it is also the file every feature session edits (35 commits in two weeks, up to 2,612 lines on 2026-11-22). It has no test beyond `camera.test.ts`. The refactor roadmap (`docs/refactor.md` S5.3) asks for a plain-TypeScript renderer in layers, a camera controller, an input hook and a read-only scene adapter, so a species or nest kind can bring its own drawer instead of a branch.

**Definition of done** (the epic's acceptance): `ColonyField.tsx` under about 300 lines, a shell of refs, the canvas, the HUD buttons and the Go to menu; the draw layers, the camera controller and the input hook are plain TypeScript under `ui/field/` with no React; a headless renderer test runs in the unit tier; every pixel scene matches the baseline of the main each slice branched from; `npm run e2e` is green (step 4 is a known flake, `ja-18u`).

## Where the code stands (2026-11-22)

One React component. Its render effect (about 1,300 lines) holds, as closures over one shared set of variables (`ctx`, `theme`, the device ratio `d`, the viewport, the shown layer `lv`, the shown map `m`, the camera, the chunk canvas cache):

| helper | what it draws | about line |
|---|---|---|
| `paintChunk`, `ground*` | the ground a 64×64 chunk at a time, with the close-up sprites (#276) | 655 |
| `paintMini` | the minimap's picture | 857 |
| `drawHexes` | the hexagon rows when zoomed in | 924 |
| `drawHyphae` (and `chainsFor`) | the fungus's hyphae and cords | 1026 |
| `pill`, `label` | text in a rounded box (badges, tags, chamber names) | 1151 |
| `drawLine`, `drawHoleNames`, `drawBends` | the ground line over the plane, the holes' names, the line's bends on the curtain | 1208 to 1291 |
| `drawStripAnts` | the strip's ants on the curtain | 1291 |
| `drawPen` | the queen's pen: her flight's circle and where she would settle | 1338 |
| `draw` | one frame: the ground and the heat and night wash, the fungus, the nests and their life underground, the ants (odour bands, dots by load), the specimens and the followed ant's ring, the builder's marks, the overlays, the minimap | 1408 to about 2100 |

Below the effect: the wheel, pointer and key handlers (pan, pinch, zoom, the pen's click, the tweezers and the builder's strokes, the lens probe, the link click, pick), the page's handle on the cameras (`FieldApi`), and the JSX (the canvas, the Go to menu, the chamber-labels toggle).

Already done (the slices that came first):
- **Slice 1 (#282):** `scripts/field-shots.mjs`, the pixel guard (below).
- **Slice 2 (#285):** the path for a game with no `world` is gone (`ONE_MAP`, `lv < 0`, about 45 guards): `world` is a required prop and the layer is always `PLANE` or `CURTAIN`.

## The target shape

```
web/src/ui/field/
  ctx.ts          FieldCtx: what a frame's layers share (below)
  overlays.ts     drawLine, drawHoleNames, drawBends, drawStripAnts, drawPen, pill, label
  fungus.ts       drawHyphae, stalks and knots, the spore wash
  ground.ts       paintChunk, paintMini, drawHexes, the sprite ground, the chunk canvas cache
  renderer.ts     FieldRenderer: frame() calls the stages in order
  camera.ts       the per-view cameras and their controller (the maths is already camera.ts)
  useFieldInput.ts   the pointer, key and wheel handlers
web/src/ui/ColonyField.tsx   the shell
```

**`FieldCtx`.** One object, built at the start of each frame, that the layers read: the 2D context, the theme, the device ratio, the viewport and camera, the shown layer `lv` (`PLANE` or `CURTAIN`), the shown map, the `world`, the colonies, the fungus, and the helpers `toScreen`, `inView`, `centreX` and `centreY`. It also holds the things that are not pure drawing and have to be injected: a factory for chunk canvases (they need a `document` or an `OffscreenCanvas`) and the clock (`performance.now()` for the traces and the minimap's repaint). Injecting those two is what makes the headless test possible. A layer is `(fc: FieldCtx, ...args) => void`; none keeps state of its own except the chunk cache, which `ground.ts` owns.

**The scene adapter.** `FieldRenderer` takes its stages as a list. A species or nest kind that needs its own drawer adds a stage, not a branch in `draw()`. (This is the roadmap's "read-only scene adapter", S5.3 item 3.)

## How each slice is proved

A move of drawing code must change no pixel, and nothing in the repo could say so until slice 1. Two proofs, in order of availability:

1. **The pixel guard** (`scripts/field-shots.mjs`, `npm run field-shots`, by hand in Chromium, about 90 s). `record <dir>` renders 18 fixed scenes of the one world's canvas and hashes each; `check <dir>` renders again and names the scenes that differ. The scenes are deterministic by construction: a fresh paused game of seed 3, stepped a fixed number of ticks through the dev hook, the canvas read once it has held still. A change to one draw call fails the scenes that draw it and only those.
   - **The protocol for a moving slice:** `record` on **current main** before the edit (a baseline is of that code, so a stale one proves nothing), make the move, `check` after it; all scenes must match. The baseline belongs to the machine and its Chromium (`check` refuses another one) and is never committed.
   - **A layer with no scene gets one first** (slice 4). A move of a layer no scene draws is not proved.
2. **The headless renderer test** (slice 9, `ja-fnd.6.3.9`). Once the layers are plain, `FieldRenderer` runs against a fake `CanvasRenderingContext2D` and a fake chunk-canvas factory that record every call and its arguments; the call log (or its hash) per scene is a golden in the unit tier. It runs in seconds with no browser and becomes the everyday proof; the Chromium guard then confirms rather than proves.

The input handlers (slice 11) are not drawing, so neither proof covers them: `npm run e2e` (pan and zoom, the follow carry, the pen, the builder, the lens) and unit tests on the controller are the proof there.

### What the scenes cover, and do not

The 18 scenes (seed 3 unless said): the generic ant's world above (10 s and 100 s of game time) and below; each nest zoomed above and below (the minimap shows); a followed ant on each layer; the queen's pen; the chamber labels; the dark scheme (above, a nest, below, a nest); the desert ant's noon, dusk and night (the heat and night washes).

Not seen yet (slice 4 adds them, each shown to fail on a mutant of its layer): aphid clumps, stalks and knots, the curtain's spores, hole bends and the strip's ants, pheromone trails, hyphae and cords on a well-grown fungus, ants by stance, a pinned specimen's ring, the builder's marks (sugar, walls, the clump, a moved ant's trace), the lens card's canvas marks, a phone-sized page. Mutants confirmed not caught today: spores read from the wrong layer, aphids drawn on both views, stalks read at layer 0.

## The slices

Each is its own small PR that **merges the day it opens**, with a fresh review, and the next starts from the new main. Order, because each needs the one before: the chain is set as dependencies in beads.

| # | bead | slice | proof |
|---|---|---|---|
| 1 | `ja-fnd.6.3.1` | **done (#282)**: the pixel guard, 18 scenes | records and checks agree; mutants caught |
| 2 | `ja-fnd.6.3.2` | **done (#285)**: the null-world path deleted | 18 scenes match |
| 3 | `ja-fnd.6.3.3` | the lens's own dead one-map path (`lens.ts`, `LensLayer.tsx`, `lens.test.ts`), and the comment nits carried from #282 and #285 | unit tier; 18 scenes match |
| 4 | `ja-fnd.6.3.4` | scenes for the layers above, no app code | each new scene fails on a mutant of its layer |
| 5 | `ja-fnd.6.3.5` | `FieldCtx` and the overlay layers out (`overlays.ts`) | all scenes match |
| 6 | `ja-fnd.6.3.6` | the fungus's drawing out (`fungus.ts`) | all scenes match |
| 7 | `ja-fnd.6.3.7` | the ground and the minimap out (`ground.ts`), the chunk canvases through a factory | all scenes match |
| 8 | `ja-fnd.6.3.8` | `draw()` as stages in a `FieldRenderer` | all scenes match |
| 9 | `ja-fnd.6.3.9` | the headless renderer test on a recording fake context | mutants of each layer change a log; under 10 s |
| 10 | `ja-fnd.6.3.10` | the canvas state made explicit per layer (below) | **pixels move on purpose**: named and shown |
| 11 | `ja-fnd.6.3.11` | the camera controller and the input hook out | e2e and controller unit tests |
| 12 | `ja-fnd.6.3.12` | `ColonyField.tsx` is a shell under about 300 lines; docs; the epic closes | acceptance above |

Slice 10 (the canvas state) sits after 8 and before 12; it can move earlier or later as the stages allow. The slice numbers are the beads' suffixes: slice N is `ja-fnd.6.3.N`.

## Risks and decisions

- **Churn.** `ColonyField` changed 35 times in two weeks; #276 (voxel sprites) added about 390 lines while slice 2 was in review. A slice that stays open a few days conflicts. Hence small slices, merged the day they open, a baseline recorded on the main each branched from, and a check of the open PRs that touch the file before starting one (`gh pr list`). Other sessions are not blocked: they add to the stages after the move as they added to the effect before it.
- **The canvas state leaks between frames.** `ColonyField` sets `lineJoin` and `lineWidth` in the chamber-label block and `lineCap` elsewhere and never resets them, so a stroke inherits what the previous frame left. Measured (review of #282): resetting `lineCap` to `butt` at the start of a frame changed 6 of 8 scenes, resetting every property together changed 16 of 18, and `lineJoin`/`lineWidth` alone changed none of the 8 (the labels' leak is real but the smaller one). It does not make a scene flaky (the pixels are read after five identical frames), and in play it is cosmetic (toggle the labels once and line joins change for the rest of the session). **The moves keep the state exactly as it is**, so they stay pixel-identical; slice 10 makes it explicit on purpose, and because it changes pixels it needs an owner decision first and a re-recorded baseline with the moved scenes named. Until then a scene that needs labels on goes last on its page.
- **The chunk canvases and the clock.** `paintChunk` makes `<canvas>` elements and the traces and the minimap read `performance.now()`. These are injected through `FieldCtx` (slice 7); without that the headless test cannot run in Node.
- **The e2e flakes.** Step 4 of `npm run e2e` ("follow an ant through a hole") fails about 5% of runs on main (`ja-18u`, measured 3 of 60 unloaded, 7 of 60 under CPU load), and step 14 ("notices") failed once in CI. A failure there alone is not a slice's; the rule is one re-run, then say so on the PR.
- **Sessions in the same file.** Check `gh pr list` for open PRs that touch `ColonyField.tsx`, `lens.ts` or `LensLayer.tsx` before each slice, and say in the PR which scene covers the layer moved.
- **Behaviour is not touched.** The colony is untouched by every slice, so the golden masters and the Jev cost are unchanged; each PR says "Jev cost: none".

## Log

| date | slice | PR |
|---|---|---|
| 2026-11-18 | 1: the pixel guard | #282 |
| 2026-11-18 | 2: the null-world path deleted | #285 |
