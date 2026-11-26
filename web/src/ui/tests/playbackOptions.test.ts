import assert from "node:assert/strict";
import test from "node:test";
import { antsFromUrl, mapPixelRatioCap } from "../playbackOptions.ts";

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
