import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A component that draws afresh on a schedule takes its pace from the game loop's stats ticks (useSimTick, ui/session.ts), not from a
// timer of its own (ja-fnd.6.1): the loop stands still with a hidden tab, and there is one clock. This holds the line for the page's
// components: a `setInterval` that only bumps a counter to force a redraw fails here.

const SRC = join(new URL("../../", import.meta.url).pathname);

const components = [
  ...readdirSync(join(SRC, "ui"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(SRC, "ui", f)),
  join(SRC, "ColonyApp.tsx"),
];

/** Timers that are not the game's: what each draws is wall-clock time, which no stats tick tells. */
const WALL_CLOCK = new Set(["ui/Notices.tsx"]); // the bell's "2 min ago" ages, every 30 s

/** A counter that only exists to be bumped (`setTick`), or a timer whose callback is a state update adding one. */
const FORCED = [/\bsetTick\b/, /setInterval\(\(\) => \w+\(\(?\w+\)? => \w+ \+ 1\)/];

test("no component forces its own redraw with a timer: setTick, or a setInterval that bumps a counter", () => {
  const found = components.filter((file) => {
    const text = readFileSync(file, "utf8");
    return FORCED.some((re) => re.test(text)) && !WALL_CLOCK.has(file.slice(SRC.length));
  });
  assert.deepEqual(
    found.map((f) => f.slice(SRC.length)),
    [],
    "use useSimTick (ui/session.ts) for a component that draws on a schedule",
  );
});

test("the guard's patterns see a forced tick", () => {
  assert.ok(FORCED.some((re) => re.test("const [, setTick] = useState(0);")));
  assert.ok(FORCED.some((re) => re.test("const t = setInterval(() => bump((n) => n + 1), 500);")));
  assert.ok(!FORCED.some((re) => re.test("const t = setInterval(() => void save(AUTOSAVE), AUTOSAVE_MS);")));
});

test("useSimTick is what the ant card, the specimens, the lens, the nest tab and the history chart use", () => {
  for (const f of ["ui/AntCard.tsx", "ui/Specimens.tsx", "ui/LensLayer.tsx", "ui/LearnDrawer.tsx", "ui/LabBench.tsx"]) {
    assert.match(readFileSync(join(SRC, f), "utf8"), /useSimTick\(/, `${f} uses useSimTick`);
  }
});
