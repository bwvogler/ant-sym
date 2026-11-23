import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERIC_ANT, modeSchema, type Situation } from "../../colony/index.ts";
import { guideEntry } from "../guide.ts";
import { POLICY_SECTIONS, situationChips } from "../helpLinks.ts";
import { ROLE_ENTRY } from "../lens.ts";

// Every "?" in the page leads somewhere (ja-fnd.6.6): a guide id that is no longer an entry, or a policy section that was renamed, would open
// the drawer at the top and say nothing. The ids are written in many components; this reads them out of the sources and holds each to the
// guide's entries and the Policy tab's sections.

const UI = new URL("../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(UI, f), "utf8");
const sources = readdirSync(UI)
  .filter((f) => /\.tsx?$/.test(f))
  .concat("../ColonyApp.tsx");

/**
 * The quoted ids in the value after each match of `re` (one capture group: the rest of the value), in every source of the page, with its
 * file. A value may be a ternary (`entry: ant.infected ? "fungus" : "jobs"`): each quoted string in its branches is an id (not one in the condition). A value with no quoted
 * string (a variable, null, a type) names none here; those come from data the tests below read.
 */
function found(re: RegExp): { file: string; id: string }[] {
  const out: { file: string; id: string }[] = [];
  for (const f of sources)
    for (const m of read(f).matchAll(re)) {
      const value = m[1]!;
      const branches = value.includes("?") ? value.slice(value.indexOf("?")) : value; // not the condition's own strings
      for (const q of branches.matchAll(/"([^"]+)"/g)) out.push({ file: f, id: q[1]! });
    }
  return out;
}

test("every guide id the page links to is an entry in the field guide", () => {
  const ids = [
    ...found(/tab: "guide", id: ([^}\n]*)/g), // a "?" or an openLearn
    ...found(/\blearn: ([^,}\n]*)/g), // a tutorial card's link
    ...found(/\bentry: ([^,}\n]*)/g), // a lens line's link (a ternary has two ids)
  ];
  assert.ok(ids.length >= 15, `the scan finds the links (${ids.length})`);
  for (const { file, id } of [...ids, ...Object.values(ROLE_ENTRY).map((id) => ({ file: "lens.ts ROLE_ENTRY", id }))])
    assert.ok(guideEntry(id), `${file}: "${id}" is not a field guide entry`);
});

test("every policy section the page links to is one the Policy tab has, and the tab's sections are the ones named", () => {
  const linked = found(/tab: "policy", id: ([^}\n]*)/g);
  assert.ok(linked.length >= 5, `the scan finds the links (${linked.length})`);
  for (const { file, id } of linked)
    assert.ok((POLICY_SECTIONS as readonly string[]).includes(id), `${file}: "${id}" is not a Policy section`);
  const has = [...read("PolicyTab.tsx").matchAll(/<Section id="([a-z]+)"/g)].map((m) => m[1]!);
  assert.deepEqual(has, [...POLICY_SECTIONS], "PolicyTab's sections, in order");
});

test("the ant card's chips: one for each field of the mode lane, each leading to an entry or section that exists", () => {
  const fields = modeSchema(GENERIC_ANT.lanes.mode).fields.map((f) => String(f.name));
  const base: Situation = decodeBase();
  for (const underground of [false, true]) {
    const s = { ...base, homeTrail: underground ? "room" : "none" } as unknown as Situation;
    const chips = situationChips(s);
    assert.equal(chips.length, fields.length, "a chip a field");
    for (const [name, , to] of chips)
      if (to.tab === "guide") assert.ok(guideEntry(to.id!), `${name}: "${to.id}"`);
      else assert.ok((POLICY_SECTIONS as readonly string[]).includes(to.id!), `${name}: "${to.id}"`);
  }
  assert.deepEqual(
    situationChips(base, ["mode", "alarm"]).map((c) => c[0]),
    ["mode", "alarm"],
    "a species' own schema keeps only its fields",
  );
});

function decodeBase(): Situation {
  return {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "none",
  } as unknown as Situation;
}
