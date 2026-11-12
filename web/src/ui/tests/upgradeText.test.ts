import assert from "node:assert/strict";
import test from "node:test";
import { LEVERS, UPGRADES } from "../../colony/index.ts";
import { levelTexts, nextLevelTip, upgradeTip, UPGRADE_IDS_WITH_WHY } from "../upgradeText.ts";
import { EDGE, GAP, place } from "../tipPosition.ts";

test("every upgrade has a 'why it matters' line, and no line is left for an upgrade that is gone", () => {
  assert.deepEqual([...UPGRADE_IDS_WITH_WHY].sort(), UPGRADES.map((u) => u.id).sort());
  for (const u of UPGRADES) assert.ok(upgradeTip(u).why.length > 40, `${u.id}: why is too short to explain anything`);
});

test("every level of every upgrade is explained, in words that carry its number or its reach", () => {
  for (const u of UPGRADES) {
    const levels = levelTexts(u);
    assert.equal(levels.length, u.steps.length, `${u.id}: one line per level`);
    levels.forEach((l, k) => {
      assert.equal(l.step, u.steps[k]);
      assert.ok(l.line.length > 15, `${u.id} level ${k} has no explanation`);
    });
  }
  // The spread levels quote the table's own values, so the text can't drift from what the game does.
  const infectivity = levelTexts(UPGRADES.find((u) => u.id === "infectivity")!);
  assert.match(infectivity[0]!.line, /12 %.*scaled by how many of the ants around carry it/);
  assert.match(infectivity[3]!.line, /30 %/);
  const persistence = levelTexts(UPGRADES.find((u) => u.id === "persistence")!);
  assert.match(persistence[0]!.line, /3 %.*about 23 s/);
  assert.match(persistence[2]!.line, /never clears it on its own/);
  const fruiting = levelTexts(UPGRADES.find((u) => u.id === "fruiting")!);
  assert.match(fruiting[0]!.line, /^0\.6 % of the mycelium's mass becomes spores/);
  assert.match(fruiting[2]!.line, /^2 % of the mycelium's mass/);
  const mycelium = levelTexts(UPGRADES.find((u) => u.id === "mycelium")!);
  assert.match(mycelium[1]!.line, /60 units of mycelium/);
  const evasion = levelTexts(UPGRADES.find((u) => u.id === "evasion")!);
  assert.match(evasion[1]!.line, /35 %/);
});

test("a reach upgrade's tooltip lists every lever it widens, each with its words, and says reach costs no tokens", () => {
  for (const u of UPGRADES.filter((x) => x.kind === "reach")) {
    const t = upgradeTip(u);
    assert.deepEqual(
      t.levers.map((l) => l.id),
      u.levers,
      `${u.id}: its levers`,
    );
    for (const l of t.levers) {
      assert.ok(l.blurb.length > 10 && l.words.length >= 2, `${l.id} is unexplained`);
      assert.equal(LEVERS.find((x) => x.id === l.id)?.name, l.name);
    }
    assert.match(t.reachNote ?? "", /costs no tokens/);
  }
  // Lethal levers are marked so the panel shows them in the danger colour.
  assert.deepEqual(
    upgradeTip(UPGRADES.find((u) => u.id === "weapon")!).levers.map((l) => l.lethal),
    [true],
  );
});

test("a lethal reach upgrade reads as off or free, a graded one as none, one step or the full range", () => {
  const weapon = levelTexts(UPGRADES.find((u) => u.id === "weapon")!);
  assert.equal(weapon[0]!.step, "held off");
  assert.match(weapon[0]!.line, /runs as is/);
  assert.equal(weapon[1]!.step, "free");
  assert.match(weapon[1]!.line, /takes effect/);
  const senses = levelTexts(UPGRADES.find((u) => u.id === "senses")!);
  assert.match(senses[0]!.line, /one step/);
  assert.match(senses[1]!.line, /takes effect at any level/);
  const trails = levelTexts(UPGRADES.find((u) => u.id === "trails")!);
  assert.match(trails[0]!.line, /held at as is/);
});

test("the next level's tooltip carries its cost and meaning, and is absent at the top", () => {
  const u = UPGRADES.find((x) => x.id === "infectivity")!;
  const n = nextLevelTip(u, 0)!;
  assert.equal(n.cost, 3);
  assert.equal(n.step, "fair");
  assert.match(n.line, /15 %/);
  assert.equal(nextLevelTip(u, u.steps.length - 1), null);
});

test("a tooltip goes below its anchor, flips above without room, and stays inside the window", () => {
  const view = { width: 1000, height: 600 };
  const tip = { width: 288, height: 120 };
  const anchor = { left: 100, top: 100, right: 180, bottom: 120 };
  assert.deepEqual(place(anchor, tip, view), { left: 100, top: 120 + GAP, above: false });
  const low = { left: 100, top: 560, right: 180, bottom: 580 };
  const flipped = place(low, tip, view);
  assert.equal(flipped.above, true);
  assert.equal(flipped.top, 560 - GAP - 120);
  const right = place({ left: 950, top: 100, right: 990, bottom: 120 }, tip, view);
  assert.equal(right.left, 1000 - EDGE - 288);
  // Room nowhere: it is kept inside the window rather than off it.
  const tall = place({ left: 0, top: 300, right: 10, bottom: 320 }, { width: 100, height: 590 }, view);
  assert.equal(tall.top, EDGE);
});
