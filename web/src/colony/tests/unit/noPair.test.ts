import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The game's colonies are a list (docs/game-colonies.md, S4): no caller names the pair that came before it, the first and second
// colony as `Game.player` and `Game.rival`, the `rival`, `rivalAnts` and `rivalPolicy` settings, or `Sides`.
const WEB = new URL("../../../../", import.meta.url).pathname; // web/
const ROOTS = ["src", "server", "worker", "shared", join("..", "scripts")].map((r) => join(WEB, r));
const OLD = /\.rival\b|\.player\b|rivalAnts|rivalPolicy|rivalResponses|\bSides\b/;

/**
 * The lines that match for another reason, by file and the text that makes them so: the page's own settings (`GameSettings.rival` is
 * its "rival colony" box, from which `buildGame` makes the list), the saved record's `player` (the fungus player's state, not a
 * colony), and the G1 verdict's `rival` figure (a column of its table).
 */
const OTHER: { file: string; text: string }[] = [
  { file: join("src", "ui", "useColony.ts"), text: "s.rival" },
  { file: join("src", "ui", "useColony.ts"), text: "settings.rival" },
  { file: join("src", "ui", "useColony.ts"), text: "controls.rival" },
  { file: join("src", "ui", "useColony.ts"), text: "rival: " },
  { file: join("src", "ui", "LabCards.tsx"), text: "controls.rival" },
  { file: join("src", "ColonyApp.tsx"), text: "r.player." },
  { file: join("src", "ColonyApp.tsx"), text: "n.player," },
  { file: join("src", "colony", "tests", "slow", "g1", "g1Rule.ts"), text: "h.rival" },
  { file: join("src", "colony", "tests", "unit", "g1Rule.test.ts"), text: "rival: " },
  { file: join("src", "colony", "tests", "unit", "noPair.test.ts"), text: "" },
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name)) yield p;
  }
}

test("no caller names the pair: Game.player, Game.rival, rivalAnts, rivalPolicy, rivalResponses or Sides", () => {
  const bad: string[] = [];
  for (const root of ROOTS)
    for (const f of walk(root)) {
      const rel = f.slice(WEB.length);
      const allowed = OTHER.filter((o) => o.file === rel);
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (OLD.test(line) && !allowed.some((o) => line.includes(o.text))) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  assert.deepEqual(bad, [], "name the colonies by a ColonySpec list and read game.colonies[k]");
});

test("the scan sees each old word", () => {
  for (const hit of ["game.player", "g.rival!", "{ rivalAnts: 5 }", "{ rivalPolicy: p }", "{ rivalResponses: r }", "how: Sides"])
    assert.ok(OLD.test(hit), hit);
  for (const ok of ["game.colonies[0]", "the rival colony", "nextRivalCheck", "player's state", "rivalFirst"]) assert.ok(!OLD.test(ok), ok);
  assert.ok(fileURLToPath(import.meta.url).includes(sep));
});
