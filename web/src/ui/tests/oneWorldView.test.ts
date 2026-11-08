import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOneWorld } from "../../colony/oneWorld.ts";
import { isOneWorldPreview, previewSeed, stillLife } from "../oneWorldView.ts";

test("the preview opens on ?world=one only, with the seed from the query or 1", () => {
  assert.equal(isOneWorldPreview("?world=one"), true);
  assert.equal(isOneWorldPreview("?seed=3&world=one"), true);
  assert.equal(isOneWorldPreview(""), false);
  assert.equal(isOneWorldPreview("?world=side"), false);
  assert.equal(previewSeed("?world=one&seed=4"), 4);
  assert.equal(previewSeed("?world=one"), 1);
  assert.equal(previewSeed("?world=one&seed=-2"), 1);
  assert.equal(previewSeed("?world=one&seed=x"), 1);
});

test("stillLife: a colony of no ants per nest on each layer, so both maps draw with nothing running", () => {
  const w = generateOneWorld(1);
  for (const map of [w.plane, w.curtain]) {
    const { colonies, fungus } = stillLife(map);
    assert.equal(colonies.length, map.nests.length);
    colonies.forEach((c, k) => {
      assert.equal(c.population, 0);
      assert.equal(c.nest, map.nests[k]);
    });
    assert.ok(fungus);
  }
  // Below ground each nest has its royal chamber, so its queen is drawn there; above, there is none (the open map's).
  assert.ok(stillLife(w.curtain).colonies.every((c) => c.queen !== null));
  assert.ok(stillLife(w.plane).colonies.every((c) => c.queen === null));
});
