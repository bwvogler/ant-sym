import { test } from "node:test";
import assert from "node:assert/strict";

// What each store writes to the browser, and reads back (ja-fnd.6.1.2): the key, the value, and when it is removed instead; with storage
// that works, storage that throws and no storage. The stores keep one shared stand-in for localStorage here, so these run in one file, in order.

const dataset: Record<string, string | undefined> = {};
const listeners: ((e: { key: string | null; newValue: string | null }) => void)[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g.document = { documentElement: { dataset } };
g.window = { addEventListener: (_t: string, fn: (typeof listeners)[number]) => listeners.push(fn) };

const kept = new Map<string, string>();
const ops: string[] = [];
const working = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void (ops.push(`set ${k}=${v}`), kept.set(k, v)),
  removeItem: (k: string) => void (ops.push(`remove ${k}`), kept.delete(k)),
};
const use = (storage: unknown) => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
const blocked = (): never => {
  throw new Error("blocked");
};
const useBlocked = () =>
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: blocked,
  });
const none = () => void delete g.localStorage;

// Read when first asked for, so what is stored before the first read is what the store starts from.
kept.set("jevants.theme", "dark");
kept.set("jevants.notices", "bell");
use(working);
const { getTheme, setTheme, THEME_KEY, useTheme } = await import("../theme.ts");
const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { noticeLevel, setNoticeLevel } = await import("../toasts.ts");
const { setSoundOn, soundOn } = await import("../sounds.ts");
const { markSeen, seenTools } = await import("../build.ts");
const { passphrase, setPassphrase } = await import("../backend.ts");
const { browserCache } = await import("../cacheStore.ts");

test("the theme starts from what is stored, and a choice is shown, kept, and removed for the system's", () => {
  assert.equal(getTheme(), "dark");
  ops.length = 0;
  setTheme("light");
  assert.equal(getTheme(), "light");
  assert.equal(dataset.theme, "light", "data-theme on <html>");
  assert.deepEqual(ops, ["set jevants.theme=light"]);
  ops.length = 0;
  setTheme("system");
  assert.equal(getTheme(), "system");
  assert.equal(dataset.theme, undefined, "absent for the system's");
  assert.deepEqual(ops, ["remove jevants.theme"], "removed, not stored as the word system");
});

test("a render with no browser shows the system's theme, whatever is stored (the server snapshot)", () => {
  setTheme("dark");
  const Probe = () => createElement("span", null, useTheme());
  assert.equal(renderToString(createElement(Probe)), "<span>system</span>");
});

test("a theme chosen in another tab shows at once; an unrelated key does nothing; a cleared store is the system's", () => {
  assert.equal(listeners.length, 1, "one listener on the page's storage events");
  const heard = listeners[0]!;
  heard({ key: THEME_KEY, newValue: "dark" });
  assert.equal(getTheme(), "dark");
  assert.equal(dataset.theme, "dark");
  heard({ key: "something.else", newValue: "light" });
  assert.equal(getTheme(), "dark");
  heard({ key: null, newValue: null });
  assert.equal(getTheme(), "system", "localStorage.clear() in another tab");
  assert.equal(dataset.theme, undefined);
});

test("the notice level starts from what is stored; all is the default and is removed, the others kept", () => {
  assert.equal(noticeLevel(), "bell");
  ops.length = 0;
  setNoticeLevel("important");
  assert.equal(noticeLevel(), "important");
  setNoticeLevel("all");
  assert.equal(noticeLevel(), "all");
  assert.deepEqual(ops, ["set jevants.notices=important", "remove jevants.notices"]);
});

test("sound is on unless stored as off, and writes on or off", () => {
  assert.equal(soundOn(), true, "nothing stored");
  ops.length = 0;
  setSoundOn(false);
  assert.equal(soundOn(), false);
  setSoundOn(true);
  assert.equal(soundOn(), true);
  assert.deepEqual(ops, ["set jevants.sound=off", "set jevants.sound=on"]);
});

test("the builder's seen tools are a JSON list that grows; something else stored there reads as none", () => {
  assert.equal(seenTools().size, 0);
  markSeen("move");
  markSeen("tweezers");
  markSeen("move");
  assert.deepEqual([...seenTools()].sort(), ["move", "tweezers"]);
  assert.equal(kept.get("jevants.builder.seen"), JSON.stringify(["move", "tweezers"]));
  kept.set("jevants.builder.seen", "{not json");
  assert.equal(seenTools().size, 0);
});

test("the passphrase is kept under its key; null or an empty one forgets it", () => {
  assert.equal(passphrase(), null);
  ops.length = 0;
  setPassphrase("open sesame");
  assert.equal(passphrase(), "open sesame");
  setPassphrase(null);
  setPassphrase("again");
  setPassphrase("");
  assert.equal(passphrase(), null);
  assert.deepEqual(ops, ["set jev-ants:pass=open sesame", "remove jev-ants:pass", "set jev-ants:pass=again", "remove jev-ants:pass"]);
});

test("the answers cache saves and loads under its context, through the browser's storage", () => {
  browserCache.save("ctx", [["a", "1"]]);
  browserCache.save("ctx", [["b", "2"]]);
  assert.deepEqual(browserCache.load("ctx").sort(), [
    ["a", "1"],
    ["b", "2"],
  ]);
  assert.ok(
    [...kept.keys()].some((k) => k.endsWith("ctx")),
    "stored under a key that ends with the context",
  );
});

for (const [name, install] of [
  ["blocked", useBlocked],
  ["missing", none],
] as const)
  test(`with ${name} storage nothing throws, and what the page chose holds for this page`, () => {
    install();
    assert.doesNotThrow(() => setTheme("light"));
    assert.equal(getTheme(), "light");
    assert.doesNotThrow(() => setNoticeLevel("bell"));
    assert.equal(noticeLevel(), "bell");
    assert.doesNotThrow(() => setSoundOn(false));
    assert.equal(soundOn(), true, "sound is read from storage each time: unset here, so on");
    assert.doesNotThrow(() => markSeen("move"));
    assert.equal(seenTools().size, 0);
    assert.doesNotThrow(() => setPassphrase("in this page"));
    assert.equal(passphrase(), "in this page", "the passphrase is the one kept in memory");
    assert.doesNotThrow(() => browserCache.save("ctx", [["a", "1"]]));
    assert.deepEqual(browserCache.load("ctx"), []);
    setPassphrase(null);
    assert.equal(passphrase(), null);
  });
