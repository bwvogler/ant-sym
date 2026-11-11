import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GUIDE, NOTES } from "../guide.ts";

// The field guide cites the research notes by heading. The notes move on (gaps close, sections are renamed), so every
// citation is checked against docs/ here: a broken anchor or a closed gap fails, naming the entry to rewrite.

const DOCS = fileURLToPath(new URL("../../../../docs/", import.meta.url));
const read = (note: string) => readFileSync(`${DOCS}${note}.md`, "utf8");

/** GitHub's heading anchor: lower case, punctuation dropped (letters, digits, spaces, - and _ kept), spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(note: string): Set<string> {
  const out = new Set<string>();
  for (const line of read(note).split("\n")) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) out.add(slug(m[1]!));
  }
  return out;
}

test("slug matches GitHub's anchors for the headings vision.md links", () => {
  assert.equal(slug("2. Distance and time scales"), "2-distance-and-time-scales");
  assert.equal(slug("Inside: gravity, memory and road signs"), "inside-gravity-memory-and-road-signs");
  assert.equal(slug("A. Perception: what the host senses"), "a-perception-what-the-host-senses");
  assert.equal(slug("TL;DR"), "tldr");
});

test("every guide entry has a unique id and cites notes and headings that exist", () => {
  const ids = new Set<string>();
  for (const e of GUIDE) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.sources.length > 0, `${e.id}: no source`);
    for (const s of e.sources) {
      const have = anchors(s.note);
      assert.ok(s.anchor === "" || have.has(s.anchor), `${e.id}: docs/${s.note}.md has no heading #${s.anchor}`);
    }
  }
  for (const n of NOTES) assert.doesNotThrow(() => read(n.note), `docs/${n.note}.md`);
});

test("every note in the docs index is in the guide's list", () => {
  const index = readFileSync(`${DOCS}README.md`, "utf8");
  const listed = [...index.matchAll(/\]\(([a-z-]+)\.md\)/g)].map((m) => m[1]!);
  const have = new Set(NOTES.map((n) => n.note));
  for (const n of listed) assert.ok(have.has(n), `docs/README.md lists ${n}.md; add it to NOTES in ui/guide.ts`);
});

test("an entry that says a behaviour is still scripted names a gap that is still open in docs/vision.md", () => {
  const rows = read("vision")
    .split("\n")
    .filter((l) => l.startsWith("|"));
  for (const e of GUIDE) {
    if (!e.scripted) continue;
    const open = rows.some((r) => r.includes(`\`${e.scripted!.bead}\``) && !r.startsWith("| ~~"));
    assert.ok(open, `${e.id}: ${e.scripted.bead} is no longer an open gap in vision.md; update the entry`);
  }
});
