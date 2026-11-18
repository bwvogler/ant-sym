# Rotatable voxel inspection, fungal structures and cadaver decay

The inspector uses actual mesh geometry from the approved lifecycle and resource Blender models. It opens directly overhead on the surface and straight onto the underground rear walking plane. Drag, arrow keys, Map view / Home and Angled view orbit an orthographic camera. All occupants and structures share one world scale. Tall stalks expand the whole frame only when they would otherwise leave it during rotation.

`InspectionScene.ts` batches actors in growing instance pools, caches terrain and content meshes, and shares the game render clock. Its models and Three.js load lazily. WebGL is preferred; `inspectionSoftware.ts` renders the same geometry using a depth buffer and cached static mesh layers when GPU rendering is unavailable. A failed model download keeps the fixed sprite fallback and exact cell details available. The cloud browser exercises software 3D; physical touch, Safari and hardware GPU rendering still need verification.

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
