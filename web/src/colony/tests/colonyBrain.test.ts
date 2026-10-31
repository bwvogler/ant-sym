import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCTRINES, estimateTokens, packModeRequest, policyContext, readMode, situationKey } from "../colonyBrain.ts";
import type { Situation } from "../colony.ts";

const S: Situation = { mode: "follow", tired: false, foodTrail: "faint", homeTrail: "strong", alarm: "none", enemy: "none", stance: "forage" };

test("situationKey is stable and tells situations apart", () => {
  assert.equal(situationKey(S), situationKey({ ...S }));
  assert.notEqual(situationKey(S), situationKey({ ...S, alarm: "faint" }));
  assert.notEqual(situationKey(S), situationKey({ ...S, tired: true }));
});

test("packModeRequest: one shared state with the doctrine, one choice per situation", () => {
  const r = packModeRequest([{ id: "s0", situation: S }, { id: "s1", situation: { ...S, mode: "explore" } }], "be brave");
  const state = r.state as { legend: string; doctrine: string; ants: Record<string, Situation> };
  assert.equal(state.doctrine, "be brave");
  assert.ok(state.legend.includes("doctrine"));
  assert.deepEqual(Object.keys(state.ants), ["s0", "s1"]);
  assert.deepEqual(Object.keys(r.questions), ["s0_mode", "s1_mode"]);
  const q = r.questions.s0_mode;
  assert.ok(q?.type === "choice" && Object.keys(q.criteria).join() === "explore,follow,return,fight");
  assert.ok(estimateTokens(r) > 0);
});

test("readMode: a mode, or null for anything else", () => {
  assert.equal(readMode({ s0_mode: { type: "choice", choice: "return" } }, "s0"), "return");
  assert.equal(readMode({ s0_mode: { type: "choice", choice: "dance" } }, "s0"), null);
  assert.equal(readMode({ s0_mode: { type: "noul", noul: 0.5 } }, "s0"), null);
  assert.equal(readMode({}, "s0"), null);
});

test("policyContext changes with the doctrine and ignores surrounding whitespace", () => {
  const a = policyContext(DOCTRINES[0]!.text);
  assert.notEqual(a, policyContext(DOCTRINES[1]!.text));
  assert.equal(a, policyContext(`  ${DOCTRINES[0]!.text}\n`));
  assert.match(a, /^colony-v\d+-[0-9a-f]{8}$/);
});

test("stances: key, pack and read; their own context per doctrine", async () => {
  const { packStanceRequest, readStance, stanceContext, stanceKey } = await import("../colonyBrain.ts");
  const v = { stance: "forage" as const, ants: "many" as const, losses: "none" as const, enemyNearNest: true, foodLeft: "some" as const, larder: "full" as const };
  assert.notEqual(stanceKey(v), stanceKey({ ...v, enemyNearNest: false }));
  const r = packStanceRequest([{ id: "c0", situation: v }], "be brave");
  assert.deepEqual(Object.keys(r.questions), ["c0_stance"]);
  assert.equal((r.state as { doctrine: string }).doctrine, "be brave");
  assert.equal(readStance({ c0_stance: { type: "choice", choice: "raid" } }, "c0"), "raid");
  assert.equal(readStance({ c0_stance: { type: "choice", choice: "nap" } }, "c0"), null);
  assert.notEqual(stanceContext("x"), policyContext("x"));
});
