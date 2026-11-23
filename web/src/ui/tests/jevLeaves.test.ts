import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { JevSession, type JevClient } from "../jevSession.ts";

// The leaves of the page take Jev from the context, not from props (ja-fnd.6.1, docs/refactor.md S5.1): each draws again only when the value it selected
// changes, and nothing is forwarded through the components in between.

const SRC = join(new URL("../../", import.meta.url).pathname);
const components = [
  ...readdirSync(join(SRC, "ui"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `ui/${f}`),
  "ColonyApp.tsx",
];

/** A component taking Jev as a prop: `jev: Jev` or `jev: JevView` in a props type, `{ jev }` destructured, or `jev={…}` in JSX. */
const PROP = /\bjev\s*:\s*(Jev\b|JevView\b|ReturnType<typeof use)|\{\s*jev\s*\}\s*:|\bjev=\{/;

test("no component takes `jev` as a prop: the leaves read the session from the context", () => {
  const found = components.flatMap((file) =>
    readFileSync(join(SRC, file), "utf8")
      .split("\n")
      .map((l, i) => ({ file, n: i + 1, l }))
      .filter(({ l }) => PROP.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.n}: ${f.l.trim()}`),
    [],
  );
});

/** A component reading the session's live lock: `session.lockNow()` (or the old getter, `session.lock`, `jev.session.lock`). It reads once and never draws again. */
const LIVE_LOCK = /\b(session|jev\.session)\.(lockNow\(|lock\b)/;

test("no component reads the session's live lock: it takes `useJev((s) => s.lock)`, which draws again when the lock flips", () => {
  const found = components.flatMap((file) =>
    readFileSync(join(SRC, file), "utf8")
      .split("\n")
      .map((l, i) => ({ file, n: i + 1, l }))
      .filter(({ l }) => LIVE_LOCK.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
  );
  assert.deepEqual(
    found.map((f) => `${f.file}:${f.n}: ${f.l.trim()}`),
    [],
  );
  for (const l of ["const lock = session.lock;", "if (session.lockNow() !== null) return;", "const l = jev.session.lock;"])
    assert.match(l, LIVE_LOCK, l);
  for (const l of ["const lock = useJev((s) => s.lock);", "const lock = jev.lock; // the page's view: the snapshot's"])
    assert.doesNotMatch(l, LIVE_LOCK, l);
});

test("the guard sees each way of taking it as a prop, and not the context's hooks", () => {
  for (const l of [
    "  jev: Jev;",
    "  jev: JevView;",
    "function Aim({ jev }: { jev: ReturnType<typeof useColonyJev> }) {",
    "<Aim jev={jev} />",
    "export function JevCard({ jev }: Props) {",
  ])
    assert.match(l, PROP, l);
  for (const l of ["const jev = useJevSession();", "const lock = useJev((s) => s.lock);", "const jev = useJevView();"])
    assert.doesNotMatch(l, PROP, l);
});

test("the session's commands are bound: a leaf hands them to an event handler (onClick={session.start}) and they still reach the client", () => {
  const log: string[] = [];
  const client = {
    state: { phase: "off", run: null, lastError: null },
    canAsk: true,
    wantsRun: null,
    subscribe: () => () => {},
    start: () => (log.push("start"), Promise.resolve()),
    stop: () => (log.push("stop"), Promise.resolve()),
    setDoctrineFor: () => {},
    setAim: () => {},
    explain: (s: unknown, k: number) => (log.push(`explain ${String(s)} ${k}`), { mode: "forage", by: "local" }),
    explainFungus: (s: unknown) => (log.push(`explainFungus ${String(s)}`), { answer: "a", by: "local" }),
    fungusAnswers: () => (log.push("fungusAnswers"), []),
  };
  const session = new JevSession(client as unknown as JevClient);
  session.setBackend({ hasBackend: true, hasKey: true });
  const { start, stop, explain, explainFungus, fungusAnswers } = session;
  start();
  stop();
  explain("s" as never, 2);
  explainFungus("f" as never);
  fungusAnswers();
  assert.deepEqual(log, ["start", "stop", "explain s 2", "explainFungus f", "fungusAnswers"]);
});

test("the page reads no Jev value that changes as the player types: no whole-snapshot view, no aim or doctrines read in a component body", () => {
  const page = readFileSync(join(SRC, "ColonyApp.tsx"), "utf8");
  assert.doesNotMatch(page, /useJevView/);
  assert.doesNotMatch(page, /\bjev\.(aim|doctrines|phase|lock)\b/);
  // Page's own body: a selector of the aim or doctrines, or a snapshot read of them, would bring back the draw per keystroke (MotherPen, a leaf of its own,
  // selects the doctrines on purpose).
  const body = page.slice(page.indexOf("function Page("), page.indexOf("\nfunction ", page.indexOf("function Page(") + 1));
  assert.ok(body.length > 1000, "found Page's body");
  assert.doesNotMatch(body, /useJev\(\s*\(?\s*s\s*\)?\s*=>\s*s\.(aim|doctrines)\b/);
  assert.doesNotMatch(body, /snapshot\(\)\s*\.(aim|doctrines)\b/);
  assert.doesNotMatch(readFileSync(join(SRC, "ui/useFlight.ts"), "utf8"), /\bjev\.(aim|lock)\b|JevView/);
});
