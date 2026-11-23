// Matched generated nests with a fixed chamber-sensitive trail doctrine and a legacy control.
// Usage, from the repository root: node scripts/fungus-floor-marks.mjs [--recovery] [seed ...]
import assert from "node:assert/strict";
import {
  CELL,
  CURTAIN,
  PLANE,
  STRAINS,
  Game,
  cellOf,
  centreX,
  centreY,
  dropFood,
  encodeLevels,
  gameRng,
  generateOneWorld,
  localResponses,
  rockAt,
  OPEN,
} from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const dt = 1 / 30;
const workers = 96;
const seconds = 150;
const garden = STRAINS.findIndex((strain) => strain.id === "garden");

function run(seed, damp, contextual, recover = false) {
  const world = generateOneWorld(seed, { plane: { size: { w: 120, h: 80 } } });
  const game = new Game(world, {}, gameRng(seed), [{ antCount: workers }]);
  const colony = game.colonies[0];
  colony.params.dropRefusalLimit = recover ? 2 : 0;
  const queen = colony.queen;
  const nest = world.plane.nests[0];
  cellOf(nest.x, nest.y);
  const [nx, ny] = CELL;
  // Add two equal, labeled patches to the generated map. Preserve its other food and geometry.
  const sources = [new Set(), new Set()];
  for (const [side, direction] of [-1, 1].entries()) {
    const target = nx + 12 * direction;
    const candidates = [];
    for (let y = ny - 12; y <= ny + 12; y++) {
      for (let x = target - 7; x <= target + 7; x++) {
        if (rockAt(world.plane, x, y) === OPEN) candidates.push([x, y, (x - target) ** 2 + (y - ny) ** 2]);
      }
    }
    candidates.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of candidates.slice(0, 7)) {
      sources[side].add(y * world.plane.size.w + x);
      dropFood(world.plane, centreX(x, y), centreY(y), 100);
    }
    assert.equal(sources[side].size, 7);
  }

  game.fungus.menu = ["marks"];
  const response = encodeLevels({ marks: damp ? 0 : 2 }, ["marks"]);
  const neutral = encodeLevels({}, ["marks"]);
  game.fungus.bindPolicy("fungus", (s) => (s.task !== "queen" ? response : neutral));
  // Keep the initially exposed cohort fixed between runs. Spread and grooming run normally afterward.
  game.fungus.paint([colony], queen.x, queen.y, 3, 0, 0.95, garden, CURTAIN);
  // Hold exposure fixed so clean workers remain available and the dose still masks marks on arrival.
  game.fungus.strains[garden].transmission = 0;
  game.fungus.strains[garden].decay = 0;
  game.fungus.params.grooming = 0;
  const initialHosts = game.fungus.hosts;
  assert.ok(initialHosts > 0);

  let ant = -1;
  const draw = colony.antDraw.bind(colony);
  colony.antDraw = (i) => {
    ant = i;
    return draw(i);
  };
  const offered = new Map();
  const clean = [new Set(), new Set()];
  const counts = [0, 0];
  const trips = new Map();
  const metrics = {
    initialHosts,
    chamberDecisions: 0,
    tunnelDecisions: 0,
    foodTrailDecisions: 0,
    suppressedDecisions: 0,
    undergroundFoodTrail: 0,
    chamberDrops: 0,
    refusedDrops: 0,
    surfacePickups: 0,
    repeatSurfacePickups: 0,
  };
  colony.responses = {
    ...localResponses,
    get(t, random) {
      const take = localResponses.get(t, random);
      if (take && t.offered === "food" && colony.layer[ant] === PLANE) {
        cellOf(colony.x[ant], colony.y[ant]);
        const cell = CELL[1] * world.plane.size.w + CELL[0];
        offered.set(ant, { side: sources.findIndex((source) => source.has(cell)), clean: colony.load[ant] === 0 });
      }
      return take;
    },
    drop(t, random) {
      if (t.carrying !== "food" || t.porter || colony.layer[ant] !== CURTAIN) return localResponses.drop(t, random);
      const recognized = t.place === "chamber";
      if (colony.load[ant] > 0) {
        if (recognized) metrics.chamberDrops++;
        else if (contextual) metrics.refusedDrops++;
      }
      return !contextual || recognized;
    },
    trail(t, random) {
      const legacy = localResponses.trail(t, random);
      const underground = legacy === "food" && (t.place === "chamber" || t.place === "tunnel");
      const answer = contextual && underground && t.place === "tunnel" ? "none" : legacy;
      if (underground && colony.load[ant] > 0) {
        if (t.place === "chamber") metrics.chamberDecisions++;
        else metrics.tunnelDecisions++;
        if (answer === "food") metrics.foodTrailDecisions++;
        else metrics.suppressedDecisions++;
      }
      return answer;
    },
  };
  colony.bind(CURTAIN);
  const curtainPheromones = colony.ph;
  const deposit = curtainPheromones.depositCell.bind(curtainPheromones);
  curtainPheromones.depositCell = (channel, x, y, amount) => {
    if (channel === "food") metrics.undergroundFoodTrail += amount;
    deposit(channel, x, y, amount);
  };

  for (let tick = 0; tick < seconds / dt; tick++) {
    game.tick(dt);
    for (const [i, pickup] of offered) {
      if (!colony.carrying[i]) continue;
      metrics.surfacePickups++;
      const previous = trips.get(i) ?? 0;
      if (previous > 0) metrics.repeatSurfacePickups++;
      trips.set(i, previous + 1);
      if (pickup.side < 0) continue;
      counts[pickup.side]++;
      if (pickup.clean) clean[pickup.side].add(i);
    }
    offered.clear();
  }

  return {
    ...metrics,
    counts,
    clean: clean.map((ids) => ids.size),
    stored: colony.stored,
    held: colony.carrying.reduce((n, load) => n + load, 0),
  };
}

const args = process.argv.slice(2);
const recover = args.includes("--recovery");
const seeds = args.filter((arg) => arg !== "--recovery").map(Number);
for (const seed of seeds.length ? seeds : [21, 22, 23, 24, 25, 26]) {
  const legacy = [run(seed, false, false), run(seed, true, false)];
  const contextual = [run(seed, false, true), run(seed, true, true)];
  assert.ok([...legacy, ...contextual].every(({ initialHosts }) => initialHosts === legacy[0].initialHosts));
  console.log(JSON.stringify({ seed, legacy, contextual, ...(recover ? { recovery: run(seed, true, true, true) } : {}) }));
}
