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

test("room comes back: a cap-frozen colony that holds the fungus wakes when a slot frees, once its T has passed", () => {
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
