import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LETHAL_LEVERS, LEVERS } from "../../colony/index.ts";
import { LEVER_KIND, LEVER_KINDS, leverNameClass } from "../leverKinds.ts";

// How a lever's kind looks and reads, once (ja-fnd.6.4.4): the ant card, the Policy tab and the Lab's levers used to choose each for themselves.

test("every kind of lever has a row, and the list names them all in the Levers tab's order", () => {
  const kinds = new Set(LEVERS.map((v) => v.kind));
  assert.deepEqual([...kinds].sort(), Object.keys(LEVER_KIND).sort(), "a kind with no row, or a row for none");
  assert.deepEqual([...LEVER_KINDS], ["perceive", "emit", "lethal"]);
  for (const v of LEVERS) assert.ok(LEVER_KIND[v.kind], v.id);
});

test("the colours and words of each kind are as the three places had them", () => {
  assert.deepEqual(LEVER_KIND.perceive, {
    nameClass: "text-spore",
    row: "perceives",
    what: "what it perceives",
    chipOn: "border-accent bg-accent-soft text-accent",
  });
  assert.deepEqual(LEVER_KIND.emit, {
    nameClass: "text-accent",
    row: "gives off",
    what: "what it gives off",
    chipOn: "border-accent bg-accent-soft text-accent",
  });
  assert.deepEqual(LEVER_KIND.lethal, { nameClass: "text-err", row: "lethal", what: "lethal", chipOn: "border-err bg-err-soft text-err" });
});

test("a chip is in the lethal colours exactly when the lever is lethal (the Lab used the set of lethal ids, this uses the kind)", () => {
  for (const v of LEVERS) assert.equal(LEVER_KIND[v.kind].chipOn.includes("border-err"), LETHAL_LEVERS.has(v.id), v.id);
});

// No component chooses a lever kind's look for itself. Prose may say "what it perceives" anywhere; what is held is the code: each of the three
// places reads the table, and no source under ui/ (or the page) compares a lever's kind to a literal, but for what is named here.
const SRC = new URL("../../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(SRC, f), "utf8");

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "tests") yield* sources(rel);
    } else if (/\.tsx?$/.test(e.name)) yield rel;
  }
}

/** A comparison of a kind with one of the lever kinds, either operator, either quote. */
const BRANCH = /kind\s*[!=]==?\s*["'](perceive|emit|lethal)["']/;

/** The comparisons that are meant to stay: which levers to list or word, not how a kind looks. */
const KEPT: { file: string; line: string; why: string }[] = [
  {
    file: "ui/PolicyTab.tsx",
    line: 'menu.has(v.id) || v.kind === "lethal"',
    why: "which levers the Policy tab lists: the menu's and every lethal one",
  },
  {
    file: "ui/PolicyTab.tsx",
    line: 'v.kind !== "lethal"',
    why: "the Policy tab's wording for a lethal lever depends on the menu and the upgrade, not on a table",
  },
];

test("no source compares a lever's kind to a literal, but for the ones named here; and each name still matches a line", () => {
  const files = [...sources("ui"), "ColonyApp.tsx"];
  const hits: { file: string; line: string }[] = [];
  for (const file of files) for (const line of read(file).split("\n")) if (BRANCH.test(line)) hits.push({ file, line });
  const unnamed = hits.filter((h) => !KEPT.some((k) => k.file === h.file && h.line.includes(k.line)));
  assert.deepEqual(unnamed, [], "use LEVER_KIND (ui/leverKinds.ts), or name the comparison in KEPT with why it stays");
  for (const k of KEPT)
    assert.ok(
      hits.some((h) => h.file === k.file && h.line.includes(k.line)),
      `${k.file}: ${k.line} no longer matches a line`,
    );
});

/** What each place reads of the table: a place that hard-codes one of these fails, though it reads another. */
const READS: [file: string, fields: string[]][] = [
  ["ui/AntCard.tsx", ["what"]],
  ["ui/PolicyTab.tsx", ["what"]],
  ["ui/LabCards.tsx", ["row", "chipOn"]],
];

/** The places that show a lever's name: each hands `LeverName` the lever's kind (`kind={x.kind}`, not a literal) and keeps what it passed before. */
const NAMES: [file: string, keeps: RegExp[]][] = [
  ["ui/AntCard.tsx", [/title=\{/, /stale \? "opacity-50"/, /rounded bg-raised px-1\.5 py-0\.5 font-mono/]],
  ["ui/PolicyTab.tsx", [/className="font-mono text-xs"/]],
  ["ui/UpgradeTips.tsx", []],
];

test("the ant card, the Policy tab and the Lab's levers each read the table, each field they used to choose", () => {
  for (const [file, fields] of READS)
    for (const f of fields) assert.match(read(file), new RegExp(`LEVER_KIND\\[[^\\]]+\\]\\.${f}\\b`), `${file} reads .${f}`);
});

test("every place that shows a lever's name does it with LeverName, giving it the lever's kind, and keeps its own title and classes", () => {
  for (const [file, keeps] of NAMES) {
    assert.match(read(file), /<LeverName\s[^>]*\bkind=\{\w+\.kind\}/, `${file} uses <LeverName kind={x.kind}>`);
    for (const re of keeps) assert.match(read(file), re, `${file} keeps ${re}`);
  }
});

test("a name's classes are its kind's colour first, then the place's own", () => {
  for (const k of LEVER_KINDS) {
    assert.equal(leverNameClass(k), LEVER_KIND[k].nameClass);
    assert.equal(leverNameClass(k, "font-mono text-xs"), `${LEVER_KIND[k].nameClass} font-mono text-xs`);
  }
});

test("LeverName gives the span its kind's classes and the caller's props: through leverNameClass(kind, className) and the rest", () => {
  const text = read("ui/LeverName.tsx");
  assert.match(text, /className=\{leverNameClass\(kind, className\)\}/);
  assert.match(text, /\{\.\.\.rest\}/);
});

test("a lever name's colour class is read from the table in leverKinds.ts only: no `.nameClass` anywhere else in the page", () => {
  const readers = [...sources("ui"), "ColonyApp.tsx"].filter((f) => /\.nameClass\b/.test(read(f)));
  assert.deepEqual(readers, ["ui/leverKinds.ts"], "show a lever's name with <LeverName kind={…}> (it calls leverNameClass)");
});

test("what the upgrade tooltip is handed for a lever is its kind (not a flag made from it), so it can use the table like the rest", () => {
  const text = read("ui/upgradeText.ts");
  assert.match(text, /\bkind: LeverKind\b/, "the tooltip's lever carries its kind");
  assert.doesNotMatch(text, /\blethal:\s*\w+\.kind/, "no flag derived from the kind");
});

test("the branch scan sees either operator, either quote and a branch on a variable's kind", () => {
  for (const line of ['x.kind === "perceive" ? a : b', "x.kind !== 'perceive' ? a : b", 'lever.kind==="lethal"', 'v.kind  ===  "emit"'])
    assert.ok(BRANCH.test(line), line);
  assert.ok(!BRANCH.test("v.kind === kind"), "a comparison with a variable is the Levers tab's own filter");
  assert.ok(!BRANCH.test('kind: "perceive",'), "a lever's own declaration");
});
