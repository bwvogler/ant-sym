import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOneWorld } from "../../colony/oneWorld.ts";
import { isOneWorldPreview, parseSeed, previewSeed, stillLife, withSeed } from "../oneWorldView.ts";

test("the preview opens on ?world=one only, with the seed from the query or 1", () => {
  assert.equal(isOneWorldPreview("?world=one"), true);
  assert.equal(isOneWorldPreview("?seed=3&world=one"), true);
  assert.equal(isOneWorldPreview(""), false);
  assert.equal(isOneWorldPreview("?world=side"), false);
  assert.equal(previewSeed("?world=one&seed=4"), 4);
  assert.equal(previewSeed("?world=one"), 1);
  assert.equal(previewSeed("?world=one&seed=-2"), 1);
  assert.equal(previewSeed("?world=one&seed=x"), 1);
  assert.equal(previewSeed("?world=one&seed="), 1);
  assert.equal(parseSeed("7"), 7);
  assert.equal(parseSeed("4294967295"), 4294967295);
  // Past 32 bits a seed would wrap to a smaller one's world (4294967297 draws seed 1's), so it isn't one.
  for (const bad of ["", " ", "0", "1.5", "-3", "x", "4294967296", "4294967297", "1e21", null]) assert.equal(parseSeed(bad), null, `${bad}`);
  // The seed goes back into the query, so a reload or a shared link opens the same world.
  assert.equal(withSeed("?world=one", 7), "?world=one&seed=7");
  assert.equal(withSeed("?world=one&seed=2", 9), "?world=one&seed=9");
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
  // Each colony smells as the game starts it, so the renderer draws Ink's and Amber's nests apart.
  assert.deepEqual(stillLife(w.curtain).colonies.map((c) => c.nestOdour), [0, 1]);
  // With more nests (a grown line), the odours spread so each is drawn apart.
  const grown = { ...w.curtain, nests: [...w.curtain.nests, w.curtain.nests[0]!] };
  assert.deepEqual(stillLife(grown).colonies.map((c) => c.nestOdour), [0, 0.5, 1]);
});
