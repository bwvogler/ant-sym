# Underground inspection: first cutaway studies

These three deliberately constructed fixtures explore the direction in `art/inspection/below-design.md`. They remain composed art studies. The live implementation now uses the same seven-cell framing and recessed section; see `art/inspection/README.md` and `art/inspection-live/README.md` for its separate runtime renderer and limitations.

The curtain is shown vertically: columns run across the image, depth runs downward. Each revised design includes exactly seven cells: the selected hex at the centre (thin teal edge), plus its six immediate neighbours. There is no surrounding rectangular cast of extra terrain. Hex width remains 1 world unit and the approved worker body length remains 0.885. A queen can extend across neighbouring open cells without enlarging a hex. The same camera and scale are used across all three studies.

| Study | Design purpose |
| --- | --- |
| Narrow passage | Joined, one-cell-wide excavated space; a worker climbs its wall carrying soil. |
| Chamber floor | Connected empty space spanning neighbouring cells; queen, brood and worker sit against the soil floor. |
| Digging face | A passage ends at undug soil, with a distinct grey rock inclusion. |

The selected hex is a spatial reference, not a bowl or an independent room. Connected open cells are carved into one continuous void. Voxel contours follow pointy-top odd-r cell membership. The revised back surface is recessed 1.08 units behind the front cut, within a 1.20-unit-thick section. Ants are placed 0.48 units into the opening, leaving room for their front and rear legs inside the recess. Their models are not shrunk. This depth remains illustrative: no front-to-back tunnel connections or volumetric tunnel simulation are implied. Openings at the edge of the seven-cell window are cropped continuations, not fabricated end walls. The set contains no invented roots, plants, chambers, or supports. Body placement is composed for the study, not extracted from a running game.

The queen, worker and brood reuse existing editable models. The live version now reads actual neighbours and depicts the surface strip as a boundary. It places occupants against the illustrative rear cut plane rather than automatically recreating these floor-standing poses. Chamber stores and interactive camera behavior remain outside this implementation.

## Editable source and regeneration

`source/below-studies.blend` opens the digging-face variant with the other terrain variants hidden. The script rebuilds all three compositions, including their model placements. `studies.json` records each fixture's open/rock cell sets and scale.

From the repository root, using Blender 4.3:

```sh
blender -b art/inspection/source/worker-base.blend --python art/below-studies/source/build_studies.py -- "$PWD/art/below-studies/build" "$PWD/art/lifecycle/source/lifecycle.blend" "$PWD/art/resources/source/resources.blend"
cp -f art/below-studies/build/below-studies.blend art/below-studies/source/below-studies.blend
cp -f art/below-studies/build/studies.json art/below-studies/studies.json
```

The output consists of three 768 × 640 CPU Cycles renders at a fixed orthographic scale. The delivered studies have been visually inspected for framing, connected openings, cell scale, and model placement. They are not a browser-performance check.
