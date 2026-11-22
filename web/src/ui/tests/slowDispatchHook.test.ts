import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSync, constants, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

// A session that never loads the steward skill still runs slow.yml by hand on its PR branch (16 runs between #224 and
// 2026-11-15, ja-w7ef.17), so the label route is also a hook in .claude/settings.json: it holds in every session and subagent,
// not only where a skill was loaded (docs/agent-guide.md, rule 5). ja-w7ef.19.

const ROOT = join(new URL("../../../../", import.meta.url).pathname);
const HOOK = ".claude/hooks/slow-dispatch.sh";

interface Entry {
  matcher: string;
  hooks: { type: string; command: string }[];
}

test("settings.json registers the slow-dispatch hook on the workflow trigger tool, and the script is executable", () => {
  const settings = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"));
  const entries: Entry[] = settings.hooks?.PreToolUse ?? [];
  const entry = entries.find((e) => e.matcher.split("|").includes("mcp__github__actions_run_trigger"));
  assert.ok(entry, "a PreToolUse entry matches mcp__github__actions_run_trigger");
  assert.ok(
    entry.hooks.some((h) => h.type === "command" && h.command.includes(HOOK)),
    `that entry runs ${HOOK}`,
  );
  accessSync(join(ROOT, HOOK), constants.X_OK);
});

// The hook fails open without jq, so its tests need it; the CI runners have it.
const hasJq = spawnSync("jq", ["--version"]).status === 0;

test(
  "the hook's own tests pass",
  { skip: !hasJq && "jq is not installed (the CI runners have it, so this skips only on a machine without it)" },
  () => {
    accessSync(join(ROOT, ".claude/hooks/test.sh"), constants.X_OK);
    const out = execFileSync("bash", [join(ROOT, ".claude/hooks/test.sh")], { encoding: "utf8" });
    assert.match(out, /\d+ passed, 0 failed/);
  },
);
