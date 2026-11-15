import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join } from "node:path";

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

// Three sessions started slow.yml by hand on PR branches, one citing CLAUDE.md's "run before merging colony changes", while
// the label that does it for a PR was written only in the steward skill (ja-w7ef.17): the way is named where agents look.
test("the slow guards' way onto a PR (the slow-guards label) is named in CLAUDE.md and in the steward skill's description", () => {
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  const line = claude.split("\n").find((l) => l.startsWith("npm run test:slow"));
  assert.match(line ?? "", /slow-guards/, "CLAUDE.md's test:slow line names the label");
  const steward = readFileSync(join(ROOT, ".claude/skills/steward/SKILL.md"), "utf8");
  const description = /^description:\s*"?(.+?)"?\s*$/m.exec(steward)?.[1] ?? "";
  assert.match(description, /slow-guards/, "the steward skill's description names the label");
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

// Reviews kept finding agent docs that name a file that had moved or gone (ja-w7ef.6: stale cross-references). Every
// backticked file path in CLAUDE.md, the agent guide, AGENTS.md, the skills and the reviewer agent must exist: a path
// with a folder from the repo root or a folder a doc writes paths from, a bare name as some tracked file's name.
// reference/history.md files tell what was, so they may name what is gone.
/**
 * The file paths a doc names in backticks: a `:line` or `#anchor` dropped, trailing punctuation dropped, `..` paths (the
 * sibling repos) left out. Known misses, fine today: extensions outside the list (index.css, .jsonl) and paths written
 * without backticks (a scan of those found none missing, review of #234).
 */
function pathsIn(text: string): string[] {
  const out: string[] = [];
  for (const [, raw] of text.matchAll(/`([^`\s]+)`/g)) {
    const p = raw!.replace(/[:#].*$/, "").replace(/[),.]+$/, "");
    if (/^[\w.@-]+(\/[\w.@-]+)*\.(ts|tsx|mjs|js|md|json|ya?ml|sh)$/.test(p) && !p.startsWith("..")) out.push(p);
  }
  return out;
}
test("the agent-doc path scan keeps file paths and drops line numbers, anchors, globs and sibling repos", () => {
  assert.deepEqual(
    pathsIn(
      "see `web/src/colony/game.ts:292`, `docs/PRD.md#59`, `ci.yml`, `src/**/*.ts`, `../lingo-dojo/x.ts`, `npm run e2e` and `a.ts).`",
    ),
    ["web/src/colony/game.ts", "docs/PRD.md", "ci.yml", "a.ts"],
  );
});
const NOT_IN_GIT: Record<string, string> = {
  "hooks/policy.ts": "in the sibling repo ../jev-router",
  "data/jev-budget.json": "the server's ledger, written at run time",
  "assays.json": "assays.yml's artifact",
};
test("the agent docs name files that exist", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const names = new Set(tracked.map((f) => basename(f)));
  const trackedSet = new Set(tracked);
  const isTracked = (p: string): boolean => trackedSet.has(p.replace(/^\.\//, "")) || tracked.some((f) => f.startsWith(`${p}/`));
  const skills = readdirSync(join(ROOT, ".claude/skills"));
  const docs = [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/agent-guide.md",
    ".claude/agents/pr-reviewer.md",
    ...skills.flatMap((s) =>
      readdirSync(join(ROOT, ".claude/skills", s), { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".md") && !f.endsWith("history.md"))
        .map((f) => `.claude/skills/${s}/${f}`),
    ),
  ].filter((d) => existsSync(join(ROOT, d)));
  assert.ok(docs.length >= 10, `${docs.length} docs`);
  const bases = (doc: string): string[] => [
    "",
    "web",
    "web/src",
    "web/src/colony",
    "web/src/colony/tests",
    ".claude/skills",
    dirname(doc),
    ...(doc.startsWith(".claude/skills/") ? [doc.split("/").slice(0, 3).join("/")] : []),
    // An agent runs a skill (pr-reviewer: reviewing-prs) and writes paths from its folder.
    ...(doc.startsWith(".claude/agents/") ? skills.map((sk) => `.claude/skills/${sk}`) : []),
  ];
  const missing: string[] = [];
  for (const doc of docs)
    for (const p of pathsIn(readFileSync(join(ROOT, doc), "utf8"))) {
      if (p in NOT_IN_GIT) continue;
      // Tracked, not merely on disk: an untracked local file passes here and fails in CI (review of #234, N6).
      const found = p.includes("/") ? bases(doc).some((b) => isTracked(join(b, p))) : names.has(p);
      if (!found) missing.push(`${doc}: ${p}`);
    }
  assert.deepEqual(missing, [], "named in an agent doc but not in the repo: fix the path, or add it to NOT_IN_GIT with why");
});
