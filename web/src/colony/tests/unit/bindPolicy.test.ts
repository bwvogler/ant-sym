import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
  // An assignment to the field by dot or bracket (plain, `||=`, `??=`, `&&=`, with a line break before the `=`) or `Object.assign(x, { policy })`: read as
  // the whole file, not line by line. `readonly` stops the dotted forms in checked code; the scripts that are not type-checked (scripts/lab, e2e) and
  // Object.assign are what this test is for.
  const NAME = "(?:policy|stancePolicy|growthPolicy)";
  const ASSIGN = new RegExp(
    `(?:\\.|\\[["'])\\s*${NAME}["']?\\]?\\s*(?:\\|\\||\\?\\?|&&)?=(?![=>])|Object\\.assign\\([^)]*\\b${NAME}\\b`,
    "g",
  );
  // Fields of other objects (experiment options and sides: `sides.policy`, `brains.policy`), allowed by file, not by variable name.
  const OTHER_OBJECTS = new Set([join(WEB, "src", "colony", "experiment.ts"), join(WEB, "..", "scripts", "experiment.mjs")]);
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
      if (f.startsWith(join(WEB, "src", "colony") + sep) || OTHER_OBJECTS.has(f) || f === fileURLToPath(import.meta.url)) continue; // the colony's own constructors and tests
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(ASSIGN)) bad.push(`${f}:${text.slice(0, m.index).split("\n").length}: ${m[0].trim()}`);
    }
  assert.deepEqual(bad, []);
});

test("the scan sees every way to assign a policy field", () => {
  const NAME = "(?:policy|stancePolicy|growthPolicy)";
  const ASSIGN = new RegExp(
    `(?:\\.|\\[["'])\\s*${NAME}["']?\\]?\\s*(?:\\|\\||\\?\\?|&&)?=(?![=>])|Object\\.assign\\([^)]*\\b${NAME}\\b`,
    "g",
  );
  for (const bad of [
    "x.policy = f;",
    "x.stancePolicy ||= f;",
    "x.policy ??= f",
    'x["policy"] = f',
    "x['growthPolicy'] = f",
    "x.policy\n  = f",
    "Object.assign(x, { policy: f })",
  ])
    assert.ok([...bad.matchAll(ASSIGN)].length > 0, `${JSON.stringify(bad)} is caught`);
  for (const ok of ["x.policy == f", "x.policy === f", "const f = (s) => s.policy => 1", "x.bindPolicy('mode', f)", "policy = f"])
    assert.equal([...ok.matchAll(ASSIGN)].length, 0, `${JSON.stringify(ok)} is not an assignment`);
});
