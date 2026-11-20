// Paired colony assay. Run from the repository root: node scripts/fungus-recruitment.mjs
import assert from "node:assert/strict";
import { Arena, at, oneArena } from "../web/src/colony/harness.ts";
import { CELL, CountGrid, CURTAIN, Game, PLANE, STRAINS, cellOf, encodeLevels, gameRng, occupancy } from "../web/src/colony/index.ts";

const workers = 96;
const pioneers = 8;
const strain = STRAINS.findIndex((entry) => entry.id === "garden");
const seconds = 90;
const dt = 1 / 30;
const nest = at(40, 25);
const patches = [at(25, 25), at(55, 25)];
const radius = 3;

function run(seed, marked, trail) {
  const arena = new Arena(81, 51, true).pile(25, 25, radius, 100).pile(55, 25, radius, 100);
  const world = oneArena(arena.build([{ x: 40, y: 25, r: 2 }]), seed);
  const game = new Game(world, { antCount: workers, rival: false }, gameRng(seed));
  const colony = game.player;
  game.fungus.menu = ["trail"];
  const baseline = encodeLevels({}, ["trail"]);
  const answer = encodeLevels({ trail }, ["trail"]);
  game.fungus.bindPolicy("fungus", (s) => (s.carrying === "food" ? answer : baseline));

  for (let i = 0; i < workers; i++) {
    const side = i < pioneers ? 0 : 1;
    const pioneer = i < pioneers * 2;
    const position = pioneer ? patches[side] : nest;
    colony.putAnt(i, PLANE, position.x, position.y);
    if (pioneer) {
      colony.heading[i] = side === 0 ? 0 : Math.PI;
    }
  }

  // Inoculate only the pioneers at the marked patch before the first tick.
  game.fungus.paint([colony], patches[marked].x, patches[marked].y, 1, 0, 0.95, strain, PLANE);
  game.fungus.stepLayers(
    [colony],
    [PLANE, CURTAIN].map((layer) => [occupancy(colony, new CountGrid(), layer)]),
    dt,
  );

  const collected = [0, 0];
  const recruits = [new Set(), new Set()];
  const clean = [new Set(), new Set()];
  const carrying = new Uint8Array(workers);
  const sourceCells = new Map();
  for (let y = 0; y < arena.size.h; y++) {
    for (let x = 0; x < arena.size.w; x++) {
      if (arena.food[y * arena.size.w + x] > 0) {
        sourceCells.set(y * arena.size.w + x, x < 40 ? 0 : 1);
      }
    }
  }
  assert.equal([...sourceCells.values()].filter((side) => side === 0).length, sourceCells.size / 2);
  assert.equal(game.fungus.hosts, pioneers);
  let maxGain = 0;
  for (let tick = 0; tick < seconds / dt; tick++) {
    game.tick(dt);
    for (let i = 0; i < workers; i++) {
      if (colony.carrying[i] && !carrying[i] && colony.layer[i] === PLANE) {
        cellOf(colony.x[i], colony.y[i]);
        const side = sourceCells.get(CELL[1] * arena.size.w + CELL[0]);
        if (side !== undefined) {
          collected[side]++;
          if (i >= pioneers * 2) recruits[side].add(i);
          if (i >= pioneers * 2 && colony.load[i] === 0) clean[side].add(i);
        }
      }
      carrying[i] = colony.carrying[i];
      if (i < pioneers * 2 && colony.load[i] > 0) maxGain = Math.max(maxGain, colony.layGain[i]);
    }
  }
  assert.ok(trail === 2 ? maxGain === 1 : maxGain > 1, "the trail treatment must reach its hosts");
  return {
    marked: collected[marked],
    other: collected[1 - marked],
    stored: colony.stored,
    recruitsMarked: recruits[marked].size,
    recruitsOther: recruits[1 - marked].size,
    cleanMarked: clean[marked].size,
    cleanOther: clean[1 - marked].size,
    maxGain,
  };
}

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3, 4, 5, 6]) {
  for (const marked of [0, 1]) {
    console.log(JSON.stringify({ seed, marked, baseline: run(seed, marked, 2), boost: run(seed, marked, 4) }));
  }
}
