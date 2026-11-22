// What a pull request changes that CLAUDE.md asks its author to say (ja-w7ef.7, ja-w7ef.6), as one Markdown comment that
// .github/workflows/pr-notes.yml keeps current on the PR: the Jev cost of a game before and after (offline, no key, no
// spend: colony-cost.mjs and fungus-cost.mjs on the base and the head), the golden masters the PR re-records, and whether
// its description says so. Pure text in, text out, so ui/tests/int/prNotes.test.ts feeds it fixtures.
//
// Usage: node scripts/pr-notes.mjs --changed <files.txt> --body <body.txt> [--cost-ran]
//          [--colony-base <colony-cost output> --colony-head <…>] [--fungus-base <fungus-cost output> --fungus-head <…>]
//
// --changed lists the PR's files, one a line (git diff --name-only base...head); --body is its description. A cost pair
// left out is reported as not run (pr-notes.yml runs them only when web/src/colony/ or web/shared/ changed). Prints the
// comment, whose first line is MARKER, so the workflow finds and edits its own comment instead of adding one per push.
import { readFileSync } from "node:fs";
import { helpAndExit } from "./lib/usage.mjs";

helpAndExit(import.meta.url);

export const MARKER = "<!-- pr-notes (scripts/pr-notes.mjs) -->";

/** The golden masters: a change to one is a change in behaviour the PR must name (CLAUDE.md: "says so in its PR"). */
export const isGolden = (f) => /^web\/src\/colony\/tests\/.*golden.*\.json$/i.test(f);

/**
 * colony-cost.mjs's figures: the session's $/h for the lanes the page asks (modes), tokens a question, and
 * the response lanes' $/h, reported apart (not asked by the page yet).
 */
export function readColonyCost(text) {
  const num = (re) => {
    const m = re.exec(text);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  return {
    usdPerHour: num(/≈ \$([\d.]+) per hour at this pace/),
    tokPerQuestion: num(/\(~([\d,]+) tok per question, [\d,]+ mode choices per question\)/),
    responsesUsdPerHour: num(/all \d+ ≈ \$([\d.]+) per hour more/),
  };
}

/** fungus-cost.mjs's figures, from the JSON line it ends with. */
export function readFungusCost(text) {
  const line = text
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.startsWith("{"));
  if (!line) return { usdPerHour: null, tokPerQuestion: null };
  const j = JSON.parse(line);
  return { usdPerHour: j.usdPerHourAtThisPace ?? null, tokPerQuestion: j.tokensPerQuestion ?? null };
}

const usd = (v) => (v === null ? "–" : `$${v.toFixed(5)}`); // colony-cost prints 5 decimals
const tok = (v) => (v === null ? "–" : `${Math.round(v)}`);
function delta(a, b, fmt) {
  if (a === null || b === null) return "–";
  if (fmt(a) === fmt(b)) return "unchanged"; // as printed, so the table and the verdict agree
  const pct = a === 0 ? "" : ` (${b > a ? "+" : ""}${((100 * (b - a)) / a).toFixed(1)} %)`;
  return `${b > a ? "+" : "−"}${fmt(Math.abs(b - a))}${pct}`;
}

/**
 * The comment. `colony` and `fungus` are { base, head } of the readers' results, or null when not run. `costRan`: the
 * workflow ran the estimates (a colony or shared change), so a missing pair means one failed.
 * @param {{ changed: string[], body: string, colony: null | { base: any, head: any }, fungus: null | { base: any, head: any }, costRan?: boolean }} o
 */
export function notes({ changed, body, colony, fungus, costRan = false }) {
  const out = [MARKER, "### What CLAUDE.md asks this PR to say", ""];
  // Jev cost.
  out.push("**Jev cost of a game** (offline estimates; no key, no spend):", "");
  if (!colony && !fungus && !costRan) out.push("Not run: the PR changes nothing under `web/src/colony/` or `web/shared/`.", "");
  else {
    if (colony || fungus) out.push("| lane | base | head | change |", "|---|---|---|---|");
    const row = (name, a, b, f) => out.push(`| ${name} | ${f(a)} | ${f(b)} | ${delta(a, b, f)} |`);
    if (colony) {
      row("modes, $/h", colony.base.usdPerHour, colony.head.usdPerHour, usd);
      row("modes, tokens a question", colony.base.tokPerQuestion, colony.head.tokPerQuestion, tok);
      row("response lanes (not asked yet), $/h", colony.base.responsesUsdPerHour, colony.head.responsesUsdPerHour, usd);
    }
    if (fungus) {
      row("fungus, $/h", fungus.base.usdPerHour, fungus.head.usdPerHour, usd);
      row("fungus, tokens a question", fungus.base.tokPerQuestion, fungus.head.tokPerQuestion, tok);
    }
    // Every figure in the table, compared as printed (review of #234, S2 and N5).
    const FMT = { usdPerHour: usd, tokPerQuestion: tok, responsesUsdPerHour: usd };
    const shown = (k, v) => (FMT[k] ?? String)(v);
    // Only figures read on both sides count; with none, the verdict is "unknown", not "no change" (review of #234, S3).
    const both = (p) => (p === null ? [] : Object.keys(p.head).filter((k) => p.base[k] !== null && p.head[k] !== null));
    const differs = (p) => both(p).some((k) => shown(k, p.base[k]) !== shown(k, p.head[k]));
    const unread = (p) => p !== null && Object.keys(p.head).every((k) => p.base[k] === null && p.head[k] === null);
    out.push("");
    for (const [name, p] of [
      ["colony-cost", colony],
      ["fungus-cost", fungus],
    ])
      if (unread(p))
        out.push(`⚠ Couldn't read ${name}'s output on either side: scripts/pr-notes.mjs's reader may need its new wording.`, "");
    if (costRan)
      for (const [name, p] of [
        ["colony-cost", colony],
        ["fungus-cost", fungus],
      ])
        if (p === null) out.push(`⚠ ${name} didn't finish on the base or the head: see the PR notes job's log.`, "");
    out.push(
      differs(colony) || differs(fungus)
        ? "The cost moved: CLAUDE.md asks the PR to note the new figure for that lane."
        : both(colony).length + both(fungus).length > 0
          ? "No lane's cost moved."
          : "No figure was read on both sides, so whether the cost moved is unknown.",
      "",
    );
  }
  // Golden masters.
  const goldens = changed.filter(isGolden);
  out.push("**Golden masters:**", "");
  if (goldens.length === 0) out.push("None changed.", "");
  else {
    out.push(...goldens.map((g) => `- \`${g}\` re-recorded`), "");
    const named = /golden/i.test(body);
    out.push(
      named
        ? "The description mentions the goldens."
        : "⚠ The description doesn't mention the goldens: CLAUDE.md asks a PR that re-records them to say so and why.",
      "",
    );
  }
  out.push("_Updated on every push by `.github/workflows/pr-notes.yml`._");
  return out.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? null : args[i + 1];
  };
  const read = (name) => {
    const f = opt(name);
    return f === null ? null : readFileSync(f, "utf8");
  };
  const changed = (read("--changed") ?? "").split("\n").filter(Boolean);
  const body = read("--body") ?? "";
  const pair = (b, h, reader) => {
    const [x, y] = [read(b), read(h)];
    return x === null || y === null ? null : { base: reader(x), head: reader(y) };
  };
  process.stdout.write(
    notes({
      changed,
      body,
      colony: pair("--colony-base", "--colony-head", readColonyCost),
      fungus: pair("--fungus-base", "--fungus-head", readFungusCost),
      costRan: args.includes("--cost-ran"),
    }),
  );
}
