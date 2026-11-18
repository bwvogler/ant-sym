// Offline paired pickup ablation. Synthetic caches, never a live Jev request.
// Usage: node scripts/lab/pickup-policy.mjs [seeds=1-20] [seconds=120] [arms=off,cached-local,cached-refuse]
// Other policies are restored after client attachment to isolate the get route.
import assert from "node:assert/strict";
import { PickupDwell } from "./pickup-dwell.mjs";
import { createHash } from "node:crypto";
import {
  CELL,
  cellOf,
  Game,
  generateOneWorld,
  mulberry32,
  localResponses,
  responseContext,
  responseKey,
  SAMPLE_TOUCH,
  MODES,
  STANCES,
  QUALITY,
  WHERE,
  packResponseRequest,
  estimateTokens,
} from "../../web/src/colony/index.ts";
import { ColonyJev } from "../../web/src/ui/colonyJev.ts";
const [
  range = "1-20",
  duration = "120",
  armsArg = "off,cached-local,cached-refuse",
] = process.argv.slice(2);
const [first, last = first] = range.split("-").map(Number);
const seconds = Number(duration);
const arms = armsArg.split(",");
assert.ok(
  arms.length &&
    arms.every((a) => ["off", "cached-local", "cached-refuse"].includes(a)),
);
assert.equal(new Set(arms).size, arms.length);
assert.ok(
  Number.isInteger(first) &&
    Number.isInteger(last) &&
    first > 0 &&
    last >= first,
);
assert.ok(Number.isFinite(seconds) && seconds > 0);
const doctrine = "Pickup cache ablation: gather food unless fighting.";
const context = responseContext("get", doctrine);
const situations = [];
for (const mode of MODES)
  for (const porter of [false, true])
    for (const digging of [false, true])
      for (const place of WHERE)
        for (const enemy of [false, true])
          for (const stance of STANCES)
            for (const quality of QUALITY)
              situations.push({
                ...SAMPLE_TOUCH,
                mode,
                porter,
                digging,
                place,
                enemy,
                stance,
                quality,
              });
function cost(items, batch) {
  let tokens = 0;
  for (let start = 0; start < items.length; start += batch)
    tokens += estimateTokens(
      packResponseRequest(
        "get",
        items
          .slice(start, start + batch)
          .map((situation, i) => ({ id: `p${i}`, situation })),
        doctrine,
      ),
    );
  return {
    requests: Math.ceil(items.length / batch),
    tokens,
    usd: (tokens * 0.042) / 1e6,
  };
}
for (let seed = first; seed <= last; seed++) {
  const runs = [];
  for (const arm of arms) {
    const g = new Game(
      generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } }),
      { antCount: 120, rivalAnts: 120 },
      mulberry32(seed * 7919),
    );
    const originals = g.colonies.map((c) => ({
      mode: c.policy,
      stance: c.stancePolicy,
      steer: c.steerPolicy,
    }));
    const j = new ColonyJev({ pickupPolicy: arm !== "off" });
    j.setDoctrine(doctrine);
    j.attachColonies(g.colonies);
    g.colonies.forEach((c, k) => {
      for (const lane of ["mode", "stance", "steer"])
        c.bindPolicy(lane, originals[k][lane]);
    });
    if (arm !== "off")
      j.seed(
        context,
        situations.map((t) => [
          responseKey("get", t),
          arm === "cached-refuse" ? "false=1" : `${localResponses.get(t)}=1`,
        ]),
      );
    const seen = new Map();
    const dwell = new PickupDwell();
    let currentTick = 0;
    const endReason = (id) => {
      const [k, i, gen] = id.split(":").map(Number),
        c = g.colonies[k];
      if (!c.alive[i] || c.gen[i] !== gen) return "dead-or-replaced";
      if (c.carrying[i]) return "carrying";
      // Preserve the shared hex scratch: measuring must not change the next tick.
      const [oldX, oldY] = CELL;
      try {
        cellOf(c.x[i], c.y[i]);
        return c.layers[c.layer[i]].map.food.get(CELL[0], CELL[1]) > 0
          ? "food-present-no-offer"
          : "off-food";
      } finally {
        CELL[0] = oldX;
        CELL[1] = oldY;
      }
    };
    let encounters = 0,
      accepted = 0;
    for (const [k, c] of g.colonies.entries()) {
      const get = c.responses.get;
      c.responses = {
        ...c.responses,
        get: (t, draw) => {
          const answer = get(t, draw);
          if (t.offered === "food" && t.carrying === "none") {
            const i = c.ti;
            dwell.observe(
              `${k}:${i}:${c.gen[i]}`,
              currentTick,
              `${c.layer[i]}:${c.cellX[i]},${c.cellY[i]}`,
              c.x[i],
              c.y[i],
              answer,
            );
            encounters++;
            accepted += Number(answer);
            seen.set(responseKey("get", t), { ...t });
          }
          return answer;
        },
      };
    }
    try {
      for (
        currentTick = 0;
        currentTick < Math.round(seconds * 30);
        currentTick++
      ) {
        g.tick(1 / 30);
        dwell.endTick(currentTick, endReason);
      }
      const values = [...seen.values()];
      const hash = createHash("sha256")
        .update(JSON.stringify(g.save()))
        .digest("hex");
      runs.push({
        arm,
        seed,
        seconds,
        dwell: dwell.finish(),
        encounters,
        accepted,
        distinct: seen.size,
        foodHome: g.colonies.map((c) => c.stored),
        losses: g.colonies.map((c) => c.losses),
        hash,
        coldCostFullBatches: cost(values, 100),
        coldCostSingletons: cost(values, 1),
        actualRequests: j.state.requests,
      });
    } finally {
      j.dispose();
    }
  }
  const off = runs.find((r) => r.arm === "off"),
    local = runs.find((r) => r.arm === "cached-local");
  if (off && local)
    assert.equal(
      off.hash,
      local.hash,
      `seed ${seed}: cached-local changed the saved simulation`,
    );
  const refuse = runs.find((r) => r.arm === "cached-refuse");
  if (refuse) assert.equal(refuse.accepted, 0);
  for (const r of runs) assert.equal(r.actualRequests, 0);
  console.log(
    JSON.stringify({
      seed,
      identical: off && local ? off.hash === local.hash : null,
      runs,
    }),
  );
}
