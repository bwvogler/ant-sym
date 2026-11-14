import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

test("the agent guide names files and symbols that exist", () => {
  const guide = readFileSync(join(ROOT, "docs/agent-guide.md"), "utf8");
  const named: [string, string[]][] = [
    ["web/src/ui/tests/colonyIndex.test.ts", []],
    ["web/src/colony/ants.ts", ["ANT_FIELDS"]],
    ["web/src/colony/vocab.ts", []],
    ["web/src/colony/tests/builders.ts", ["SMALL_SIDE", "smallOne", "arena", "placedAt", "editPrivate"]],
    ["web/shared/jev.ts", ["isRunSummary", "readHealth"]],
    ["web/src/colony/params.ts", ["backfill", "tunnelDrift"]], // ColonyParams, where the guide points
  ];
  for (const [path, symbols] of named) {
    if (symbols.length === 0) assert.ok(guide.includes(path.split("/").pop()!), `the guide mentions ${path}`);
    assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
    const src = readFileSync(join(ROOT, path), "utf8");
    for (const sym of symbols) {
      assert.ok(guide.includes(sym), `the guide mentions ${sym}`);
      assert.ok(src.includes(sym), `${path} still has ${sym}`);
    }
  }
});

// How an agent finds a tool (docs/agent-guide.md; Anthropic's Claude Code docs): every skill's name and description sit in
// context from the start, and the description alone decides when it is used, so it must say when. A directory CLAUDE.md loads
// when its files are read, so it must stay small.

const skillDirs = readdirSync(join(ROOT, ".claude/skills"), { withFileTypes: true }).filter((d) => d.isDirectory());

for (const d of skillDirs) {
  test(`skill ${d.name}: its name is its folder, and its description says what it does and when to use it`, () => {
    const text = readFileSync(join(ROOT, ".claude/skills", d.name, "SKILL.md"), "utf8");
    const front = text.split("\n---")[0] ?? "";
    assert.equal(/^name:\s*(\S+)\s*$/m.exec(front)?.[1], d.name, "name: matches the folder");
    const description = /^description:\s*"?(.+?)"?\s*$/m.exec(front)?.[1] ?? "";
    assert.match(description, /\bUse (whenever|when)\b/, "the description names when to use it");
    assert.ok(description.length <= 1000, `${description.length} characters: the listing truncates long descriptions`);
  });
}

// A skill's evals (docs/agent-guide.md, Writing a skill) are read by people and agents, not run by a test: hold their shape.
for (const d of skillDirs) {
  const file = join(ROOT, ".claude/skills", d.name, "evals", "evals.json");
  if (!existsSync(file)) continue;
  test(`skill ${d.name}: its evals parse, name it, and list prompts that should and shouldn't trigger it`, () => {
    const evals = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(evals.skill, d.name, "evals.skill names the folder");
    for (const k of ["should_trigger", "should_not_trigger"]) {
      const list: unknown = evals.trigger?.[k];
      assert.ok(Array.isArray(list) && list.length > 0 && list.every((q) => typeof q === "string"), `trigger.${k}: a list of prompts`);
    }
  });
}

test("the directory CLAUDE.md files stay small, and the root one names the skills it points at", () => {
  const colony = readFileSync(join(ROOT, "web/src/colony/CLAUDE.md"), "utf8");
  assert.ok(colony.split("\n").length <= 20, "web/src/colony/CLAUDE.md loads whenever a colony file is read: keep it to a few lines");
  const root = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  for (const [text, name] of [
    [root, "watching-a-game"],
    [colony, "watching-a-game"],
  ] as const) {
    assert.ok(text.includes(name), `names the ${name} skill`);
    assert.ok(existsSync(join(ROOT, ".claude/skills", name, "SKILL.md")), `${name} exists`);
  }
});
