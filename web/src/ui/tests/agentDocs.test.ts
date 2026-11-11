import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The agent files are read in every session, so their size is a cost (docs/agent-guide.md). CLAUDE.md is held to Anthropic's
// under-200-lines target and to a byte cap, since its lines run long: raise the cap only by cutting something else.

const ROOT = join(new URL("../../../../", import.meta.url).pathname);
const MAX_LINES = 200;
const MAX_BYTES = 12_000;

test("CLAUDE.md stays within its budget and points at the agent guide", () => {
  const text = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  const lines = text.split("\n").length;
  assert.ok(lines <= MAX_LINES, `CLAUDE.md has ${lines} lines (limit ${MAX_LINES}): move reference material to docs/ or a skill`);
  const bytes = Buffer.byteLength(text);
  assert.ok(
    bytes <= MAX_BYTES,
    `CLAUDE.md is ${bytes} bytes (limit ${MAX_BYTES}): every session pays for them; cut something before adding`,
  );
  assert.ok(text.includes("docs/agent-guide.md"), "CLAUDE.md links docs/agent-guide.md");
});

test("the agent guide and the files it names exist", () => {
  const guide = readFileSync(join(ROOT, "docs/agent-guide.md"), "utf8");
  for (const path of [
    "web/src/ui/tests/colonyIndex.test.ts",
    "web/src/colony/ants.ts",
    "web/src/colony/vocab.ts",
    "web/src/colony/tests/builders.ts",
    "web/shared/jev.ts",
  ]) {
    assert.ok(guide.includes(path.split("/").pop()!), `the guide mentions ${path}`);
    assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
  }
});
