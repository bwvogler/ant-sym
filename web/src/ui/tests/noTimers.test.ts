import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A component that draws afresh on a schedule takes its pace from the game loop's stats ticks (useSimTick or useGameRead, ui/session.ts),
// not from a timer of its own (ja-fnd.6.1): the loop stands still with a hidden tab, and there is one clock. This holds the line for the
// page's components. Rather than a list of the shapes a forced redraw can take, every timer or frame request in them is named below, with
// what it is for; a new one fails until it is named (or a hook is used), and a name that no longer matches a line fails too.

const SRC = join(new URL("../../", import.meta.url).pathname);

const components = [
  ...readdirSync(join(SRC, "ui"))
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => `ui/${f}`),
  "ColonyApp.tsx",
];

/** The call sites of anything that makes a component draw or act on a schedule. */
const TIMING = /\b(setInterval|setTimeout|requestAnimationFrame|useReducer)\b/;

/** Each timer the page has: the file, the line it sits on (a distinct part of it), and why it is not a redraw of the game. */
const NAMED: { file: string; line: string; why: string }[] = [
  { file: "ui/Notices.tsx", line: "tick((n) => n + 1), 30_000", why: "the bell's ages are wall-clock minutes, which no stats tick tells" },
  { file: "ui/Toasts.tsx", line: "dismissToast(t.id), TOAST_MS", why: "a toast's own life, in wall-clock time" },
  { file: "ui/Toasts.tsx", line: "dismissToast(t.id), 150", why: "a toast's exit animation" },
  { file: "ColonyApp.tsx", line: "setDemo(null), 1700", why: "a tool demo's own length, in wall-clock time" },
  {
    file: "ColonyApp.tsx",
    line: "const timer = setInterval(() => {",
    why: "the builder's watch of its ants: it acts, it does not redraw by itself",
  },
  {
    file: "ui/useSpecimens.ts",
    line: "const t = setInterval(() => {",
    why: "the specimens' watch for the dead: it sets state only when one died",
  },
  { file: "ColonyApp.tsx", line: "void save(AUTOSAVE), AUTOSAVE_MS", why: "the autosave, in wall-clock time" },
  // The engine's own clocks (not components: the page's loop, and Jev's calls); named so that a new one in a hook or module is seen.
  { file: "ui/colonyJev.ts", line: "#timer: ReturnType<typeof setInterval>", why: "Jev's batching cycle: its field" },
  {
    file: "ui/colonyJev.ts",
    line: "this.#timer = setInterval(",
    why: "Jev's batching cycle: asks for the situations the game has met, in wall-clock time, not a redraw",
  },
  { file: "ui/colonyJev.ts", line: "#saveTimer: ReturnType<typeof setTimeout>", why: "the answers cache's debounced save: its field" },
  { file: "ui/colonyJev.ts", line: "this.#saveTimer ??= setTimeout(", why: "the answers cache's debounced save, in wall-clock time" },
  {
    file: "ui/gameLoop.ts",
    line: "request: (cb) => requestAnimationFrame(cb),",
    why: "the one clock: the game loop's own frame source (GameLoop takes it as its env)",
  },
  {
    file: "ui/voxelFieldReview.ts",
    line: "  frame = requestAnimationFrame(tick);",
    why: "the review page's own render loop (a dev page, not the game's)",
  },
  {
    file: "ui/voxelFieldReview.ts",
    line: "if (playing) frame = requestAnimationFrame(tick);",
    why: "the review page's own render loop (a dev page, not the game's)",
  },
];

/** The lines of a component that call something in TIMING (comments left out). */
function timingLines(file: string): string[] {
  return readFileSync(join(SRC, file), "utf8")
    .split("\n")
    .filter((l) => TIMING.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
}

test("every timer, frame request and reducer in the page's components is named: none forces a redraw of the game", () => {
  const unnamed = components.flatMap((file) =>
    timingLines(file)
      .filter((l) => !NAMED.some((n) => n.file === file && l.includes(n.line)))
      .map((l) => `${file}: ${l.trim()}`),
  );
  assert.deepEqual(unnamed, [], "draw on the loop's ticks (useSimTick, or useGameRead for one thing), or name the timer in NAMED with why");
});

test("every named timer is still where it was named: a stale name would let a new one through", () => {
  // exactly one line each: a second copy of a named line would pass as the first one's, unnamed
  const stale = NAMED.filter((n) => timingLines(n.file).filter((l) => l.includes(n.line)).length !== 1).map((n) => `${n.file}: ${n.line}`);
  assert.deepEqual(stale, []);
  const files = new Set(components);
  assert.ok(
    NAMED.every((n) => files.has(n.file)),
    "named files are page components, hooks and the engine's own modules",
  );
});

test("the guard sees each shape of a forced redraw, and not a comment", () => {
  const forced = [
    "const t = setInterval(() => setTick((n) => n + 1), 250);",
    "const t = setInterval(() => setNow(Date.now()), 250);",
    "const id = setInterval(force, 250);",
    "const id = setInterval(function () { set(1); });",
    "setTimeout(loop, 250);",
    "requestAnimationFrame(bump);",
    "const [, bump] = useReducer((n) => n + 1, 0);",
  ];
  for (const l of forced) assert.match(l, TIMING, l);
  assert.doesNotMatch("const x = 1;", TIMING);
});

test("useSimTick or useGameRead is what the ant card, the specimens, the lens, the nest tab, the history and the journal use", () => {
  const uses = (f: string, re: RegExp) => assert.match(readFileSync(join(SRC, f), "utf8"), re, f);
  for (const f of ["ui/AntCard.tsx", "ui/Specimens.tsx", "ui/LensLayer.tsx", "ui/LearnDrawer.tsx", "ui/LabBench.tsx"])
    uses(f, /useSimTick\(/);
  uses("ui/LabCards.tsx", /useGameRead\(\(\) => journal\.written\)/);
});
