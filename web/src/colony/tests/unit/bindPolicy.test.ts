import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { Game } from "../../game.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { ticks } from "../builders.ts";

// The policy API on the sim (docs/refactor.md S4.4, ja-fnd.5.4): a lane's policy is bound to a colony or the fungus through `bindPolicy`, not assigned
// to a field, so a species' local rule, Jev's cached answers and a test's stub all arrive the same way.

const game = () => new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 20, rivalAnts: 20 }, mulberry32(3));

test("a colony's mode and stance policies are bound through bindPolicy and are what the tick asks", () => {
  const g = game();
  const c = g.player;
  let asked = 0;
  const mode = (): "explore" => (asked++, "explore");
  c.bindPolicy("mode", mode);
  assert.equal(c.policy, mode);
  ticks(g, 30);
  assert.ok(asked > 0, "the colony's ants asked the bound mode policy");
  const stance = () => "defend" as const;
  c.bindPolicy("stance", stance);
  assert.equal(c.stancePolicy, stance);
  assert.notEqual(g.rival!.policy, mode, "the other colony keeps its own");
});

test("the fungus's policy and growth policy are bound through bindPolicy", () => {
  const g = game();
  const fungus = () => "default";
  g.fungus.bindPolicy("fungus", fungus);
  assert.equal(g.fungus.policy, fungus);
  g.fungus.bindPolicy("fungus", null);
  assert.equal(g.fungus.policy, null, "null is the local rule");
  const growth = () => null;
  g.fungus.bindPolicy("growth", growth);
  assert.equal(g.fungus.growthPolicy, growth);
});

test("no code outside the colony assigns a policy field: the page, the server and the maintained scripts bind it", () => {
  const WEB = new URL("../../../../", import.meta.url).pathname; // web/
  const roots = [join(WEB, "src"), join(WEB, "server"), join(WEB, "worker"), join(WEB, "..", "scripts")];
  const ASSIGN = /\.(policy|stancePolicy|growthPolicy)\s*=[^=>]/;
  function* walk(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) yield* walk(p);
      else if (/\.(ts|tsx|mjs)$/.test(name)) yield p;
    }
  }
  const bad: string[] = [];
  for (const r of roots)
    for (const f of walk(r)) {
      if (f.startsWith(join(WEB, "src", "colony") + sep)) continue; // the colony's own constructors and its tests' sides
      readFileSync(f, "utf8")
        .split("\n")
        // `sides.policy` / `brains.policy` / `o.policy` are other objects' fields (experiment options), not a colony's or the fungus's
        .forEach(
          (l, n) =>
            ASSIGN.test(l) &&
            !/\b(sides|brains|o|opts|options|spec)\.(policy|stancePolicy)\s*=/.test(l) &&
            bad.push(`${f}:${n + 1}: ${l.trim()}`),
        );
    }
  assert.deepEqual(bad, []);
});
