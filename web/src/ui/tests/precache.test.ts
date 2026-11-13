import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SITUATIONS,
  MODES,
  STANCES,
  COLONY_BRAIN_VERSION,
  DOCTRINES,
  policyContext,
  STANCE_BRAIN_VERSION,
  stanceContext,
  AIMS,
  LANE_LIST,
  FUNGUS_BRAIN_VERSION,
  fungusContext,
  validLevels,
  GROWTH_CHOICES,
  LANES,
  GROWTH_BRAIN_VERSION,
  growthContext,
} from "../../colony/index.ts";
import { loadPrecache, precacheUrl, type PrecacheIndex } from "../precache.ts";

// The answers shipped with the page (scripts/precache.mjs → public/precache/) are only worth their bytes if the code
// still asks under the contexts they were asked under. A legend, question or version change moves the context: then
// this fails, naming the bundle, and the script is run again.

const DIR = fileURLToPath(new URL("../../../public/precache/", import.meta.url));
const index = JSON.parse(readFileSync(`${DIR}index.json`, "utf8")) as PrecacheIndex;
const CONTEXT: Record<string, (words: string) => string> = {
  mode: policyContext,
  stance: stanceContext,
  fungus: (aim) => fungusContext(aim, "side"),
  growth: growthContext,
};
const VALID: Record<string, readonly string[]> = { mode: MODES, stance: STANCES, growth: GROWTH_CHOICES };
const SIZE: Record<string, number> = { mode: SITUATIONS, stance: 324, growth: 48 };

// The tables above are literals on purpose (deriving what a test expects from the registry it checks would prove nothing), so a lane added to the
// registry (colony/lanes.ts) needs its rows here: this fails, naming the table, when it has none.
test("each table above has a row for every lane of the registry that needs one", () => {
  // As sets: the order of a table, or of the registry, is nobody's business here.
  const sorted = (names: string[]) => [...names].sort();
  assert.deepEqual(sorted(Object.keys(CONTEXT)), sorted(LANE_LIST.map((l) => l.name)), "a lane has no context row");
  assert.deepEqual(
    sorted(Object.keys(VALID)),
    sorted(LANE_LIST.filter((l) => l.local).map((l) => l.name)),
    "a lane with a local rule (its answers are a fixed set) has no valid-answers row",
  );
  assert.deepEqual(
    sorted(Object.keys(SIZE)),
    sorted(LANE_LIST.filter((l) => l.all).map((l) => l.name)),
    "a lane that can enumerate its situations has no size row",
  );
  for (const l of LANE_LIST) if (l.all) assert.equal(l.all().length, SIZE[l.name], `${l.name}'s situations`);
});

test("every shipped bundle is under the context the code asks under, for a preset doctrine", () => {
  assert.equal(index.versions.colony, COLONY_BRAIN_VERSION, "re-run scripts/precache.mjs: the colony brain's version moved");
  assert.equal(index.versions.stance, STANCE_BRAIN_VERSION, "re-run scripts/precache.mjs: the stance brain's version moved");
  assert.equal(index.versions.fungus, FUNGUS_BRAIN_VERSION, "re-run scripts/precache.mjs --lanes fungus: the fungus brain's version moved");
  assert.equal(index.versions.growth, GROWTH_BRAIN_VERSION, "re-run scripts/precache.mjs --lanes growth: the growth brain's version moved");
  // A lane asked under the fungus's aim (the fungus, its tips' growth) ships a bundle per preset aim; the ants' lanes one per doctrine.
  const byAim = new Set(LANE_LIST.filter((l) => l.wordsField === "aim").map((l) => l.name as string));
  for (const b of index.bundles as (PrecacheIndex["bundles"][number] & { aim?: string })[]) {
    const d = byAim.has(b.lane) ? AIMS.find((x) => x.id === b.aim) : DOCTRINES.find((x) => x.id === b.doctrine);
    assert.ok(d, `${b.file}: no preset doctrine or aim`);
    const ctx = CONTEXT[b.lane];
    assert.ok(ctx, `${b.file}: no lane ${b.lane}`);
    assert.equal(b.context, ctx(d.text), `${b.file} was asked under another context: re-run scripts/precache.mjs`);
  }
});

// A bundle holds what a live test got (scripts/precache.mjs --import), not necessarily every situation: the page plays
// the local rule where nothing ships (PR #42: cache what the tests produce rather than asking every situation).
test("every preset doctrine ships mode and stance answers, each situation once, and only answers the question allows", () => {
  for (const lane of ["mode", "stance"])
    for (const d of DOCTRINES) {
      const b = index.bundles.find((x) => x.lane === lane && x.doctrine === d.id);
      assert.ok(b, `no ${lane} bundle for ${d.id}`);
      const pairs = JSON.parse(readFileSync(`${DIR}${b.file}`, "utf8")) as [string, string][];
      assert.equal(pairs.length, b.answers);
      assert.ok(pairs.length > 0 && pairs.length <= SIZE[lane]!, `${b.file}: ${pairs.length} answers`);
      assert.equal(new Set(pairs.map(([k]) => k)).size, pairs.length, `${b.file}: a situation twice`);
      for (const [, a] of pairs) assert.ok(VALID[lane]!.includes(a), `${b.file}: ${a}`);
    }
});

test("every preset aim ships growth answers (ja-2bw.5), each situation once, and only answers the growth question allows", () => {
  for (const a of AIMS) {
    const b = (index.bundles as (PrecacheIndex["bundles"][number] & { aim?: string })[]).find((x) => x.lane === "growth" && x.aim === a.id);
    assert.ok(b, `no growth bundle for ${a.id}`);
    const pairs = JSON.parse(readFileSync(`${DIR}${b.file}`, "utf8")) as [string, string][];
    assert.equal(pairs.length, b.answers);
    assert.ok(pairs.length > 0 && pairs.length <= SIZE.growth!, `${b.file}: ${pairs.length} answers`);
    assert.equal(new Set(pairs.map(([k]) => k)).size, pairs.length, `${b.file}: a situation twice`);
    for (const [, x] of pairs) assert.ok(VALID.growth!.includes(x), `${b.file}: ${x}`);
    // Every key is a real situation's (review of #115, N6): a key in another field order would never be hit.
    const keys = new Set(LANES.growth.all().map((sit) => LANES.growth.key(sit, undefined)));
    for (const [k] of pairs) assert.ok(keys.has(k), `${b.file}: ${k} is no growth situation`);
  }
});

test("loadPrecache seeds each bundle under its context, and skips what it can't read", async () => {
  const files: Record<string, unknown> = {
    "/x/precache/index.json": {
      versions: {},
      bundles: [
        { lane: "mode", doctrine: "forage", context: "colony-a", file: "a.json", answers: 1 },
        { lane: "mode", doctrine: "forage", context: "colony-b", file: "b.json", answers: 1 },
        { lane: "mode", doctrine: "forage", context: "colony-c", file: "missing.json", answers: 1 },
      ],
    },
    "/x/precache/a.json": [["k1", "explore"]],
    "/x/precache/b.json": { not: "pairs" },
  };
  const fake = (async (url: string) => {
    const body = files[String(url)];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  const seeded: [string, number][] = [];
  const n = await loadPrecache((c, e) => (seeded.push([c, e.length]), e.length), fake, "/x/");
  assert.equal(n, 1);
  assert.deepEqual(seeded, [["colony-a", 1]]);
  assert.equal(precacheUrl("index.json", "/ant-sym"), "/ant-sym/precache/index.json");
  const none = await loadPrecache(
    () => 1,
    (async () => {
      throw new TypeError("offline");
    }) as typeof fetch,
    "/",
  );
  assert.equal(none, 0);
});

test("every preset aim ships fungus answers for the side view, each a level for every lever its key asked", () => {
  for (const a of AIMS) {
    const b = (index.bundles as (PrecacheIndex["bundles"][number] & { aim?: string })[]).find((x) => x.lane === "fungus" && x.aim === a.id);
    assert.ok(b, `no fungus bundle for ${a.id}`);
    const pairs = JSON.parse(readFileSync(`${DIR}${b.file}`, "utf8")) as [string, string][];
    assert.ok(pairs.length > 50, `${b.file}: only ${pairs.length} situations`);
    for (const [key, answer] of pairs) assert.ok(validLevels(key, answer), `${b.file}: ${key} → ${answer}`);
  }
});
