import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
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
  assert.deepEqual([...parseJournalSpec("detail").categories], ["colony", "queen", "stance", "jev", "birth", "death", "infection", "dig"]);
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

test("dig: a foraging dig's start, and its end with food in the jaws or with time up (ja-16rp)", () => {
  const { g, j, c } = watched("dig");
  const i = firstAlive(c);
  c.digBout[i] = 30;
  j.observe(g);
  c.digBout[i] = 0;
  c.carrying[i] = 1;
  j.observe(g);
  const k = firstAlive({ ...c, alive: c.alive.map((a, n) => (n === i ? 0 : a)) } as typeof c);
  c.digBout[k] = 30;
  j.observe(g);
  c.digBout[k] = 0;
  j.observe(g);
  const texts = j.events.map((e) => `${e.ant} ${e.text}`);
  assert.equal(texts.length, 4, texts.join("; "));
  assert.match(texts[0]!, new RegExp(`^${i} foraging dig begins \\(-?\\d+ rows down\\)$`));
  assert.match(texts[1]!, new RegExp(`^${i} foraging dig ends: food in its jaws`));
  assert.match(texts[2]!, new RegExp(`^${k} foraging dig begins`));
  assert.match(texts[3]!, new RegExp(`^${k} foraging dig ends: time up`));
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

test("birth: a slot reused with a new gen is the old ant's death and a birth, with no mode change for the newborn", () => {
  const { g, j, c } = watched("birth,death,mode");
  const i = firstAlive(c);
  // The slot reused within one tick: the old ant died and a new one was born, in another mode than the old one's.
  c.gen[i]++;
  c.mode[i] = (c.mode[i] + 1) % MODES.length;
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.cat, e.ant, e.gen, e.text]),
    [
      ["death", i, c.gen[i] - 1, "died"],
      ["birth", i, c.gen[i], `born (${MODES[c.mode[i]]})`],
    ],
  );
});

test("colony=<k>: only that colony's events, and the game's own", () => {
  const g = new Game(generateSideWorld(3, { ...SMALL_SIDE, nestCount: 2 }), { antCount: 8 }, mulberry32(3));
  assert.equal(g.colonies.length, 2);
  const j = new Journal("stance,colony=1");
  j.observe(g);
  j.events.length = 0;
  g.colonies[0]!.stance = "raid";
  g.colonies[1]!.stance = "defend";
  j.note("stance", -1, "the game's own");
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.colony, e.text]),
    [
      [-1, "the game's own"],
      [1, "forage → defend"],
    ],
  );
});

test("fallen, and the outcome: a colony with no ants and no brood to come is beaten; the outcome follows within a second", () => {
  const g = new Game(generateSideWorld(3, { ...SMALL_SIDE, nestCount: 2 }), { antCount: 8 }, mulberry32(3));
  const j = new Journal("colony");
  j.observe(g);
  j.events.length = 0;
  const c = g.colonies[1]!;
  for (let i = 0; i < c.n; i++) if (c.alive[i]) c.kill(i);
  c.brood.items.length = 0;
  ticks(g, 1);
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.colony, e.text]),
    [[1, "fallen"]],
  );
  ticks(g, 31);
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => [e.colony, e.text]),
    [
      [1, "fallen"],
      [-1, "outcome: playing → fallen"],
    ],
  );
});

test("founded: a colony that appears mid-game is written as founded, once", () => {
  // The whole one world: the small one has no room beyond its ends for a founding.
  const g = new Game(generateOneWorld(2), { antCount: 8, rivalAnts: 8, regrow: 0 }, gameRng(2));
  const j = new Journal("colony");
  j.observe(g);
  assert.deepEqual(
    j.events.map((e) => e.text),
    ["8 ants", "8 ants"],
  );
  const k = g.foundBeyond("end", 5);
  j.observe(g);
  j.observe(g);
  assert.deepEqual(
    j.events.slice(2).map((e) => [e.colony, e.text]),
    [[k, `founded with ${g.colonies[k]!.population} ants`]],
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
  const none = new Journal("jev", 0);
  let n = 0;
  none.subscribe(() => n++);
  none.note("jev", 0, "x");
  assert.deepEqual([none.events.length, none.written, n], [0, 1, 1], "limit 0 (exp --log): kept nowhere, heard by the listener");
  assert.match(formatJournalEvent(j.events[0]!), /^\s+0\.0s {2}c0 +jev +b$/);
});
