import { test } from "node:test";
import assert from "node:assert/strict";
import { readResponse, responsesFromAnswers } from "../colonyBrain.ts";
import { ASSAYS, runAssay } from "../experiment.ts";
import { localResponses, touchKey, type Touch } from "../responses.ts";

// Jev's answers replayed offline: reading a reply per response hook, and a
// cache of answers standing in for the local responses (scripts/colony-live.mjs
// saves the caches; scripts/experiment.mjs --policy cache:<file> replays them).

const touch = (t: Partial<Touch> = {}): Touch => ({ mode: "explore", carrying: "none", atNest: false, enemy: false, stance: "forage", ...t });

test("readResponse: nouls above ½ are yes; choices must be one of the hook's answers", () => {
  assert.equal(readResponse("get", { s0_get: { type: "noul", noul: 0.9 } }, "s0"), true);
  assert.equal(readResponse("get", { s0_get: { type: "noul", noul: 0.2 } }, "s0"), false);
  assert.equal(readResponse("drop", { s0_drop: { type: "choice", choice: "yes" } }, "s0"), null);
  assert.equal(readResponse("carry", { s0_carry: { type: "choice", choice: "return" } }, "s0"), "return");
  assert.equal(readResponse("carry", { s0_carry: { type: "choice", choice: "dance" } }, "s0"), null);
  assert.equal(readResponse("trail", { s0_trail: { type: "choice", choice: "none" } }, "s0"), "none");
  assert.equal(readResponse("trail", {}, "s0"), null);
});

test("responsesFromAnswers: cached answers win, the local responses cover the rest", () => {
  const t = touch({ mode: "follow" });
  const r = responsesFromAnswers({ get: { [touchKey(t)]: false }, trail: { [touchKey(t)]: "none" } });
  assert.equal(r.get(t), false);
  assert.equal(r.get(touch()), true, "not cached: local");
  assert.equal(r.trail(t), "none");
  assert.equal(r.carry(touch({ carrying: "food" })), "return", "no cache for carry: local");
  assert.equal(r.trailRate(t), localResponses.trailRate(t), "hooks that are not lanes stay local");
});

test("a replayed cache changes the colony: ants told to lay no trail bring home less food (A1, short)", () => {
  const bridge = ASSAYS.find((a) => a.id === "bridge")!;
  const quiet: Record<string, "none"> = {};
  for (const mode of ["explore", "follow", "return", "fight"] as const)
    for (const atNest of [false, true]) for (const enemy of [false, true]) quiet[touchKey(touch({ mode, atNest, enemy }))] = "none";
  const local = runAssay(bridge, 1, {}, 120).metrics["you.stored"]!;
  const replayed = runAssay(bridge, 1, { responses: responsesFromAnswers({ trail: quiet }) }, 120).metrics["you.stored"]!;
  assert.ok(replayed < local, `no home trail: ${replayed} food home vs ${local}`);
});
