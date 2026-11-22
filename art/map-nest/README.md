# Regular-map nest sprites and terrain grain

The queen, dead queen, loose worker corpse, eggs, larvae, and pupae are rendered straight onto their walking plane from the approved lifecycle models. This is aerial above ground and front-facing against the underground back wall. No inspection camera perspective is reused. Both regular-map LODs use a 2.25-world-unit frame, with the original model dimensions; the wingless queen is larger than a worker, with the elongated abdomen shared by the inspection model, and brood remains physically small. There is no minimum-size inflation at hex zoom.

The living queen retains the colony odour colour. Dead bodies and brood keep their own materials. Loose brood and corpses retain the existing membership and positions, including overlap when multiple items occupy one cell. Missing or invalid images and distant brick zoom retain the previous symbols. Chamber food retains its previous bounded illustrative placement, with fixed-size food sprites instead of squares. Buried midden counts retain their existing symbols. Winged virgin queens use a queen-derived body at 90% of queen scale and a separate layer of pale voxel wings. Their simulation has no heading field, so the fixed map orientation is retained. Only their body receives colony odour tint. Held brood uses the actual item stage and follows a living carrier on its current layer; held corpses and soil use the same physical-size sprites as their other representations.

`mapTerrain.ts` adds sparse, deterministic grain at hex zoom in two batched paths. Sky receives no grain. Open cells with a colour overlay are skipped, preserving trails, spores and chamber washes. The grain follows world cells as the camera moves and works on negative curtain columns. It depicts material texture, not additional simulation geometry or independent raised platforms.

Regenerate from the repository root with Blender 4.3 and Pillow:

```sh
blender -b art/lifecycle/source/lifecycle.blend --python art/map-nest/source/render_map_nest.py -- "$PWD/art/map-nest/build"
python art/map-nest/source/pack_map_nest.py art/map-nest/build
cp -f art/map-nest/build/nest-tiny.png web/src/assets/nest/
cp -f art/map-nest/build/nest-walk.png web/src/assets/nest/
cp -f art/map-nest/build/manifest.json web/src/assets/nest/
```

The tiny sheet is 232 × 29 (27-pixel frames), and the near sheet is 528 × 66 (64-pixel frames), with one-pixel transparent gutters. The same world scale applies to DPR 1 and 2; CSS hex size chooses the LOD. Tests cover dimensions, padding, scaling, failure/disposal, and stable grain inside the cell. Browser viewport review checks layout and assets in Chromium, not physical touch, Safari, or frame-rate guarantees.
