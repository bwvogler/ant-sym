import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ColonyJev } from "../colonyJev.ts";

// What the page reads of the Jev client's state (ja-fnd.6.1, docs/refactor.md S5.1). The client ticks its state on every batch, and a component that
// holds the whole state draws again on every tick: `Page` did, until it read only the few values it needs (useColonyJev's selectors). So no component reads
// `jev.state` as it goes by; a reader that wants the whole state takes it with useJevState(client), which draws that reader alone.

const SRC = join(new URL("../../", import.meta.url).pathname);
const pages = [
  ...readdirSync(join(SRC, "ui"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `ui/${f}`),
  "ColonyApp.tsx",
  "ui/useFlight.ts",
  "ui/useBuilder.ts",
  "ui/useKeys.ts",
];

test("no component or page hook reads `jev.state`: the whole state comes from useJevState(jev.client)", () => {
  const reads = pages.flatMap((file) =>
    readFileSync(join(SRC, file), "utf8")
      .split("\n")
      .map((l, i) => ({ file, n: i + 1, l }))
      .filter(({ l }) => /\bjev\.state\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
  );
  assert.deepEqual(
    reads.map((r) => `${r.file}:${r.n}: ${r.l.trim()}`),
    [],
  );
});

test("the guard sees a read, and not a comment", () => {
  assert.match("const running = jev.state.phase === 'running';", /\bjev\.state\b/);
  assert.doesNotMatch("const state = useJevState(jev.client);", /\bjev\.state\b/);
});

test("the client's state is one object until it changes, and a new one each change: what useSyncExternalStore needs of a snapshot", () => {
  const jev = new ColonyJev();
  const a = jev.state;
  assert.equal(jev.state, a, "the same object while nothing changes");
  const seen: unknown[] = [];
  const off = jev.subscribe((s) => seen.push(s));
  jev.setAim("one aim");
  assert.ok(seen.length >= 1, "told");
  assert.notEqual(jev.state, a, "a new state");
  assert.equal(seen.at(-1), jev.state, "the last one it told is the current one");
  const told = seen.length;
  off();
  jev.setAim("another aim");
  assert.equal(seen.length, told, "no longer told after the unsubscribe");
  jev.dispose();
});
