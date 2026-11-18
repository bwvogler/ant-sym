# Queen, brood, and fallen-worker inspection models

`source/lifecycle.blend` is an editable Blender 4.3 source. The queen is visible on opening; other named objects are hidden for render, and can be enabled to edit a stage or fallen pose. Worker and terrain sources remain at `art/inspection/`.

The six exported frames are queen, fallen worker, egg, larva, pupa, and fallen queen. They share the base inspection camera orientation, lighting, and world scale. To avoid clipping the larger queen's antennae, lifecycle frames cover 2.25 world units at 384 pixels, preserving the base atlas's pixels per world unit (1.5 units at 256 pixels). The separate atlas is 1158 × 772, with three 386-pixel slots per row, a 384-pixel source frame, and one pixel of padding. The manifest owns its layout, ground anchor, and dimensions. Runtime scaling uses both manifests so additional frame space does not shrink a model.

The queen is an artistic caste treatment: the worker model enlarged 1.18× with a wider, longer gaster. Brood body lengths are approximately 0.15, 0.30, and 0.42 hex widths for egg, larva, and pupa. Fallen poses retain the body's length and roll it onto its side. These are visual proportions, not new simulation parameters or species-specific biological measurements. Queen and fallen-body headings are illustrative because the game stores no heading for them.

## State conventions

Live workers and queens retain their recorded positions. Queens appear only on their colony's home layer, and their alive and infection states are respected. A dead queen uses a fallen pose with a cross.

Loose brood and fallen workers have cell coordinates, but no positions within a hex. The view groups floor brood into one icon per present stage and fallen workers into one body icon; the sidebar lists exact counts. No individual positions are invented. Held brood follows its live carrier, is shown at the jaws with its recorded stage, and is excluded from loose-brood counts. A carrier can take brood across layers. Carried corpses and soil also receive distinct cargo shapes. Buried midden counts are separate from exposed bodies; buried ants are not drawn as if lying on the surface.

The second atlas may load independently: the original terrain/worker scene stays available, and exact counts remain readable if either image fails. This pass does not add alates or chamber-store contents.

## Regeneration

From the repository root, with Blender 4.3 and Python/Pillow:

```sh
blender -b art/inspection/source/worker-base.blend --python art/lifecycle/source/build_lifecycle.py -- "$PWD/art/lifecycle/build"
python art/lifecycle/source/pack_lifecycle.py art/lifecycle/build
cp -f art/lifecycle/build/assets/inspection-lifecycle.png web/src/assets/inspection/inspection-lifecycle.png
cp -f art/lifecycle/build/assets/lifecycle-manifest.json web/src/assets/inspection/lifecycle-manifest.json
cp -f art/lifecycle/build/source/lifecycle.blend art/lifecycle/source/lifecycle.blend
```

Unit tests cover queen placement and layers, loose and held brood without duplication, corpse layer defaults, separate midden counts, grouped rendering, and preservation of state. Native previews exercise the live drawing code. Browser interaction and performance remain unverified here.
