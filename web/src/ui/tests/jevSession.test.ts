import assert from "node:assert/strict";
import { test } from "node:test";
import { AIMS } from "../../colony/index.ts";
import type { Backend } from "../backend.ts";
import { FIRST_DOCTRINES, JevSession, type JevClient } from "../jevSession.ts";

// The page's Jev session (ja-fnd.6.1): the lock, whether Jev may ask and whether a miss may start a run, decided synchronously from what is true now,
// and the snapshot React reads. A fake client stands in for the real one (colonyJev.ts), so nothing here reaches the network.

const caps = { capUsd: 100, capSeconds: 86400 };
type Phase = "off" | "running" | "stopped";
const server: Backend = { hasBackend: true, hasKey: true };
const noKey: Backend = { hasBackend: true, hasKey: false };

function fake() {
  const log: string[] = [];
  const listeners = new Set<(s: unknown) => void>();
  const c = {
    state: {
      phase: "off" as Phase,
      run: null as null | { stopReason: string | null; caps: typeof caps; budget?: unknown },
      lastError: null as string | null,
      hits: 0,
    },
    canAsk: true,
    wantsRun: null as (() => void) | null,
    subscribe(fn: (s: unknown) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    start: () => {
      log.push("start");
      return new Promise<void>((res) => (c.finishStart = res));
    },
    finishStart: () => {},
    stop: () => {
      log.push("stop");
      return Promise.resolve();
    },
    setDoctrineFor: (k: number, text: string) => void log.push(`doctrine ${k} ${text}`),
    setAim: (text: string, o?: { askNow?: boolean }) => void log.push(`aim ${text}${o?.askNow ? " now" : ""}`),
    explain: () => null,
    explainFungus: () => null,
    fungusAnswers: () => [],
    /** the client changes its state and tells its listeners, as #set does */
    tick(patch: Record<string, unknown>) {
      c.state = { ...c.state, ...patch } as typeof c.state;
      for (const fn of listeners) fn(c.state);
    },
    listeners,
  };
  const session = new JevSession(c as unknown as JevClient);
  const told: number[] = [];
  session.subscribe(() => told.push(1));
  return { c, session, log, told };
}
const microtasks = () => new Promise<void>((r) => setTimeout(r, 0));

test("until the backend answers, Jev is locked and may not ask; the snapshot is one object until a value in it changes", () => {
  const { c, session, told } = fake();
  const first = session.snapshot();
  assert.match(first.lock ?? "", /Checking/);
  assert.equal(c.canAsk, false, "told at construction, not after a render");
  assert.equal(session.snapshot(), first);
  assert.equal(told.length, 0);
});

test("the backend answering unlocks it at once: the lock, `canAsk` and the snapshot are right as setBackend returns, told once", () => {
  const { c, session, told } = fake();
  session.setBackend(server);
  assert.equal(session.snapshot().lock, null);
  assert.equal(session.lockNow(), null);
  assert.equal(c.canAsk, true);
  assert.equal(told.length, 1);
  const was = session.snapshot();
  session.setBackend({ ...server });
  assert.equal(session.snapshot(), was, "the same facts: the same snapshot");
  assert.equal(told.length, 1, "nobody told");
  session.setBackend(noKey);
  assert.match(session.snapshot().lock ?? "", /JEV_API_KEY/);
  assert.equal(c.canAsk, false);
  assert.equal(told.length, 2);
});

test("a tick of the client that changes nothing the page reads is not told to anyone", () => {
  const { c, session, told } = fake();
  session.setBackend(server);
  const close = session.open();
  const was = session.snapshot();
  const n = told.length;
  c.tick({ hits: 5 });
  c.tick({ hits: 6 });
  assert.equal(session.snapshot(), was);
  assert.equal(told.length, n, "counters tick, the page does not draw");
  c.tick({ phase: "running" });
  assert.equal(session.snapshot().phase, "running");
  assert.equal(told.length, n + 1, "a phase change is told");
  close();
});

test("new words are taken only while Jev can read them: a lock holds them back, a draft still shows, a restore and a daughter's are never held back", () => {
  const { session, log } = fake();
  session.setBackend(noKey);
  session.setAim({ id: "custom", text: "locked aim" });
  session.setDoctrine(0, { id: "custom", text: "locked doctrine" });
  assert.deepEqual(log, [], "nothing reached the client");
  assert.equal(session.snapshot().aim.text, AIMS[0]!.text);
  session.draftAim({ id: "custom", text: "typing" });
  assert.equal(session.snapshot().aim.text, "typing", "a draft is the page's");
  assert.deepEqual(log, []);
  session.foundWith(1, { id: "p", text: "her words" });
  session.restore({ id: "r", text: "saved aim" }, [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ]);
  assert.deepEqual(log, ["doctrine 1 her words", "aim saved aim", "doctrine 0 A", "doctrine 1 B"]);
  assert.deepEqual(
    session.snapshot().doctrines.map((d) => d.text),
    ["A", "B"],
  );
});

test("unlocked, the aim and a doctrine are taken: the aim with `askNow`, one doctrine replaced and the others the same objects", () => {
  const { session, log } = fake();
  session.setBackend(server);
  const before = session.snapshot().doctrines;
  session.setAim({ id: "custom", text: "my aim" });
  session.setDoctrine(1, { id: "custom", text: "my doctrine" });
  assert.deepEqual(log, ["aim my aim now", "doctrine 1 my doctrine"]);
  const after = session.snapshot().doctrines;
  assert.notEqual(after, before);
  assert.equal(after[1]!.text, "my doctrine");
  assert.equal(after[0], before[0], "the others untouched");
  assert.equal(session.snapshot().aim.text, "my aim");
});

test("the lock is as true as the moment: a lock that flips is met by the very next edit, with no render between", () => {
  const { session, log } = fake();
  session.setBackend(server);
  session.setAim({ id: "a", text: "one" });
  session.setBackend(noKey);
  session.setAim({ id: "b", text: "two" });
  session.setBackend(server);
  session.setAim({ id: "c", text: "three" });
  assert.deepEqual(log, ["aim one now", "aim three now"]);
});

test("a start by hand is on the wire at once: no lock while starting, not resumable, and resumable again when it ends", async () => {
  const { c, session, log } = fake();
  session.setBackend(server);
  assert.equal(session.snapshot().resumable, true);
  session.start();
  assert.deepEqual(log, ["start"]);
  assert.equal(session.snapshot().resumable, false);
  assert.equal(session.snapshot().lock, null);
  c.finishStart();
  await microtasks();
  assert.equal(session.snapshot().resumable, true);
});

test("a miss starts a run once: wantsRun starts one while Jev can run and none is on, a second miss before it begins starts none", async () => {
  const { c, session, log } = fake();
  session.setBackend(server);
  const close = session.open();
  assert.ok(c.wantsRun, "the client has something to call on a miss");
  c.wantsRun!();
  c.wantsRun!();
  c.tick({ hits: 1 }); // the client ticks between the miss and the start
  c.wantsRun!();
  await microtasks();
  assert.deepEqual(log, ["start"], "one run");
  c.tick({ phase: "running" });
  c.finishStart();
  await microtasks();
  c.wantsRun!();
  await microtasks();
  assert.deepEqual(log, ["start"], "a run is on: no second");
  close();
});

test("a run that its time cap ended may be started again by the next miss, and one that was stopped or refused may not", async () => {
  const { c, session, log } = fake();
  session.setBackend(server);
  const close = session.open();
  c.tick({ phase: "stopped", run: { stopReason: "time-cap", caps } });
  assert.equal(session.snapshot().lock, null, "a time cap leaves it unlocked");
  c.wantsRun!();
  await microtasks();
  assert.deepEqual(log, ["start"]);
  c.finishStart();
  await microtasks();
  c.tick({ phase: "stopped", run: { stopReason: "user", caps } });
  assert.match(session.snapshot().lock ?? "", /stopped/);
  c.wantsRun!();
  await microtasks();
  assert.deepEqual(log, ["start"], "Stop: no restart by a miss");
  c.tick({ phase: "stopped", run: { stopReason: "spend-cap", caps } });
  c.wantsRun!();
  await microtasks();
  assert.deepEqual(log, ["start"], "the cap: none");
  close();
});

test("a miss starts no run while locked (no key), and none before the backend has answered", async () => {
  const a = fake();
  const closeA = a.session.open();
  a.c.wantsRun!();
  await microtasks();
  assert.deepEqual(a.log, [], "still checking");
  a.session.setBackend(noKey);
  a.c.wantsRun!();
  await microtasks();
  assert.deepEqual(a.log, [], "no key");
  closeA();
});

test("open follows the client and ends cleanly: after its end the client has no one to call on a miss and its ticks are not followed", () => {
  const { c, session } = fake();
  session.setBackend(server);
  const close = session.open();
  assert.equal(c.listeners.size, 1);
  close();
  assert.equal(c.wantsRun, null);
  assert.equal(c.listeners.size, 0);
  c.tick({ phase: "running" });
  assert.equal(session.snapshot().phase, "off", "not followed after its end");
  // a second open (StrictMode mounts twice) follows again
  const again = session.open();
  assert.equal(session.snapshot().phase, "running", "caught up on open");
  again();
});

test("the first words are given to the client: each colony's doctrine and the first aim", () => {
  const { session, log } = fake();
  session.initWords();
  assert.equal(log.length, FIRST_DOCTRINES.length + 1);
  assert.deepEqual(
    log.slice(0, FIRST_DOCTRINES.length),
    FIRST_DOCTRINES.map((d, k) => `doctrine ${k} ${d.text}`),
  );
  assert.equal(log.at(-1), `aim ${AIMS[0]!.text}`);
});

test("a miss's start is deferred to a microtask: the client's start is not called inside the miss, from the game's tick", async () => {
  const { c, session, log } = fake();
  session.setBackend(server);
  const close = session.open();
  c.wantsRun!();
  assert.deepEqual(log, [], "nothing yet, inside the miss");
  await microtasks();
  assert.deepEqual(log, ["start"]);
  close();
});

test("the words the page keeps are its own copies: a daughter's and a restore's are copied, not shared with the caller", () => {
  const { session } = fake();
  const d = { id: "p", text: "her words" };
  session.foundWith(1, d);
  assert.notEqual(session.snapshot().doctrines[1], d);
  assert.deepEqual(session.snapshot().doctrines[1], d);
  const ds = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ];
  session.restore({ id: "r", text: "saved" }, ds);
  assert.notEqual(session.snapshot().doctrines[0], ds[0]);
  assert.deepEqual(session.snapshot().doctrines, ds);
});

test("a change of phase alone is told, even where the lock and whether it can be resumed stay as they were (off to a time-capped stop)", () => {
  const { c, session, told } = fake();
  session.setBackend(server);
  const close = session.open();
  const was = session.snapshot();
  const n = told.length;
  c.tick({ phase: "stopped", run: { stopReason: "time-cap", caps } });
  const now = session.snapshot();
  assert.equal(now.lock, was.lock);
  assert.equal(now.resumable, was.resumable);
  assert.notEqual(now, was);
  assert.equal(now.phase, "stopped");
  assert.equal(told.length, n + 1);
  close();
});

test("the daily budget the page loaded with is in the snapshot, and a different one is told", () => {
  const { session, told } = fake();
  const a = { day: "2026-11-23", usdPerDay: 0.1, spentUsd: 0.01, remainingUsd: 0.09 };
  session.setBackend({ ...server, budget: a });
  assert.equal(session.snapshot().backendBudget, a);
  const n = told.length;
  const b = { ...a, spentUsd: 0.02, remainingUsd: 0.08 };
  session.setBackend({ ...server, budget: b });
  assert.equal(session.snapshot().backendBudget, b);
  assert.equal(told.length, n + 1);
  session.setBackend(server);
  assert.equal(session.snapshot().backendBudget, null);
});

test("the setters see the lock with a start on the wire: after Resume from a Stop, new words are taken, and refused again once it ends without a run", async () => {
  const { c, session, log } = fake();
  session.setBackend(server);
  c.tick({ phase: "stopped", run: { stopReason: "user", caps } });
  session.setAim({ id: "a", text: "refused: stopped" });
  assert.deepEqual(log, [], "stopped by the player: refused");
  session.start(); // Resume
  session.setAim({ id: "b", text: "taken: starting" });
  session.setDoctrine(0, { id: "b", text: "taken too" });
  assert.deepEqual(log, ["start", "aim taken: starting now", "doctrine 0 taken too"], "starting: the lock is gone");
  c.finishStart();
  await microtasks();
  session.setAim({ id: "c", text: "refused again" });
  assert.deepEqual(log, ["start", "aim taken: starting now", "doctrine 0 taken too"], "the start ended, still stopped: refused");
});

test("stop ends the run on the client", () => {
  const { session, log } = fake();
  session.stop();
  assert.deepEqual(log, ["stop"]);
});
