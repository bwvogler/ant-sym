# Food and aphid voxel sources

`source/resources.blend` is an editable Blender 4.3 scene. The aphid collection is visible initially; toggle the three food collections to edit those forms. The model uses the worker v2's warm key/rim and cool fill lighting. The generator is standalone and needs no worker source file.

Physical calibration uses hex width = 1 world unit. The worker body is 0.885 units long; the aphid body is 0.300 (0.360 including its antennae); food pieces are 0.240 units long. These are visual design choices. Population and food amounts never enlarge an individual sprite.

From the repository root, with Blender 4.3 and Python/Pillow installed:

```sh
blender -b --python art/resources/source/build_resources.py -- "$PWD/art/resources/build"
python art/resources/source/pack_resources.py art/resources/build
blender -b art/resources/build/source/resources.blend --python art/resources/source/finalize_model.py -- "$PWD/art/resources/build"
cp -f art/resources/build/assets/resource-tiny.png web/src/assets/resources/resource-tiny.png
cp -f art/resources/build/assets/resource-near.png web/src/assets/resources/resource-near.png
cp -f art/resources/build/source/resources.blend art/resources/source/resources.blend
```

The generator exports three food classes and four static aphid headings at 6, 14, and 128 pixels over a 0.5-world-unit frame. Packing produces a seven-column atlas with one transparent pixel of padding around each frame and binary alpha. The 6-pixel frame is native at 12 px/hex; the 14-pixel frame is native at 28 px/hex. Normal runtime camera transforms handle display pixel density.

These are small voxel/pixel glyphs. The smallest aphids cannot show anatomical detail; their body proportions and green colour distinguish them. No new plants or leaf-size assumptions were introduced. The model is separate from the inspection tile, which has not been modified in this pass.
