# Live seven-cell underground inspection

The runtime uses `web/src/ui/inspectionPatch.ts` and `drawInspectionPatch.ts`. Actual terrain forms a seven-cell cutaway; solid soil and rock occlude sprites at the front, while connected open cells share a recessed back. The selected cell alone supplies sidebar counts. Every living worker in valid cells is retained, with continuous position and heading, without a drawing capacity cap. Terrain canvases are cached independently of occupant movement.

The below atlas reuses the approved worker, lifecycle, and food models. Feet contact the illustrative rear cut plane at depth 1.08, inside a 1.20-unit section. This wall-crawling interpretation preserves continuous two-dimensional game positions. It does not reconstruct floor-standing poses or volumetric tunnel movement. Workers have twelve headings and static leg poses. Dense bodies can overlap; occlusion is layered rather than a full 3D intersection calculation. Aphids remain above ground.

Back-wall placement is the accepted live underground presentation. Floor-standing pose reconstruction is not required.

## Inspection overlays

Independent **Scents** and **Location markers** checkboxes affect the inspector only. They redraw immediately, including while paused, without reloading atlases or rebuilding terrain. Scent washes sit beneath occupants; shapes distinguish home (dashes), food (dots), and alarm (crosses). These are scalar cell strengths, not directional arrows or inferred paths. They use the existing host-sensed visibility, fading, thresholds, and global food/home settings. Home uses the map's shared warm palette; alarm uses its light-map amber. The main map retains its existing theme colors and trail settings.

Recorded entrances receive dashed rings and chamber cells receive diamonds in the shared role palette. These marks remain readable over the cutaway; hiding them preserves the physical hole, terrain, occupants, and centre-cell outline. Location and sensed-strength text is scoped to the selected cell. The legend remains available when the corresponding overlay is enabled. No new simulation markers, waypoints, or pheromone directions are inferred.

From the repository root, with Blender 4.3 and Pillow:

```sh
blender -b art/inspection/source/worker-base.blend --python art/inspection-live/source/build_below_atlas.py -- "$PWD/art/inspection-live/build" "$PWD/art/lifecycle/source/lifecycle.blend" "$PWD/art/resources/source/resources.blend"
python art/inspection-live/source/pack_below_atlas.py art/inspection-live/build
cp -f art/inspection-live/build/below-atlas.png web/src/assets/inspection/below-atlas.png
cp -f art/inspection-live/build/below-manifest.json web/src/assets/inspection/below-manifest.json
```

The 21-frame atlas is 2316 × 1544, with 384-pixel frames and transparent gutters. The manifest exports the exact camera anchor and basis. PNG and manifest must be updated together. Asset failures retain the selected-cell text details.

Unit checks cover seven-cell membership, centre counts, movement across cell edges, negative columns, world bounds, strip projection, recessed geometry, terrain orientation, unabridged worker drawing, cache invalidation, and read-only extraction. Native Canvas previews use real game state and the runtime drawing code. They do not verify browser focus, interaction, or browser frame rate. Browser guards are present but were not run in this environment.
