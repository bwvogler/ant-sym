import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODES, SITUATIONS, STANCES } from "../../colony/colony.ts";
import { COLONY_BRAIN_VERSION, DOCTRINES, policyContext, STANCE_BRAIN_VERSION, stanceContext } from "../../colony/colonyBrain.ts";
import { AIMS, FUNGUS_BRAIN_VERSION, fungusContext, validLevels } from "../../colony/fungusBrain.ts";
import { loadPrecache, precacheUrl, type PrecacheIndex } from "../precache.ts";

// The answers shipped with the page (scripts/precache.mjs → public/precache/) are only worth their bytes if the code
// still asks under the contexts they were asked under. A legend, question or version change moves the context: then
// this fails, naming the bundle, and the script is run again.

const DIR = fileURLToPath(new URL("../../../public/precache/", import.meta.url));
const index = JSON.parse(readFileSync(`${DIR}index.json`, "utf8")) as PrecacheIndex;
const CONTEXT: Record<string, (words: string) => string> = { mode: policyContext, stance: stanceContext, fungus: (aim) => fungusContext(aim, "side") };
const VALID: Record<string, readonly string[]> = { mode: MODES, stance: STANCES };
const SIZE: Record<string, number> = { mode: SITUATIONS, stance: 324 };

test("every shipped bundle is under the context the code asks under, for a preset doctrine", () => {
  assert.equal(index.versions.colony, COLONY_BRAIN_VERSION, "re-run scripts/precache.mjs: the colony brain's version moved");
  assert.equal(index.versions.stance, STANCE_BRAIN_VERSION, "re-run scripts/precache.mjs: the stance brain's version moved");
  assert.equal(index.versions.fungus, FUNGUS_BRAIN_VERSION, "re-run scripts/precache.mjs --lanes fungus: the fungus brain's version moved");
  for (const b of index.bundles as (PrecacheIndex["bundles"][number] & { aim?: string })[]) {
    const d = b.lane === "fungus" ? AIMS.find((x) => x.id === b.aim) : DOCTRINES.find((x) => x.id === b.doctrine);
    assert.ok(d, `${b.file}: no preset doctrine or aim`);
    const ctx = CONTEXT[b.lane];
    assert.ok(ctx, `${b.file}: no lane ${b.lane}`);
    assert.equal(b.context, ctx(d.text), `${b.file} was asked under another context: re-run scripts/precache.mjs`);
  }
});

test("every preset doctrine ships every mode and stance answer, and only answers the question allows", () => {
  for (const lane of ["mode", "stance"])
    for (const d of DOCTRINES) {
      const b = index.bundles.find((x) => x.lane === lane && x.doctrine === d.id);
      assert.ok(b, `no ${lane} bundle for ${d.id}`);
      const pairs = JSON.parse(readFileSync(`${DIR}${b.file}`, "utf8")) as [string, string][];
      assert.equal(pairs.length, b.answers);
      assert.equal(pairs.length, SIZE[lane], `${b.file}: not every situation is answered`);
      for (const [, a] of pairs) assert.ok(VALID[lane]!.includes(a), `${b.file}: ${a}`);
    }
});

test("loadPrecache seeds each bundle under its context, and skips what it can't read", async () => {
  const files: Record<string, unknown> = {
    "/x/precache/index.json": { versions: {}, bundles: [{ lane: "mode", doctrine: "forage", context: "colony-a", file: "a.json", answers: 1 }, { lane: "mode", doctrine: "forage", context: "colony-b", file: "b.json", answers: 1 }, { lane: "mode", doctrine: "forage", context: "colony-c", file: "missing.json", answers: 1 }] },
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
  const none = await loadPrecache(() => 1, (async () => { throw new TypeError("offline"); }) as typeof fetch, "/");
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
