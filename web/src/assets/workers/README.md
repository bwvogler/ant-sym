# Aerial worker sprites

These atlases come from the editable v2 voxel worker and its eight-pose walk in the design pack `ant-sym-walking-worker-and-real-traffic.zip`.

| Atlas | Dimensions | Frame | Padding | Layout | World frame size |
| --- | --- | --- | --- | --- | --- |
| `tiny-idle.png` | 264 × 22 | 20 × 20 | 1 px each side | 12 headings, one static pose | 20/12 units |
| `map-walk.png` | 528 × 352 | 42 × 42 | 1 px each side | 12 heading columns, 8 pose rows | 1.5 units |

Heading 0 faces right; columns turn clockwise by 30 degrees in screen coordinates. Transparent frame padding is part of the world-size calculation; do not scale frames to the hex width. The body remains about 0.885 world units long. Both atlases use nearest-neighbour sampling.

`ui/workerSprites.ts` defines the source rectangles, theme/odour recolouring, asset loading, and distance-driven visual gait. One cycle covers approximately 0.2333 world units. Sprite shading and alpha are retained when tinting to the existing odour bands. Tinted canvases are cached and cleared when the theme changes.

Sprites apply to both surface maps and the front-facing underground back wall at hex zoom (12 CSS px/hex and up); the tiny atlas remains static until 14 CSS px/hex. The existing backing-pixel zoom cap is unchanged, so the walk atlas is used at maximum zoom on DPR 2 displays. The same body:hex proportions, actual continuous positions, odour bands, and gait apply on both layers. Distant map marks, infection marks, selection, follow behavior, trail visibility, and simulation state retain their existing paths. Underground carried food now uses the same resource sprite path as above. The projected surface strip remains a separate diagrammatic ink representation of the actual plane ants over the transect; it is not an underground population. Queens, loose brood and loose corpses use the separate regular-map nest atlas described in `art/map-nest/README.md`. Alates use a queen-derived voxel body with separate pale wings. Buried midden counts retain their existing map symbols. Reduced-motion mode uses pose 0. Missing, invalid, or undecodable images fall back to the existing odour-coloured ink marks.

To regenerate the images, unpack the design pack, render with Blender 4.3 using `source/animate_worker.py`, then run `source/pack_walk.py`; copy the two resulting files from `assets/` here. Inspection frames remain separate from the aerial atlases.
