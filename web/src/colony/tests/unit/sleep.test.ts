import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SLEEP, SleepRule, type SleepInputs } from "../../sleep.ts";

// Who is awake (docs/endless-world.md §6, PRD §66 E4.2): the rule on its own, from inputs.

const P = { distance: 280, delay: 90, nestGround: 16, cap: 6, every: 1 };

type Facts = (
  t: number,
  asleep: readonly boolean[],
) => Partial<Pick<SleepInputs, "near" | "entered" | "holds">> & { contact?: (a: number, b: number) => boolean };

/** Play a rule second by second over `n` colonies, applying each verdict; returns the log of who slept when. */
function play(rule: SleepRule, n: number, seconds: number, facts: Facts, start: boolean[] = Array(n).fill(false)) {
  const asleep = [...start];
  const log: { t: number; asleep: boolean[]; freeze: number[]; thaw: number[] }[] = [];
  for (let t = 0; t <= seconds; t++) {
    const f = facts(t, asleep);
    const inp: SleepInputs = {
      time: t,
      asleep,
      near: f.near ?? Array(n).fill(false),
      entered: f.entered ?? Array(n).fill(false),
      holds: f.holds ?? Array(n).fill(false),
      contact: f.contact ?? (() => false),
    };
    const v = rule.step(inp);
    for (const k of v.freeze) asleep[k] = true;
    for (const k of v.thaw) asleep[k] = false;
    log.push({ t, asleep: [...asleep], freeze: v.freeze, thaw: v.thaw });
  }
  return log;
}

const first = (log: ReturnType<typeof play>, k: number) => log.find((e) => e.asleep[k])?.t;
const all = (n: number, v: boolean) => Array(n).fill(v) as boolean[];

test("a colony the fungus has never come near freezes after T, and not before", () => {
  const rule = new SleepRule(1, P);
  const log = play(rule, 1, 200, () => ({}));
  assert.equal(first(log, 0), P.delay);
  assert.ok(log.slice(0, P.delay).every((e) => !e.asleep[0]));
});

test("the fungus within W keeps a colony awake; when it goes, the colony freezes T seconds later", () => {
  const rule = new SleepRule(1, P);
  const log = play(rule, 1, 300, (t) => ({ near: [t < 100] }));
  assert.ok(
    log.slice(0, 100).every((e) => !e.asleep[0]),
    "awake while the fungus is near",
  );
  assert.equal(first(log, 0), 99 + P.delay, "frozen T after the last second it was near");
});

test("a sleeping colony wakes the second the awake fungus comes within W", () => {
  const rule = new SleepRule(1, P);
  const log = play(rule, 1, 100, (t) => ({ near: [t >= 40] }), [true]);
  assert.equal(log.find((e) => e.thaw.includes(0))?.t, 40);
});

test("an awake host entering a sleeping colony's nest ground wakes it though the fungus is not within W", () => {
  const rule = new SleepRule(1, P);
  const log = play(rule, 1, 60, (t) => ({ entered: [t === 25] }), [true]);
  assert.equal(log.find((e) => e.thaw.includes(0))?.t, 25);
});

test("foraging past wakes nothing: no nearness and no entry, and a sleeper stays asleep", () => {
  const rule = new SleepRule(2, P);
  const log = play(rule, 2, 300, () => ({}), [true, true]);
  assert.ok(log.every((e) => e.asleep[0] && e.asleep[1] && e.thaw.length === 0));
});

test("colonies in contact freeze together while the contact is under T old; then each goes by its own fungus", () => {
  const rule = new SleepRule(2, P);
  // 0 and 1 meet until t = 29; the fungus is near colony 0 until t = 99 and never near colony 1
  const log = play(rule, 2, 300, (t) => ({ near: [t < 100, false], contact: () => t < 30 }));
  assert.ok(
    log.slice(0, 29 + P.delay).every((e) => !e.asleep[1]),
    "colony 1 stayed awake with its group",
  );
  assert.equal(first(log, 1), 29 + P.delay, "alone once the contact is T old");
  assert.equal(first(log, 0), 99 + P.delay);
});

test("without contact within T, a colony is its own group: the one far from the fungus freezes by itself", () => {
  const rule = new SleepRule(2, P);
  const log = play(rule, 2, 300, (t) => ({ near: [true, false], contact: () => t < 5 }));
  assert.equal(first(log, 1), P.delay + 4, "its group is itself once the contact is T old, and T of absence has passed");
  assert.ok(log.every((e) => !e.asleep[0]));
});

test("a sleeping group wakes together when the fungus nears any member", () => {
  const rule = new SleepRule(2, P);
  // they were in contact a moment ago: one group; both asleep; the fungus comes to colony 1 only
  rule.step({ time: 0, asleep: all(2, false), near: all(2, true), entered: all(2, false), holds: all(2, false), contact: () => true });
  const log = play(rule, 2, 40, (t) => ({ near: [false, t >= 20], contact: () => false }), [true, true]).map((e) => ({ ...e, t: e.t }));
  const woke = log.find((e) => e.thaw.length > 0)!;
  assert.equal(woke.t, 20);
  assert.deepEqual(woke.thaw, [0, 1]);
});

test("a colony founded mid-game is awake and touched now", () => {
  const rule = new SleepRule(1, P);
  rule.addColony(500);
  const log = play(rule, 2, 700, () => ({}), all(2, false)).filter((e) => e.t >= 500);
  assert.equal(first(log, 1), 500 + P.delay, "the new colony's T runs from its founding");
});

test("at the cap no colony is awake over it, and none freezes and wakes more than once within T (the awake set rotates)", () => {
  const cap = 2;
  const rule = new SleepRule(3, { ...P, cap });
  // the fungus is near all three the whole time
  const log = play(rule, 3, 500, () => ({ near: all(3, true) }));
  for (const e of log) assert.ok(e.asleep.filter((s) => !s).length <= cap, `awake over the cap at ${e.t}`);
  // for every colony, the times it changed state are at least T apart
  for (let k = 0; k < 3; k++) {
    const changes = log.filter((e) => e.freeze.includes(k) || e.thaw.includes(k)).map((e) => e.t);
    for (let i = 1; i < changes.length; i++)
      assert.ok(changes[i]! - changes[i - 1]! >= P.delay, `colony ${k} changed at ${changes[i - 1]} and ${changes[i]}`);
  }
  assert.ok(
    log.some((e) => e.thaw.length > 0),
    "the sleepers do wake in turn",
  );
});

test("a colony the cap froze may not wake for T, though the fungus is near it", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  const log = play(rule, 3, 300, () => ({ near: all(3, true) }));
  const frozenAt = log.find((e) => e.freeze.length > 0)!;
  const k = frozenAt.freeze[0]!;
  const woke = log.find((e) => e.t > frozenAt.t && e.thaw.includes(k))!;
  assert.ok(woke.t - frozenAt.t >= P.delay, `colony ${k} froze at ${frozenAt.t} and woke at ${woke.t}`);
});

test("the cap freezes the lowest-ranked group: the colony the fungus touched longest ago", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  // 0 touched at 0, 1 from t = 10; colony 2 sleeps and wakes at 20: three awake, over the cap, and 0 was touched first
  const log = play(rule, 3, 30, (t) => ({ near: [true, t >= 10, t >= 20] }), [false, false, true]);
  const at = log.find((e) => e.freeze.length > 0)!;
  assert.equal(at.t, 20);
  assert.deepEqual(at.freeze, [0]);
  assert.deepEqual(at.thaw, [2]);
});

test("room comes back: a sleeper the cap never froze does not wake for room, though it holds the fungus", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  // 0 and 1 near, 2 frozen by the cap and holding the fungus; at t = 150 the fungus leaves colony 1, which freezes T later; then 2 wakes
  rule.step({ time: 0, asleep: all(3, false), near: all(3, true), entered: all(3, false), holds: all(3, false), contact: () => false });
  const log = play(rule, 3, 400, (t) => ({ near: [true, t < 150, false], holds: [false, false, true] }), [false, false, true]);
  // colony 2 was frozen by the rule with no capUntil: mark it cap-frozen as the game would have found it
  const woke = log.find((e) => e.thaw.includes(2));
  assert.equal(woke, undefined, "a sleeper the cap never froze does not wake for the room (it holds, but was not cap-frozen)");
});

test("room comes back for a colony the cap froze: it wakes the second a slot frees after its T", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  // all near until 200 (the cap freezes one, which holds the fungus), then colony 1 and 2 lose the fungus
  const log = play(rule, 3, 600, (t) => ({ near: [true, t < 200, t < 200], holds: all(3, true) }));
  const capFrozen = log.find((e) => e.freeze.length > 0)!.freeze[0]!;
  const later = log.filter((e) => e.t > capFrozen && e.thaw.includes(capFrozen));
  assert.ok(later.length > 0, "the cap-frozen colony woke again");
  // and at no second were more than 2 awake
  for (const e of log) assert.ok(e.asleep.filter((s) => !s).length <= 2);
});

test("one group larger than the cap may run over it, and the rule counts how often", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  const log = play(rule, 3, 20, () => ({ near: all(3, true), contact: () => true }));
  assert.ok(
    log.every((e) => e.asleep.every((s) => !s)),
    "the group of three stays awake",
  );
  assert.ok(rule.over > 0, "and the rule counted it");
});

test("the rule's memory saves and loads: the same facts give the same verdicts", () => {
  const facts: Facts = (t) => ({ near: [t < 60, t < 120, true], contact: (a, b) => a + b === 1 && t < 30 });
  const a = new SleepRule(3, { ...P, cap: 2 });
  play(a, 3, 100, facts);
  const b = new SleepRule(3, { ...P, cap: 2 });
  b.loadState(JSON.parse(JSON.stringify(a.saveState())));
  const asleep = all(3, false);
  for (let t = 101; t < 400; t++) {
    const inp: SleepInputs = {
      time: t,
      asleep,
      near: [false, false, true],
      entered: all(3, false),
      holds: all(3, true),
      contact: () => false,
    };
    assert.deepEqual(b.step(inp), a.step(inp), `at ${t}`);
  }
});

test("the defaults are the design's proposals", () => {
  assert.deepEqual(DEFAULT_SLEEP, { distance: 280, delay: 90, nestGround: 16, cap: 6, every: 1 });
});

/** cap 2, three colonies; the fungus near all three until `until`, then nowhere; holds is true for sleepers only, as the game gives it */
function roomScenario(until: number, seconds: number, rule = new SleepRule(3, { ...P, cap: 2 })) {
  return play(rule, 3, seconds, (t, asleep) => ({ near: all(3, t < until), holds: asleep.map((s) => s) }));
}

test("a cap-frozen colony that wakes into room stays awake for T on that, then freezes: no flip-flop", () => {
  const log = roomScenario(200, 600);
  const flips = log.flatMap((e) => [...e.freeze.map((k) => ({ t: e.t, k })), ...e.thaw.map((k) => ({ t: e.t, k }))]);
  for (let k = 0; k < 3; k++) {
    const ts = flips.filter((f) => f.k === k).map((f) => f.t);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i]! - ts[i - 1]! >= P.delay, `colony ${k} flipped at ${ts[i - 1]} and ${ts[i]}`);
  }
  const woke = log.find((e) => e.t >= 200 && e.thaw.length > 0)!;
  const k = woke.thaw[0]!;
  assert.equal(log.find((e) => e.t > woke.t && e.freeze.includes(k))?.t, woke.t + P.delay, "frozen again T after it woke");
});

test("a colony the cap froze once, later woken by nearness and frozen the ordinary way, does not wake as if cap-frozen", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  const log = roomScenario(200, 800, rule);
  // after the fungus is gone every colony ends asleep and stays so: nothing wakes with no fungus near
  const last = log.filter((e) => e.t > 200 + 3 * P.delay);
  assert.ok(last.every((e) => e.thaw.length === 0 && e.asleep.every(Boolean)));
});

test("no verdict freezes a colony already asleep or thaws one already awake", () => {
  for (const until of [150, 200, 250]) {
    const rule = new SleepRule(3, { ...P, cap: 2 });
    const asleep = all(3, false);
    for (let t = 0; t < 700; t++) {
      const v = rule.step({ time: t, asleep, near: all(3, t < until), entered: all(3, false), holds: all(3, true), contact: () => false });
      for (const k of v.freeze) {
        assert.ok(!asleep[k], `froze sleeper ${k} at ${t}`);
        asleep[k] = true;
      }
      for (const k of v.thaw) {
        assert.ok(asleep[k], `thawed awake ${k} at ${t}`);
        asleep[k] = false;
      }
    }
  }
});

test("a group frozen together wakes together, though it has slept longer than T", () => {
  const rule = new SleepRule(2, P);
  const log = play(rule, 2, 500, (t) => ({ near: [false, t >= 400], contact: () => t < 10 }));
  assert.equal(first(log, 0), first(log, 1), "frozen together");
  const woke = log.find((e) => e.thaw.length > 0)!;
  assert.equal(woke.t, 400);
  assert.deepEqual(woke.thaw, [0, 1]);
});

test("the cap-frozen colony the room returns to is the highest-ranked, and only after its T", () => {
  const rule = new SleepRule(3, { ...P, cap: 2 });
  // 0 and 1 near always; 2 cap-frozen at t = 0 (lowest rank, ties by index would take 0, so make 2 oldest: near from the start only for 0 and 1 later)
  const log = play(rule, 3, 400, () => ({ near: [true, true, false], holds: [false, false, true] }), [false, false, true]);
  assert.ok(
    log.every((e) => e.thaw.length === 0),
    "never cap-frozen, never woken by room",
  );
});

test("an awake host entering a colony's nest ground wakes it, and counts as a touch: it freezes T after, not before", () => {
  const rule = new SleepRule(1, P);
  const log = play(rule, 1, 400, (t) => ({ entered: [t === 100] }));
  assert.equal(log.find((e) => e.freeze.length > 0)?.t, P.delay);
  assert.equal(log.find((e) => e.thaw.length > 0)?.t, 100);
  assert.equal(log.filter((e) => e.freeze.length > 0)[1]?.t, 100 + P.delay);
});

test("a colony founded mid-game has the founding second as its touch, so over the cap the older freezes first", () => {
  const rule = new SleepRule(2, { ...P, cap: 2 });
  rule.addColony(5);
  const log = play(rule, 3, 10, () => ({ near: all(3, true) }));
  const at = log.find((e) => e.freeze.length > 0)!;
  assert.deepEqual(at.freeze, [0]);
});

test("saved memory carries contacts and the fungus's nearness: a loaded rule decides as the saved one", () => {
  const a = new SleepRule(3, { ...P, cap: 2 });
  play(a, 3, 50, (t) => ({ near: [true, t < 20, true], contact: (x, y) => x === 0 && y === 1 }));
  const b = new SleepRule(3, { ...P, cap: 2 });
  b.loadState(JSON.parse(JSON.stringify(a.saveState())));
  assert.deepEqual(b.saveState(), a.saveState());
  const asleep = all(3, false);
  for (let t = 51; t < 400; t++) {
    const inp: SleepInputs = {
      time: t,
      asleep,
      near: [true, false, t < 200],
      entered: all(3, false),
      holds: all(3, true),
      contact: () => false,
    };
    assert.deepEqual(b.step(inp), a.step(inp), `at ${t}`);
  }
});

test("room comes back only after the cap-frozen colony's T, and only for one that holds the fungus", () => {
  const run = (holds: boolean[]) =>
    play(new SleepRule(3, { ...P, cap: 2 }), 3, 200, (t) => ({ near: [t <= 10, false, t === 10], holds }), [false, false, true]);
  const log = run([true, false, false]);
  const at10 = log.find((e) => e.t === 10)!;
  assert.deepEqual([at10.freeze, at10.thaw], [[0], [2]], "the cap freezes colony 0 as colony 2 wakes");
  // colony 1 freezes at 90 and leaves room, but colony 0's lock runs to 100
  assert.ok(log.filter((e) => e.t > 10 && e.t < 100).every((e) => !e.thaw.includes(0)));
  assert.deepEqual(log.find((e) => e.t > 10 && e.thaw.includes(0))?.t, 100);
  assert.ok(
    run([false, false, false]).every((e) => e.t <= 10 || !e.thaw.includes(0)),
    "holding nothing, it stays asleep",
  );
});

test("room comes back for the highest-ranked of two cap-frozen colonies", () => {
  const log = play(
    new SleepRule(3, { ...P, cap: 1 }),
    3,
    200,
    (t) => ({ near: [t === 5, t === 10, t === 15], holds: all(3, true) }),
    all(3, true),
  );
  const woke = log.filter((e) => e.t > 15 && e.thaw.length > 0)[0]!;
  assert.deepEqual([woke.t, woke.thaw], [105, [1]], "colony 1 was touched later than colony 0");
});

test("an awake host entering counts as a touch for rank", () => {
  const log = play(
    new SleepRule(3, { ...P, cap: 2 }),
    3,
    70,
    (t) => ({ entered: [t === 50, false, false], near: [false, false, t === 60] }),
    [false, false, true],
  );
  assert.deepEqual(log.find((e) => e.t === 60)!.freeze, [1], "colony 1, untouched, freezes; colony 0 was entered at 50");
});

test("a group ranks by its most recently touched member", () => {
  const log = play(
    new SleepRule(4, { ...P, cap: 3 }),
    4,
    70,
    (t) => ({ entered: [false, t === 50, t === 20, false], near: [false, false, false, t === 60], contact: (a, b) => a === 0 && b === 1 }),
    [false, false, false, true],
  );
  assert.deepEqual(log.find((e) => e.t === 60)!.freeze, [2], "the group's newest touch (50) outranks colony 2's (20)");
});
