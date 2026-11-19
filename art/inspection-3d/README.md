# Rotatable voxel inspection, fungal structures and cadaver decay

The inspector uses actual mesh geometry from the approved lifecycle and resource Blender models. It opens directly overhead on the surface and straight onto the underground rear walking plane. Drag, arrow keys, Map view / Home and Angled view orbit an orthographic camera. All occupants and structures share one world scale. Tall stalks expand the whole frame only when they would otherwise leave it during rotation.

`InspectionScene.ts` batches actors in growing instance pools, caches terrain and content meshes, and shares the game render clock. Its models and Three.js load lazily. WebGL is preferred; `inspectionSoftware.ts` renders the same geometry using a depth buffer and cached static mesh layers when GPU rendering is unavailable. A failed model download keeps the fixed sprite fallback and exact cell details available. The cloud browser exercises software 3D; physical touch, Safari and hardware GPU rendering still need verification.

The software renderer reuses unchanged frames, comparing active instance transforms and colours rather than buffer upload counters. Motion, instance counts, visibility, camera changes and geometry updates invalidate the frame. Tests exercise 64 independent instances through movement, removal and restoration; this is a renderer stress case, not normal cell occupancy. A local CPU comparison with the production worker mesh at 4, 16 and 64 instances preserved identical moving-frame pixels while eliminating repeated idle rasterization; it does not establish hardware GPU or mobile frame rates.

## Cadavers and decay

The existing `colony.corpses` records continue to drive undertakers and loose-corpse removal. `colony.remains` is passive, saved visual history for surface deaths and recent midden deposits: it does not enter undertaking, scent, nutrition, fungus budgets or burial totals. Each record retains the original death timestamp; carrying or burial does not restart its age. History is pruned after `CORPSE_ROT` (900 simulation seconds), including colonies without queens. Older saves default to empty history.

| Age in simulation | Visual stage |
| --- | --- |
| 0–180 seconds | Fresh, original fallen-worker model |
| 180–450 seconds | Weathered brown, flatter body |
| 450–720 seconds | More flattened, antennae and outer leg parts gone |
| 720–900 seconds | A few separated chitin fragments |
| After 900 seconds | Removed by the existing loose-corpse lifetime; passive history is also pruned |

These are compressed game art timings, not a biological decomposition timetable. Pausing freezes decay; save/load preserves it. Carried corpses show their recorded stage without a duplicate ground body. Historical midden counts remain in the inspector and retain their gameplay function; they no longer create permanent exposed-body crosses on the map. Old saves cannot reconstruct the ages of already buried bodies.

Fungal corpse records aggregate resources by cell rather than retain individual cadaver identity. A currently recorded stalk with no visible body history gets one illustrative desiccated cadaver anchor, including legacy saves. This mark does not increment loose-corpse, recent-remains or burial counts. No fungus or colony records are created by rendering. A stalk emerges at the thorax of that body; its pale collar connects into the cuticle. The base pose is shared with both aerial atlases and mesh inspection.

## Fungal art

White/ivory filaments follow real parent and fusion links; kinks, side hairs and cord ridges are decorative. Knots are compact dark lobed resting bodies, with shoots only when `sprouted` is recorded. Recorded fruiting spots have low ivory stalklets and olive spore tufts. Colonised sites retain pale filaments, losing fertile tufts once free spores are spent.

Surface stalks use the actual Stalks upgrade: 1.8 / 2.8 world units high, narrow curved stems, and a rounded brown voxel cushion with raised pores on one side. The cushion stays compact as the stem grows taller. Its colours are independent of the olive conidial tufts. There are no underground mushroom caps or invented network connections.

References informing shape and material (the game intentionally combines fungal traits):

- [Araújo et al. (2018), Zombie-ant fungi across continents](https://pmc.ncbi.nlm.nih.gov/articles/PMC6002356/): *Ophiocordyceps* stalks with lateral fertile cushions; morphology varies across species.
- [Evans et al. (2011), Hidden diversity behind the zombie-ant fungus](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0017024): thoracic emergence, curved cylindrical stromata, brown disc-shaped to hemispherical fertile cushions and exposed pores.
- [Paixão et al. (2021), Metarhizium microsclerotia](https://www.frontiersin.org/journals/fungal-biology/articles/10.3389/ffunb.2021.654737/full): compact melanized hyphal survival structures. Their visible game size and voxel rind are artistic choices.
- [Australian National Botanic Gardens, Mycelium](https://www.anbg.gov.au/fungi/mycelium.html): bundled cords and fanning growth. Cords in this game's composite fungus remain artistic licence.

## Regeneration

From the repository root, with Blender 4.3, Python, NumPy and Pillow:

```sh
blender -b art/lifecycle/source/lifecycle.blend --python art/inspection-3d/source/export_models.py -- art/resources/source/resources.blend web/src/assets/inspection-3d/models.json
python3 art/inspection-3d/source/build_band_masks.py
python3 art/inspection-3d/source/build_cadaver_atlas.py
```

The exporter preserves exposed faces, separates live gaster bands, and creates the four fixed decay meshes. Dead bodies never receive colony odour tint. Abdomen masks project the same band geometry into the shipped worker and queen aerial atlases. Tiny worker masks supersample before reduction so a stripe survives all headings while preserving surrounding chitin and alpha. Cadaver map atlases use 12 / approximately 28 pixels per world unit, matching existing worker LODs.

`inspection-art-review.html` is a controlled seven-cell fixture with layer, decay-stage and stalk controls. It is not a recording of normal occupancy. Its regular-map table uses production drawing functions at 12, 20 and 28 CSS pixels per hex; narrow screens scroll the table rather than shrinking it. Pale and dark backgrounds use the map theme colours.

The aerial map draws ground fungal structures before bodies and raised stalks after actors, preserving the complete shared geometry while keeping fertile cushions visible above cadavers. Dark-ground living worker, queen and alate sprites receive a neutral highlight along the inside edge of their existing opaque pixels. Alpha, footprint and interior chitin remain unchanged; colony hue is still confined to the abdomen band.

## Close-map viewport prototype

`voxel-field-review.html` renders a live seeded game's visible region through `InspectionScene`, with pan, continuous wheel zoom, zoom buttons, keyboard navigation, layer switching and optional simulation playback. Its 480×300 raster is displayed larger for pixelated detail. Workers retain their actual positions and counts. The camera uses explicit pixels per world unit and a variable aspect ratio, so enlarging the viewport reveals more cells instead of stretching the seven-cell scene.

`inspectViewport` samples visible cells plus overscan, retains selected-cell details and leaf joins, and supports negative curtain columns. Terrain outside the seven-cell crop uses a world-anchored voxel grid so grain stays fixed when the camera crosses cell boundaries. Palette RGB syntax is normalized before Three.js parses trail and chamber colours.

Viewport terrain uses cached 3×3-world-unit chunks, a size shared exactly by the surface and underground voxel grids. Each chunk samples a halo to suppress hidden faces across borders and emits only faces owned by that chunk. Signatures include neighbouring ground and projected strip state; actor or food changes do not rebuild terrain. Nearby pans, selected-cell changes and zoom round trips reuse meshes. The cache retains 64 warm chunks, releases unused distant geometry, and always keeps every visible chunk even when the active view exceeds that budget. The review page reports active, rebuilt and cached counts.

The mesher stores each column's solid depth interval in typed arrays instead of allocating string keys for buried voxels. Regression fixtures retain exactly the previous face positions, grain, order and normals. Seam tests compare assembled chunk geometry against a whole-region build above and below ground. One local CPU sample reduced a cold chunk build from roughly 2.6 seconds to 0.4 seconds; this excludes model loading, GPU uploads and final rendering, and is not a device frame-rate claim.

This remains a separate development entry point; the main map now also uses the shared renderer as described below. The inspector still uses seven cells. Cell details are sampled individually, and cold geometry or first-time software rasterization can still block briefly. Shared spatial sampling and hardware GPU/device verification remain relevant to performance work.

## Main-map zoom and distant tile reuse

The camera reaches 180 CSS pixels per world unit with the same limit at DPR 1 and 2. `MapVoxelPass` loads the scene only when approaching close zoom. WebGL blends from aerial sprites into voxel geometry between 48 and 72 CSS pixels per world unit. The software compatibility path blends later, between 120 and 144, to avoid rasterizing a large region on the CPU. Zooming out stops viewport sampling and voxel rendering. Model or rendering failure keeps the sprite map usable.

The pass shares the map camera, actual actors, terrain chunks and colony bands. The existing minimap, follow rings, labels, inspection magnifier, traces, controls and input canvas remain on top. The scene's centre-cell highlight is disabled on the main map. Chamber floors retain role colours. Alates keep their existing body/wing atlas on top until their separate wings are included in the shared mesh. The projected surface strip and builder smell vision retain the 2D path so their special actors and visibility rules remain available. The half-CSS-resolution voxel pass is enlarged without smoothing.

`MapChunkPaintCache` compares exact byte snapshots of each colour tile's inputs before repainting it. Changes to terrain, food, quality, spoil, chambers, spores, trails, alarm, sensed timestamps or display settings invalidate immediately, including direct writes to typed arrays. Scent fade time participates where relevant; themes clear the cache. The projected ground-strip tiles still repaint from their live plane dependencies. Ants and cargo continue drawing every frame. DEV canvas attributes report tile hits, paints, map representation and draw time. In one live distant view, 47 of 48 colour tiles were reused and the field draw took about 7 ms; this is a rendering sample, not a whole-game frame-rate or mobile claim.
