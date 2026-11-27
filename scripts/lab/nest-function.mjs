// Paired, offline one-world nest assay. All workers move and work under normal game ticks.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { backfillObservers } from "../../web/src/colony/backfillObservation.ts";
import { packResponseRequest, responseKey } from "../../web/src/colony/colonyBrain.ts";
import { Game, generateOneWorld, gameRng } from "../../web/src/colony/index.ts";
import { CELL, cellKey, cellOf, hexDistance, keyX, keyY, nx, ny } from "../../web/src/colony/hex.ts";
import { OPEN, isSky, rockAt, topRow } from "../../web/src/colony/world.ts";
import { GAME_STARTING_ANTS } from "../../web/src/colony/params.ts";
import { BACKFILL_TRACE_SECONDS } from "../../web/src/colony/passageTrace.ts";

const [seedText = "1", secondsText = "600", antsText = String(GAME_STARTING_ANTS), out] = process.argv.slice(2);
const [seed, seconds, ants] = [seedText, secondsText, antsText].map(Number);
if (![seed, seconds, ants].every((x) => Number.isSafeInteger(x) && x > 0)) {
  throw Error("Usage: nest-function.mjs seed simulated-seconds ants-per-colony [output.json]");
}
const allModes = ["current", "trace", "trace-repair"];
const modes = process.env.NEST_ASSAY_MODE ? [process.env.NEST_ASSAY_MODE] : allModes;
if (modes.some((m) => !allModes.includes(m))) throw Error("Unknown NEST_ASSAY_MODE");
const tickRate = 30;
const sampleTicks = 6;
const checkpointSeconds = 60;

function describeGeometry(colony, map) {
  const queue = [];
  const reached = new Set();
  const walkable = (x, y) => y >= topRow(map) && !isSky(map, x, y) && rockAt(map, x, y) === OPEN;
  const enqueue = (x, y) => {
    if (!walkable(x, y)) return;
    const key = cellKey(x, y);
    if (reached.has(key)) return;
    reached.add(key);
    queue.push(key);
  };
  enqueue(colony.entranceCol, colony.entranceRow);
  let deadEnds = 0;
  let branchCells = 0;
  let reachableWorkerDugCells = 0;
  for (let j = 0; j < queue.length; j++) {
    const key = queue[j];
    const x = keyX(key);
    const y = keyY(key);
    if (Number.isFinite(map.dugAt.get(x, y))) reachableWorkerDugCells++;
    let degree = 0;
    for (let d = 0; d < 6; d++) {
      const xx = nx(x, y, d);
      const yy = ny(y, d);
      if (!walkable(xx, yy)) continue;
      degree++;
      enqueue(xx, yy);
    }
    if (degree === 1) deadEnds++;
    if (degree >= 3) branchCells++;
  }
  const chambers = (map.chambers?.list ?? []).filter((room) => room.colony === colony.params.nest && room.cells > 0);
  return {
    reachableCells: reached.size,
    deadEnds,
    branchCells,
    reachableWorkerDugCells,
    chambers: chambers.length,
    chamberFloor: chambers.reduce((sum, room) => sum + room.floor, 0),
  };
}

function observer(colony) {
  const map = colony.layers[colony.home].map;
  const newest = new Map();
  const previous = new Map();
  const visited = new Set();
  const explored = new Set();
  const previouslyFilled = new Set();
  let redigCellsObserved = 0;
  let changes = 0;
  let reversals = 0;
  let foodCarriers = 0;
  let soilCarriers = 0;
  const carryingSince = new Map();
  let peakFoodCarriers = 0;
  let foodCarrierSeconds = 0;
  let peakLongHeld = 0;
  let heldOver30 = 0;
  const backfillSites = new Map();
  let floorFills = 0;
  let freshFloorFills = 0;
  let fillDecisions = 0;
  backfillObservers.set(colony, (cell, _ant, floor, recent, outcome) => {
    fillDecisions++;
    backfillSites.set(cell, (backfillSites.get(cell) ?? 0) + 1);
    if (floor && outcome === "filled") {
      floorFills++;
      if (recent) freshFloorFills++;
    }
  });

  function sample() {
    foodCarriers = 0;
    soilCarriers = 0;
    heldOver30 = 0;
    for (let i = 0; i < colony.n; i++) {
      if (!colony.alive[i] || colony.layer[i] !== colony.home) {
        carryingSince.delete(i);
        newest.delete(i);
        previous.delete(i);
        continue;
      }
      if (colony.carrying[i]) {
        foodCarriers++;
        const since = carryingSince.get(i) ?? colony.time;
        carryingSince.set(i, since);
        if (colony.time - since >= 30) heldOver30++;
      } else carryingSince.delete(i);
      soilCarriers += Number(Boolean(colony.pellet[i]));
      cellOf(colony.x[i], colony.y[i]);
      const [x, y] = CELL;
      const key = cellKey(x, y);
      visited.add(key);
      const dugAt = map.dugAt.get(x, y);
      if (!colony.pellet[i] && Number.isFinite(dugAt) && colony.time - dugAt >= 5) explored.add(key);
      const last = newest.get(i);
      if (last === key) continue;
      if (last !== undefined && hexDistance(x, y, keyX(last), keyY(last)) === 1) {
        changes++;
        if (previous.get(i) === key) reversals++;
        previous.set(i, last);
      } else previous.delete(i);
      newest.set(i, key);
    }
    peakFoodCarriers = Math.max(peakFoodCarriers, foodCarriers);
    peakLongHeld = Math.max(peakLongHeld, heldOver30);
    foodCarrierSeconds += (foodCarriers * sampleTicks) / tickRate;
  }

  function checkpoint(at) {
    for (const key of previouslyFilled) {
      if (rockAt(map, keyX(key), keyY(key)) !== OPEN) continue;
      redigCellsObserved++;
      previouslyFilled.delete(key);
    }
    map.filledAt.forEach((chunkX, chunkY, values) => {
      const size = Math.sqrt(values.length);
      for (let i = 0; i < values.length; i++) {
        if (values[i] > 0 && values[i] >= at - checkpointSeconds) {
          const x = chunkX * size + (i % size);
          const y = chunkY * size + Math.floor(i / size);
          previouslyFilled.add(cellKey(x, y));
        }
      }
    });
    const trace = colony.passageTrace;
    return {
      seconds: at,
      foodDelivered: colony.stored,
      portTrips: colony.portTrips,
      larder: colony.larder,
      undergroundFoodCarriers: foodCarriers,
      peakUndergroundFoodCarriers: peakFoodCarriers,
      undergroundFoodCarrierSeconds: foodCarrierSeconds,
      undergroundFoodHeldOver30s: heldOver30,
      peakUndergroundFoodHeldOver30s: peakLongHeld,
      fillDecisions,
      uniqueFillSites: backfillSites.size,
      maxDecisionsAtFillSite: [...backfillSites.values()].reduce((max, n) => Math.max(max, n), 0),
      floorFills,
      freshFloorFills,
      undergroundSoilCarriers: soilCarriers,
      population: colony.population,
      births: colony.births,
      losses: colony.losses,
      starvedBrood: colony.broodStarved,
      hungerDeaths: colony.diedHungry,
      dug: colony.soilDug,
      filled: colony.soilFilled,
      spoilToSurface: colony.soilOut,
      looseBackfill: colony.looseFilled,
      visitedCells: visited.size,
      laterUsedDugCells: explored.size,
      redigCellsObserved,
      sampledAdjacentMoves: changes,
      sampledReversals: reversals,
      trace: trace
        ? { cells: trace.cells.size, checks: trace.checks, recentKept: trace.recentKept, recentFilled: trace.recentFilled }
        : null,
      ...describeGeometry(colony, map),
    };
  }
  return { sample, checkpoint };
}

function run(mode) {
  const colony =
    mode === "current"
      ? undefined
      : {
          backfillTraceSeconds: BACKFILL_TRACE_SECONDS,
          ...(mode === "trace-repair" ? { backfillFloorRepair: true } : {}),
        };
  const specs = [{ antCount: ants, ...(colony ? { colony } : {}) }, { antCount: ants }];
  const game = new Game(generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } }), {}, gameRng(seed), specs);
  const first = game.colonies[0];
  const backfillSituations = new Map();
  if (colony) {
    const base = first.responses;
    first.responses = {
      ...base,
      drop(t, draw) {
        if (t.backfillTraffic !== undefined) backfillSituations.set(responseKey("drop", t), { ...t });
        return base.drop(t, draw);
      },
    };
  }
  const watch = observer(first);
  const checkpoints = [];
  const tickMs = [];
  for (let tick = 1; tick <= seconds * tickRate; tick++) {
    const start = performance.now();
    game.tick(1 / tickRate);
    tickMs.push(performance.now() - start);
    if (tick % sampleTicks === 0) watch.sample();
    if (tick % (checkpointSeconds * tickRate) === 0 || tick === seconds * tickRate) {
      checkpoints.push(watch.checkpoint(tick / tickRate));
    }
  }
  const meanMs = tickMs.reduce((a, b) => a + b, 0) / tickMs.length;
  tickMs.sort((a, b) => a - b);
  const situations = [...backfillSituations.values()].map((situation, i) => ({ id: `s${i}`, situation }));
  const exampleBytes = situations.length === 0 ? 0 : Buffer.byteLength(JSON.stringify(packResponseRequest("drop", situations, "")));
  return {
    mode,
    tickTiming: { meanMs, p95Ms: tickMs[Math.ceil(tickMs.length * 0.95) - 1] },
    backfillRequests: { uniqueSituations: situations.length, exampleBatchBytes: exampleBytes },
    checkpoints,
  };
}

const report = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  seed,
  seconds,
  antsPerColony: ants,
  results: modes.map(run),
};
const json = JSON.stringify(report, null, 2) + "\n";
if (out) writeFileSync(out, json);
else process.stdout.write(json);
