// Offline pilot for ja-g7nz.3.3. No live policy calls and no default changes.
// node scripts/lab/delivery-calibration.mjs --seed 1 --seconds 120 --ants 60 --out experiments/delivery-pilot-seed1.json
import { observeLooseFood } from "./loose-food-ledger.mjs";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Game, gameRng, generateOneWorld, responses, CELL, cellOf, nx, ny, rockAt } from "../../web/src/colony/index.ts";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const seed = Number(value("--seed", 1));
const seconds = Number(value("--seconds", 120));
const ants = Number(value("--ants", 60));
if (![seed, seconds, ants].every((x) => Number.isInteger(x) && x > 0)) throw Error("seed, seconds and ants must be positive integers");
const royalCap = Number(value("--royal-cap", 20));
if (!Number.isFinite(royalCap) || royalCap <= 0) throw Error("royal-cap must be positive and finite");
const cueLossFrom = Number(value("--cue-loss-from", -1));
const cueLossTo = Number(value("--cue-loss-to", seconds));
const cueLoss = cueLossFrom >= 0;
if (
  !Number.isInteger(cueLossFrom) ||
  cueLossFrom < -1 ||
  !Number.isInteger(cueLossTo) ||
  (cueLoss && !(cueLossFrom < cueLossTo && cueLossTo <= seconds))
)
  throw Error("cue loss requires integer 0 <= from < to <= seconds (or from=-1 to disable)");
const requested = value("--variants", "baseline,retain,persist,redirect5,redirect20");
const variants = {
  contextPersist5: { lane: 1, limit: 5, doctrine: "contextPersist" },
  contextRelease5: { lane: 1, limit: 5, doctrine: "contextRelease" },
  context5: { lane: 1, limit: 5, doctrine: "context" },
  contextPersist20: { lane: 1, limit: 20, doctrine: "contextPersist" },
  contextRelease20: { lane: 1, limit: 20, doctrine: "contextRelease" },
  context20: { lane: 1, limit: 20, doctrine: "context" },
  royal: { lane: 1, limit: 5, doctrine: "royal" },
  royal5: { lane: 1, limit: 5, doctrine: "redirectRoyal" },
  royal20: { lane: 1, limit: 20, doctrine: "redirectRoyal" },
  baseline: { lane: 0, limit: 0, doctrine: "local" },
  retain: { lane: 1, limit: 5, doctrine: "retain" },
  persist: { lane: 1, limit: 5, doctrine: "persist" },
  redirect5: { lane: 1, limit: 5, doctrine: "redirect" },
  redirect20: { lane: 1, limit: 20, doctrine: "redirect" },
  redirect60: { lane: 1, limit: 60, doctrine: "redirect" },
};
const traceAnt = Number(value("--trace-ant", -1));
const traceFrom = Number(value("--trace-from", Math.max(0, seconds - 2)));
if (!Number.isInteger(traceAnt) || traceAnt < -1 || !Number.isFinite(traceFrom) || traceFrom < 0)
  throw Error("trace-ant must be a nonnegative slot (or -1); trace-from must be nonnegative seconds");
const results = [];
const output = value("--out", null);
const report = {
  harnessSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  ledgerSha256: createHash("sha256")
    .update(readFileSync(new URL("./loose-food-ledger.mjs", import.meta.url)))
    .digest("hex"),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  seed,
  seconds,
  ants,
  royalCap,
  cueLoss: cueLoss ? { from: cueLossFrom, to: cueLossTo, gain: 0, restoredGain: 1 } : null,
  design:
    "One colony on a generated 160x100 plane; no rival, no forced food, loads or locations. Optional timed mark-gain loss is an experimental intervention, not simulated fungal infection. Local base policy. Baseline and retain are negative controls. Same initial RNG seed does not mean identical draws after trajectories diverge.",
  results,
};
for (const name of requested.split(",")) {
  const v = variants[name];
  if (!v) throw Error(`unknown variant ${name}`);
  const started = performance.now();
  const g = new Game(generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } }), { antCount: ants, rival: false }, gameRng(seed), {
    colony: { deliveryLane: v.lane, deliveryReconsider: v.limit },
  });
  const c = g.player;
  const chambers = c.map.chambers;
  // A harness-only intervention, applied before ticks and only to this colony's
  // home-layer royal channel. Copy parameters; never mutate shared defaults.
  const initialLayer = c.cur;
  c.bind(c.home);
  const homeMap = c.map;
  let observedTime = 0;
  const foodLedger = observeLooseFood(homeMap.food, () => observedTime);
  c.ph.params = { ...c.ph.params, royal: { ...c.ph.params.royal, max: royalCap } };
  c.bind(initialLayer);
  if (traceAnt >= c.n) throw Error("trace-ant exceeds allocated ant slots");
  const trace = [];
  const initialAlive = c.alive.reduce((a, b) => a + b, 0);
  const initialLarder = c.larder;
  let carryCalls = 0,
    longCalls = 0,
    maxHeld = 0,
    maxActive = 0,
    switches = 0,
    starts = 0,
    deliveries = 0,
    releases = 0,
    releaseCalls = 0,
    cueLossCarryCalls = 0,
    cueLossRecognisedCalls = 0,
    cueLossUncommittedDrops = 0;
  let cueLossActive = false;
  const checkpoints = [];
  const checkpoint = (at) => ({
    at,
    stored: c.stored,
    looseFood: foodLedger.snapshot(),
    deliveries,
    releases,
    releaseCalls,
    longCalls,
    held: c.carrying.reduce((n, x, i) => n + (c.alive[i] && x === 1 ? 1 : 0), 0),
    alive: c.alive.reduce((n, x) => n + x, 0),
  });
  let activeSeconds = 0,
    longSeconds = 0;
  const prior = new Uint8Array(c.n);
  const heldAge = new Float64Array(c.n);
  let maxHeldOver120 = 0;
  if (v.doctrine !== "local")
    c.responses = responses({
      // Observational wrapper of local drop=true; no new decision or draw.
      drop: (t) => {
        // only a food drop is a delivery: spoil, corpses and brood are asked `drop` too (ja-g7nz), and have no delivery target
        if (cueLossActive && t.carrying === "food" && t.deliveryTarget === "none") cueLossUncommittedDrops++;
        return true;
      },
      carry: (t) => {
        carryCalls++;
        if (cueLossActive && t.carrying === "food") {
          cueLossCarryCalls++;
          if (t.deliveryPlace !== "none") cueLossRecognisedCalls++;
        }
        if (t.carrying !== "food" || v.doctrine === "retain") return "take";
        if (t.deliveryAttempt === "long") longCalls++;
        if (v.doctrine === "royal") return "to royal";
        if (["context", "contextPersist", "contextRelease"].includes(v.doctrine)) {
          if (t.deliveryPlace !== "none") return `to ${t.deliveryPlace}`;
          if (t.deliveryAttempt === "long") {
            if (v.doctrine === "contextRelease") {
              releaseCalls++;
              return "put down";
            }
            if (v.doctrine === "context" && t.deliveryTarget === "brood") return "to royal";
          }
          return t.deliveryTarget === "none" ? "to brood" : "take";
        }
        if (t.deliveryAttempt === "long") {
          if (v.doctrine === "redirectRoyal") return "to royal";
          if (v.doctrine === "redirect") return "to store";
        }
        return t.deliveryAttempt === "none" ? "to brood" : "take";
      },
    });
  const originalGet = c.responses.get;
  c.responses = {
    ...c.responses,
    get: (t, draw) => {
      foodLedger.clearPickup();
      const answer = originalGet(t, draw);
      if (answer && t.offered === "food" && c.map === homeMap) {
        const x = CELL[0],
          y = CELL[1];
        cellOf(c.x[c.ti], c.y[c.ti]);
        foodLedger.expectPickup(CELL[0], CELL[1]);
        CELL[0] = x;
        CELL[1] = y;
      }
      return answer;
    },
  };
  for (let tick = 0; tick < seconds * 30; tick++) {
    observedTime = tick / 30;
    if (cueLoss) {
      if (g.fungus.active) throw Error("controlled gain intervention requires an inactive fungus");
      if (tick === cueLossFrom * 30 || tick === cueLossTo * 30) checkpoints.push(checkpoint(tick / 30));
      cueLossActive = tick >= cueLossFrom * 30 && tick < cueLossTo * 30;
      c.gainMarks.fill(cueLossActive ? 0 : 1);
    }
    prior.set(c.deliveryRole);
    g.tick(1 / 30);
    foodLedger.clearPickup();
    // Diagnostic reads only: restore the bound layer and shared cell scratch.
    // At most 600 samples per variant; sample the final two seconds by default.
    if (traceAnt >= 0 && tick / 30 >= traceFrom && tick % 3 === 0 && trace.length < 600) {
      const i = traceAnt,
        layer = c.cur,
        savedCell = [...CELL];
      c.bind(c.layer[i]);
      cellOf(c.x[i], c.y[i]);
      const [cx, cy] = CELL;
      const role = ["royal", "brood", "store", "reception"][c.deliveryRole[i] - 1];
      const mark = role ? c.ph.fields[role] : null;
      trace.push({
        tick: tick + 1,
        alive: !!c.alive[i],
        layer: c.layer[i],
        x: c.x[i],
        y: c.y[i],
        cx,
        cy,
        gx: c.gx[i],
        gy: c.gy[i],
        heading: c.heading[i],
        direction: c.gdir[i],
        wall: c.wall[i],
        carrying: c.carrying[i],
        role: role ?? null,
        state: c.deliveryState[i],
        effort: c.deliveryTime[i],
        lastRole: c.lastRole[i],
        sinceRole: c.sinceRole[i],
        chamber: c.placeAt(cx, cy),
        cue: mark?.get(cx, cy) ?? 0,
        neighbours: Array.from({ length: 6 }, (_, direction) => {
          const x = nx(cx, cy, direction),
            y = ny(cy, direction);
          return { direction, x, y, rock: rockAt(c.map, x, y), cue: mark?.get(x, y) ?? 0 };
        }),
      });
      c.bind(layer);
      CELL.set(savedCell);
    }
    let held = 0,
      active = 0,
      heldOver120 = 0;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) {
        heldAge[i] = 0;
        continue;
      }
      heldAge[i] = c.carrying[i] === 1 ? heldAge[i] + 1 / 30 : 0;
      if (heldAge[i] > 120) heldOver120++;
      held += c.carrying[i] === 1 ? 1 : 0;
      const role = c.deliveryRole[i];
      if (role) {
        active++;
        if (!prior[i]) starts++;
        else if (prior[i] !== role) switches++;
        if (c.deliveryTime[i] >= v.limit && v.limit > 0) longSeconds += 1 / 30;
      } else if (prior[i] && c.deliveryState[i] === 4) deliveries++;
      else if (prior[i] && c.deliveryState[i] === 5) releases++;
    }
    activeSeconds += active / 30;
    maxHeldOver120 = Math.max(maxHeldOver120, heldOver120);
    maxHeld = Math.max(maxHeld, held);
    maxActive = Math.max(maxActive, active);
  }
  observedTime = seconds;
  if (cueLoss) {
    c.gainMarks.fill(1);
    checkpoints.push(checkpoint(seconds));
    if (cueLossRecognisedCalls) throw Error("floor recognition leaked through erased cues");
  }
  const finalLayer = c.cur;
  c.bind(c.home);
  let markedCells = 0,
    nearCapCells = 0,
    maxRoyal = 0;
  c.ph.fields.royal.forEach((_x, _y, cells) => {
    for (const level of cells) {
      if (level >= 0.05) markedCells++;
      if (level >= royalCap * 0.9) nearCapCells++;
      maxRoyal = Math.max(maxRoyal, level);
    }
  });
  c.bind(finalLayer);
  const result = {
    looseFood: foodLedger.snapshot(),
    royalField: { markedCells, nearCapCells, max: maxRoyal },
    name,
    ...v,
    ...(traceAnt >= 0 ? { traceAnt, traceFrom, trace } : {}),
    initialAlive,
    initialLarder,
    finalAlive: c.alive.reduce((a, b) => a + b, 0),
    chambers: chambers?.list.filter((x) => x.colony === c.params.nest).map((x) => ({ role: x.role, food: x.food })),
    queenAlive: c.queen?.alive ?? false,
    births: c.births,
    diedHungry: c.diedHungry,
    stored: c.stored,
    portTrips: c.portTrips,
    finalLarder: c.larder,
    carriedDown: c.carriedDown,
    held: c.carrying.reduce((sum, x, i) => sum + (c.alive[i] && x === 1 ? 1 : 0), 0),
    maxHeld,
    maxActive,
    maxHeldOver120,
    broodStarved: c.broodStarved,
    unresolved: Array.from({ length: c.n }, (_, i) => i)
      .filter((i) => c.alive[i] && c.deliveryRole[i] && heldAge[i] > 120)
      .slice(0, 10)
      .map((i) => ({
        i,
        role: c.deliveryRole[i],
        layer: c.layer[i],
        x: c.x[i],
        y: c.y[i],
        heldSeconds: heldAge[i],
        state: c.deliveryState[i],
      })),
    starts,
    switches,
    deliveries,
    releases,
    releaseCalls,
    cueLossCarryCalls,
    cueLossRecognisedCalls,
    cueLossUncommittedDrops,
    checkpoints,
    activeSeconds,
    longSeconds,
    carryCalls,
    longCalls,
    wallSeconds: (performance.now() - started) / 1000,
  };
  results.push(result);
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
