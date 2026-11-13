import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// tick sets what every stage reads and none writes (the tick's own values, the bound layer's) into the step record once,
// and again at the layer switch (docs/refactor.md S3.4, review of #157 N1). A stage that wrote one would change it for
// every later ant of the tick: this keeps "none writes" true.

const COLONY = new URL("../../colony/", import.meta.url).pathname;
const STAGES = ["perceive", "stance", "decide", "steer", "move", "arrive"];
const SHARED = [
  "p",
  "rng",
  "dt",
  "a",
  "ca",
  "sa",
  "map",
  "ph",
  "home",
  "gate",
  "hold",
  "leak",
  "metLeak",
  "rgate",
  "foeLeak",
  "sgate",
  "threatLeak",
  "crowdKeep",
];

test("no tick stage writes the step record's per-tick or per-layer fields", () => {
  const write = new RegExp(`\\bs\\.(${SHARED.join("|")})\\s*(?:[-+*/]?=(?!=)|\\+\\+|--)`);
  for (const f of STAGES) {
    const lines = readFileSync(`${COLONY}${f}.ts`, "utf8").split("\n");
    lines.forEach((l, k) => assert.ok(!write.test(l), `${f}.ts:${k + 1} writes a shared field: ${l.trim()}`));
  }
});
