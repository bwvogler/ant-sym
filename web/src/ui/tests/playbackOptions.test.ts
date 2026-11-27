import assert from "node:assert/strict";
import test from "node:test";
import { antsFromUrl, mapPixelRatioCap, paceFromUrl, profileFromUrl, trailVariantFromUrl } from "../playbackOptions.ts";

test("a fresh game's URL can select an ant count within the Lab's supported range", () => {
  assert.equal(antsFromUrl(""), 600);
  assert.equal(antsFromUrl("?ants=300"), 300);
  for (const search of ["?ants=none", "?ants=300.5", "?ants=99", "?ants=2001"]) {
    assert.equal(antsFromUrl(search), 600);
  }
});

test("map pixel ratio is capped at one only when explicitly requested", () => {
  assert.equal(mapPixelRatioCap(""), 2);
  assert.equal(mapPixelRatioCap("?dpr=1"), 1);
  assert.equal(mapPixelRatioCap("?dpr=0"), 2);
});

test("pace comparisons default to the optimized path and disable detailed profiling", () => {
  assert.equal(trailVariantFromUrl(""), "optimized");
  assert.equal(trailVariantFromUrl("?trail=baseline"), "baseline");
  assert.equal(trailVariantFromUrl("?trail=optimized"), "optimized");
  assert.equal(paceFromUrl("?pace=1"), true);
  assert.equal(paceFromUrl(""), false);
  assert.equal(profileFromUrl("?profile=1&pace=1"), false);
  assert.equal(profileFromUrl("?profile=1"), true);
});
