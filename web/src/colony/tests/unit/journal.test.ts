import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { Journal, JOURNAL_CATEGORIES, parseJournalSpec, formatJournalEvent } from "../../journal.ts";
import { MODES } from "../../vocab.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { ticks, SMALL_SIDE } from "../builders.ts";

// The game journal (ja-8tb): a read-only observer that writes an event for each change it sees between ticks.

const small = (seed = 3) => new Game(generateSideWorld(seed, SMALL_SIDE), { antCount: 12, rival: false }, mulberry32(seed));

/** A game already observed once (the journal's baseline), and the journal. */
function watched(spec: string) {
  const g = small();
  ticks(g, 3);
  const j = new Journal(spec);
  j.observe(g);
  j.events.length = 0; // the baseline's own line
  return { g, j, c: g.colonies[0]! };
}

const firstAlive = (c: Game["colonies"][number]) => {
  for (let i = 0; i < c.n; i++) if (c.alive[i]) return i;
  throw new Error("no living ant");
};

test("spec: levels expand to categories, categories add, colony= and ant= narrow, a typo throws", () => {
  assert.deepEqual([...parseJournalSpec("summary").categories], ["colony", "queen", "stance", "jev"]);
  assert.deepEqual([...parseJournalSpec("detail").categories], ["colony", "queen", "stance", "jev", "birth", "death", "infection"]);
  assert.deepEqual([...parseJournalSpec("verbose").categories], [...JOURNAL_CATEGORIES]);
  assert.deepEqual([...parseJournalSpec("summary,death").categories], ["colony", "queen", "stance", "jev", "death"]);
  assert.equal(parseJournalSpec("").categories.size, 0);
  assert.equal(parseJournalSpec("off").categories.size, 0);
  const f = parseJournalSpec("mode,colony=1,ant=42");
  assert.deepEqual([...f.categories], ["mode"]);
  assert.equal(f.colony, 1);
  assert.equal(f.ant, 42);
  assert.equal(parseJournalSpec("ant=3").categories.size, JOURNAL_CATEGORIES.length, "an ant alone: everything about it");
  assert.throws(() => parseJournalSpec("deaths"), /unknown "deaths"/);
  assert.throws(() => parseJournalSpec("ant=x"), /ant=<i>/);
});

test("watching changes nothing: a game observed every tick at verbose saves the same as one never observed", () => {
  const a = small();
  const b = small();
  const j = new Journal("verbose");
  for (let k = 0; k < 30 * 20; k++) {
    a.tick(1 / 30);
    b.tick(1 / 30);
    j.observe(b);
  }
  assert.ok(j.written > 0, "the journal saw something");
  assert.equal(JSON.stringify(b.save()), JSON.stringify(a.save()));
});

test("the first look writes one line per colony, not an event per ant", () => {
  const g = small();
  const j = new Journal("verbose");
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.cat, e.colony]),
    [["colony", 0]],
  );
});

test("mode: a change of mode is written with the situation the policy was asked", () => {
  const g = small();
  const k = new Journal("mode");
  for (let n = 0; n < 30 * 10; n++) {
    g.tick(1 / 30);
    k.observe(g);
  }
  const e = k.events.find((x) => x.data?.situation);
  assert.ok(e, `a mode change with its situation (${k.events.length} mode events)`);
  assert.ok((MODES as readonly string[]).includes(e.data!.to as string));
  assert.match(e.text, /→/);
});

test("death: killed, old age and starved are told apart", () => {
  const { g, j, c } = watched("death");
  const a = firstAlive(c);
  c.kill(a);
  let b = a + 1;
  while (!c.alive[b]) b++;
  c.age[b] = c.lifespan[b] + 1;
  c.kill(b, false);
  let s = b + 1;
  while (!c.alive[s]) s++;
  c.energy[s] = 0;
  c.kill(s, false);
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.ant, e.text]),
    [
      [a, "killed"],
      [b, "died of old age"],
      [s, "starved"],
    ],
  );
});

test("birth: a slot that comes alive, or is reused with a new gen, is a birth", () => {
  const { g, j, c } = watched("birth,death");
  const i = firstAlive(c);
  c.gen[i]++; // the slot reused within one tick: the old ant died and a new one was born
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.cat, e.ant, e.gen]),
    [
      ["death", i, c.gen[i] - 1],
      ["birth", i, c.gen[i]],
    ],
  );
});

test("stance, queen and infection", () => {
  const { g, j, c } = watched("summary,infection");
  c.stance = "raid";
  c.killQueen();
  const i = firstAlive(c);
  c.load[i] = 0.5;
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.cat, e.text]),
    [
      ["stance", "forage → raid"],
      ["queen", "the queen died: the colony is orphaned"],
      ["infection", "infected (load 0.50)"],
    ],
  );
});

test("infection: a load that hovers at the line is one infection; below half of it, cleared", () => {
  const { g, j, c } = watched("infection");
  const i = firstAlive(c);
  for (const load of [0.06, 0.04, 0.06, 0.02]) {
    c.load[i] = load;
    j.observe(g);
  }
  assert.deepEqual(
    j.events.map((e) => e.text),
    ["infected (load 0.06)", "cleared (load 0.02)"],
  );
});

test("filters: ant= keeps only that ant's events; categories not asked for are not written", () => {
  const { g, j, c } = watched("death,ant=0");
  const other = (() => {
    for (let i = 1; i < c.n; i++) if (c.alive[i]) return i;
    throw new Error("no second ant");
  })();
  c.kill(other);
  c.stance = "defend";
  j.observe(g);
  assert.equal(j.events.length, 0);
  if (c.alive[0]) {
    c.kill(0);
    j.observe(g);
    assert.deepEqual(
      j.events.map((e) => e.ant),
      [0],
    );
  }
});

test("off observes nothing; the buffer keeps the newest `limit` events; note() and listeners", () => {
  const off = new Journal("off");
  const g = small();
  off.observe(g);
  assert.equal(off.on, false);
  assert.equal(off.written, 0);
  const j = new Journal("jev", 2);
  const heard: string[] = [];
  j.subscribe((e) => heard.push(e.text));
  for (const t of ["a", "b", "c"]) j.note("jev", 0, t);
  j.note("mode", 0, "not asked for");
  assert.deepEqual(
    j.events.map((e) => e.text),
    ["b", "c"],
  );
  assert.equal(j.written, 3);
  assert.deepEqual(heard, ["a", "b", "c"]);
  assert.match(formatJournalEvent(j.events[0]!), /^\s+0\.0s {2}c0 +jev +b$/);
});
