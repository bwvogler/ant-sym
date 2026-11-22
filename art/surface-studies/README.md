# Seven-cell surface inspection studies

These are the surface counterpart to the accepted underground seven-cell cutaway direction. Each design includes exactly the selected hex and its six immediate neighbours, at hex width = 1 world unit. The ground is one continuous voxel mesh with internal faces removed, not seven raised platforms. Only the centre hex has a teal selection outline.

The three composed fixtures show foraging traffic, food beside an aphid patch, and fungal growth. Worker, food and aphid geometry comes from the approved source models and retains its physical proportions; nothing is resized to fill the larger framing. The fungus is represented by mycelium and spore marks, rather than invented plants. These are design fixtures, not captured gameplay, simulated traffic, or a performance benchmark.

The seven-cell footprint matches the below studies, while the camera remains oblique above ground. In the intended interface, the selected-cell sidebar continues to count only the centre hex; neighbouring occupants and terrain supply context. Smooth movement can cross the shared cell boundaries without changing the inspection's spatial unit.

## Sources and regeneration

`source/surface-seven-cells.blend` opens the food-and-aphid composition. The other composed objects are retained but hidden for render; the script regenerates all three studies with their placements. `studies.json` records the cell footprint and scale.

From the repository root, using Blender 4.3:

```sh
blender -b art/inspection/source/worker-base.blend --python art/surface-studies/source/build_studies.py -- "$PWD/art/surface-studies/build" "$PWD/art/resources/source/resources.blend"
cp -f art/surface-studies/build/surface-seven-cells.blend art/surface-studies/source/surface-seven-cells.blend
cp -f art/surface-studies/build/studies.json art/surface-studies/studies.json
```

The study renderer exports three 768 × 640 images at one fixed camera and world scale. The live inspection now follows the seven-cell footprint with actual neighbourhood extraction, centre-only counts, continuous shared terrain, and a dedicated below cutaway. See `art/inspection/README.md` for live behavior and validation limits. These Blender compositions remain design fixtures, not live captures.
