import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin, validateJevRequest } from "../api.ts";

test("sameOrigin: no Origin passes, matching host passes, anything else is refused", () => {
  assert.equal(sameOrigin(undefined, "localhost:38500"), true);
  assert.equal(sameOrigin("http://localhost:38500", "localhost:38500"), true);
  assert.equal(sameOrigin("http://evil.example", "localhost:38500"), false);
  assert.equal(sameOrigin("http://localhost:38400", "localhost:38500"), false);
  assert.equal(sameOrigin("not a url", "localhost:38500"), false);
  assert.equal(sameOrigin("http://localhost:38500", undefined), false);
});

test("validateJevRequest fills the model, keeps assets, rejects junk", () => {
  const ok = validateJevRequest({ state: "x", questions: { q: { type: "noul", instructions: "y" } } });
  assert.equal(ok.model, "jev-latest");
  assert.equal(ok.assets, undefined);
  const withAssets = validateJevRequest({ model: "jev-preview", state: {}, questions: { b: { type: "box", instructions: "z" } }, assets: { i: { type: "image", format: "png", data_base64: "AA==" } } });
  assert.equal(withAssets.model, "jev-preview");
  assert.ok(withAssets.assets);
  assert.throws(() => validateJevRequest(null), /Jev request object/);
  assert.throws(() => validateJevRequest({ questions: { q: { type: "noul", instructions: "" } } }), /state is required/);
  assert.throws(() => validateJevRequest({ state: 1, questions: {} }), /non-empty/);
  assert.throws(() => validateJevRequest({ state: 1, questions: { q: { type: "rank" } } }), /no valid type/);
});
