// Characterization, not the desired action-based combat contract. These measurements
// expose why adding "ignore" to a policy is insufficient: battle currently uses
// proximity and healthy tolerance, independently of the ant's chosen response.
// Deliberately revise these expectations when directed aggression is implemented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { Colony } from "../../colony.ts";
import { decide } from "../../decide.ts";
import { Recognition } from "../../recognition.ts";
import { responses, type Contact } from "../../responses.ts";
import { enemyHeading } from "../../sense.ts";
import { AntStep } from "../../step.ts";
import { FIGHT, RETURN } from "../../vocab.ts";
import { mulberry32, worldFromArrays } from "../../world.ts";
import { nestAt, put } from "../hexmaps.ts";

function meeting(choices: [Contact, Contact], tolerances: [number, number], sameOdour = false, seed = 1) {
  const map = worldFromArrays({ w: 40, h: 12 }, [nestAt(4, 6, 2), nestAt(36, 6, 2)]);
  const colonies = choices.map((answer, nest) => {
    const c = new Colony(map, { antCount: 12, maxAnts: 12, nest, odour: sameOdour ? 0 : nest }, mulberry32(20 + nest), () => "explore");
    c.responses = responses({ contact: () => answer });
    for (let i = 0; i < c.n; i++) {
      put(c, i, 20, 6);
      c.tolerance[i] = tolerances[nest];
    }
    return c;
  });
  const rec = new Recognition();
  rec.build(colonies);
  const sensed: boolean[] = [];
  const modes: number[] = [];
  for (const c of colonies) {
    c.enemies = rec;
    const s = new AntStep();
    s.p = c.params;
    s.dt = 1 / 30;
    for (let i = 0; i < c.n; i++) {
      s.toEnemy = enemyHeading(c, i);
      if (i === 0) sensed.push(s.toEnemy !== null);
      decide(c, i, s);
    }
    modes.push(c.mode[0]);
  }
  // Hold positions fixed to isolate the encounter decision from escape speed.
  const grids = colonies.map((c) => occupancy(c, new CountGrid()));
  const deaths = resolveFights(colonies, grids, 0.2, mulberry32(seed), undefined, rec);
  return { sensed, modes, deaths, alarm: colonies.map((c) => c.ph.total("alarm")) };
}

test("baseline: mutual withdrawal changes movement, but not contact damage or alarm", (t) => {
  const totals = { fight: 0, flee: 0 };
  for (let seed = 1; seed <= 8; seed++) {
    const attack = meeting(["fight", "fight"], [0.35, 0.35], false, seed);
    const retreat = meeting(["flee", "flee"], [0.35, 0.35], false, seed);
    assert.deepEqual(attack.modes, [FIGHT, FIGHT]);
    assert.deepEqual(retreat.modes, [RETURN, RETURN]);
    assert.deepEqual(retreat.deaths, attack.deaths);
    assert.deepEqual(retreat.alarm, attack.alarm);
    totals.fight += attack.deaths.reduce((a, b) => a + b, 0);
    totals.flee += retreat.deaths.reduce((a, b) => a + b, 0);
  }
  assert.ok(totals.fight > 0);
  t.diagnostic(`8 paired seeds, 24 ants each, 0.2 s fixed contact: ${JSON.stringify(totals)}`);
});

test("baseline: unilateral and mutual perceived tolerance do not change battle's healthy threshold", () => {
  const normal = meeting(["fight", "fight"], [0.35, 0.35]);
  const one = meeting(["fight", "fight"], [1, 0.35]);
  const both = meeting(["fight", "fight"], [1, 1]);
  assert.deepEqual(normal.sensed, [true, true]);
  assert.deepEqual(one.sensed, [false, true]);
  assert.deepEqual(both.sensed, [false, false]);
  assert.deepEqual(one.deaths, normal.deaths);
  assert.deepEqual(both.deaths, normal.deaths);
  assert.ok(both.deaths.some((n) => n > 0));
});

test("baseline: matching emitted odours prevents combat; the same seed replays exactly", () => {
  const familiar = meeting(["fight", "fight"], [0.35, 0.35], true);
  assert.deepEqual(familiar.sensed, [false, false]);
  assert.deepEqual(familiar.deaths, [0, 0]);
  assert.deepEqual(familiar.alarm, [0, 0]);
  assert.deepEqual(meeting(["fight", "flee"], [1, 0.35]), meeting(["fight", "flee"], [1, 0.35]));
});
