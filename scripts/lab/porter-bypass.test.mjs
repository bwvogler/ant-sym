import assert from "node:assert/strict";
import { test } from "node:test";
import { bypassPolicies } from "../../web/src/colony/bypassPolicy.ts";
import { cellKey, nx, ny } from "../../web/src/colony/hex.ts";
import { arena } from "../../web/src/colony/tests/builders.ts";
import { OPEN, SOIL } from "../../web/src/colony/world.ts";
import { installPorterBypass } from "./porter-bypass.mjs";

test("several porter reversals can open a one-cell shortcut, subject to the refill hold", () => {
  const map = arena();
  for (let y = 1; y < 11; y++) for (let x = 12; x < 29; x++) map.rock.set(x, y, SOIL);
  const route = [
    [21, 6],
    [21, 5],
    [21, 4],
    [20, 4],
    [19, 4],
    [18, 5],
    [18, 6],
    [19, 6],
  ];
  for (const [x, y] of route) map.rock.set(x, y, OPEN);
  const [x, y] = route[0];
  const junction = cellKey(x, y);
  const shortcut = cellKey(20, 6);
  const colony = { layers: [{ map }], home: 0, time: 300, params: { backfill: { hold: 100 } } };
  const assay = installPorterBypass(colony);
  const policy = bypassPolicies.get(colony);

  for (const slot of [0, 1, 1, 1]) assay.reversal(junction, slot);
  assay.refresh();
  assert.equal(policy.choose(4, x, y), -1, "two slots are insufficient");
  assay.reversal(junction, 2);
  map.filledAt.set(20, 6, 290);
  assay.refresh();
  assert.equal(policy.choose(4, x, y), -1, "recent fill is protected");
  map.filledAt.set(20, 6, -Infinity);
  assay.refresh();
  const direction = policy.choose(4, x, y);
  assert.equal(cellKey(nx(x, y, direction), ny(y, direction)), shortcut);

  assert.equal(policy.aimedAt(4, 20, 6), true);
  policy.opened(4, 20, 6);
  assay.visit(shortcut);
  assert.deepEqual(assay.checkpoint().opened, [{ x: 20, y: 6, seconds: 300, previousRouteSteps: 6, porterEntries: 1 }]);
  assert.equal(policy.aimedAt(4, 20, 6), false);
});
