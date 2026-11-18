// Offline pilot for ja-g7nz.3.3. No live policy calls and no default changes.
// node scripts/lab/delivery-calibration.mjs --seed 1 --seconds 120 --ants 60 --out experiments/delivery-pilot-seed1.json
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Game, gameRng, generateOneWorld, responses } from "../../web/src/colony/index.ts";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const seed = Number(value("--seed", 1));
const seconds = Number(value("--seconds", 120));
const ants = Number(value("--ants", 60));
if (![seed, seconds, ants].every((x) => Number.isInteger(x) && x > 0)) throw Error("seed, seconds and ants must be positive integers");
const requested = value("--variants", "baseline,retain,persist,redirect5,redirect20");
const variants = {
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
const results = [];
const output = value("--out", null);
const report = {
  harnessSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  seed,
  seconds,
  ants,
  design:
    "One colony on a generated 160x100 plane; no rival, no forced food, loads, cues or locations. Local base policy. Baseline and retain are negative controls. Same initial RNG seed does not mean identical draws after trajectories diverge.",
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
  const initialAlive = c.alive.reduce((a, b) => a + b, 0);
  const initialLarder = c.larder;
  let carryCalls = 0,
    longCalls = 0,
    maxHeld = 0,
    maxActive = 0,
    switches = 0,
    starts = 0,
    deliveries = 0;
  let activeSeconds = 0,
    longSeconds = 0;
  const prior = new Uint8Array(c.n);
  const heldAge = new Float64Array(c.n);
  let maxHeldOver120 = 0;
  if (v.doctrine !== "local")
    c.responses = responses({
      carry: (t) => {
        carryCalls++;
        if (t.carrying !== "food" || v.doctrine === "retain") return "take";
        if (v.doctrine === "royal") return "to royal";
        if (t.deliveryAttempt === "long") {
          longCalls++;
          if (v.doctrine === "redirectRoyal") return "to royal";
          if (v.doctrine === "redirect") return "to store";
        }
        return t.deliveryAttempt === "none" ? "to brood" : "take";
      },
    });
  for (let tick = 0; tick < seconds * 30; tick++) {
    prior.set(c.deliveryRole);
    g.tick(1 / 30);
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
    }
    activeSeconds += active / 30;
    maxHeldOver120 = Math.max(maxHeldOver120, heldOver120);
    maxHeld = Math.max(maxHeld, held);
    maxActive = Math.max(maxActive, active);
  }
  const result = {
    name,
    ...v,
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
