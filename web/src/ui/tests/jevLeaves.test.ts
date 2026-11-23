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
