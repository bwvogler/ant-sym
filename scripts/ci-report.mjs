// A node --test reporter for CI (ja-w7ef.2, ja-w7ef.3): what failed, and how near each test file came to its limit, in
// a form an agent reads in one call instead of a 60 KB log. CI runs it beside the spec reporter:
//
// Usage: node --test --test-timeout=<ms> --test-reporter=spec --test-reporter-destination=stdout
//          --test-reporter=../scripts/ci-report.mjs --test-reporter-destination=stdout <files…>
//
// Environment (all optional; without them it prints nothing):
//   GITHUB_STEP_SUMMARY   appends a Markdown table: failures (file:line, test, kind, first line of the error, time), and
//                         the slowest files with their share of the limit
//   GITHUB_ACTIONS=true   prints one ::error annotation per failure and one ::warning per file at or over WARN_SHARE of
//                         the limit, so they show on the PR's Files tab and in the check's summary
//   TEST_FILE_LIMIT_MS    the per-file limit, if not the --test-timeout node --test was started with (a file runs as one
//                         test with that timeout)
//   TEST_REPORT_TITLE     the summary's heading (default: the tests)
//   TEST_DURATIONS_FILE   writes { "<file>": ms } as JSON, for an artifact that tracks durations from run to run
//
// A file stopped at its limit is reported as "cancelled at the limit", not as a test failure: the cure is to split it or
// move it to a slower tier (docs/agent-guide.md, Tests), never to raise the limit.
import { appendFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { helpAndExit } from "./lib/usage.mjs";

helpAndExit(import.meta.url);

/** A file at or over this share of its limit gets a warning: desertHeat ran 59 of 60 s in a PR before it was cut off on main (#165). */
export const WARN_SHARE = 0.7;

/** Workflow-command escaping (GitHub's toolkit): data and property values. */
const escData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** The first line of an error's message, without node's "[cause]" noise. */
function firstLine(error) {
  const e = error?.cause ?? error;
  const msg = (e && (e.message ?? String(e))) || "";
  return msg.split("\n").find((l) => l.trim()) ?? "";
}

/**
 * Folds node's test events into what the report needs. Pure, so a test can feed it events.
 * @param {Array<{type: string, data: any}>} events
 */
export function summarise(events) {
  /** @type {Map<string, number>} */
  const durations = new Map();
  const failures = [];
  let totals = null;
  /** The top-level test node --test makes of each file (process isolation) is named by the path it was given. */
  const isFile = (data) => data.nesting === 0 && !!data.file && (data.file === data.name || data.file.endsWith(`/${data.name}`));
  for (const { type, data } of events) {
    if (type === "test:summary") {
      if (!data.file) totals = data.counts;
    } else if (type === "test:complete") {
      // The file's whole run, module loading included: what its limit counts (test:summary's per-file time leaves the
      // loading out; review of #175, S1).
      if (isFile(data)) durations.set(data.file, data.details.duration_ms);
    } else if (type === "test:fail") {
      if (data.todo || data.skip) continue;
      const error = data.details?.error;
      const kind = error?.failureType;
      // A parent fails because a subtest did, or is cancelled with it: the subtest's own event carries the cause.
      if (kind === "subtestsFailed" || kind === "cancelledByParent") continue;
      // A file stopped at its limit is that top-level test timing out.
      const wholeFile = kind === "testTimeoutFailure" && isFile(data);
      failures.push({
        file: data.file,
        line: wholeFile ? undefined : data.line,
        name: wholeFile ? "(the whole file)" : data.name,
        kind: wholeFile ? "cancelled at the limit" : kind === "testTimeoutFailure" ? "timed out" : "failed",
        message: firstLine(error),
        ms: data.details?.duration_ms ?? 0,
      });
    }
  }
  return { durations, failures, totals };
}

/**
 * The step summary's Markdown and the annotation lines, from a summarise() result.
 * @param {ReturnType<typeof summarise>} s
 * @param {{ limitMs: number, title: string, root: string }} o
 */
export function render(s, { limitMs, title, root }) {
  const rel = (f) => (f ? relative(root, f) : "?");
  const slow = [...s.durations].sort((a, b) => b[1] - a[1]);
  const near = limitMs > 0 ? slow.filter(([, ms]) => ms >= WARN_SHARE * limitMs) : [];
  const md = [`### ${title}`, ""];
  const t = s.totals;
  if (t) md.push(`${t.passed} passed, ${t.failed} failed, ${t.cancelled} cancelled, ${t.skipped} skipped, ${t.todo} todo.`, "");
  if (s.failures.length) {
    md.push("| file | test | what | error | time |", "|---|---|---|---|---|");
    for (const f of s.failures)
      md.push(`| ${cell(rel(f.file))}${f.line ? `:${f.line}` : ""} | ${cell(f.name)} | ${f.kind} | ${cell(f.message)} | ${secs(f.ms)} |`);
    md.push("");
  }
  if (slow.length) {
    const share = (ms) => (limitMs > 0 ? ` (${Math.round((100 * ms) / limitMs)} % of ${secs(limitMs)})` : "");
    md.push(
      "Slowest files:",
      ...slow.slice(0, 5).map(([f, ms]) => `- ${rel(f)}: ${secs(ms)}${share(ms)}${ms >= WARN_SHARE * limitMs && limitMs > 0 ? " ⚠" : ""}`),
      "",
    );
  }
  const notes = [
    ...s.failures.map(
      (f) =>
        `::error file=${escProp(rel(f.file))}${f.line ? `,line=${f.line}` : ""},title=${escProp(`${f.kind}: ${f.name}`)}::${escData(f.message || f.kind)}`,
    ),
    ...near.map(
      ([f, ms]) =>
        `::warning file=${escProp(rel(f))},title=${escProp("near its time limit")}::${escData(`${rel(f)} took ${secs(ms)} of its ${secs(limitMs)} limit: split it or move it to a slower tier (docs/agent-guide.md, Tests)`)}`,
    ),
  ];
  return { markdown: md.join("\n") + "\n", annotations: notes };
}

/** The per-file limit: TEST_FILE_LIMIT_MS, or else the --test-timeout this node --test was started with (the reporter runs in it). */
function limitMs() {
  const fromEnv = Number(process.env.TEST_FILE_LIMIT_MS);
  if (fromEnv > 0) return fromEnv;
  const flag = process.execArgv.find((a) => a.startsWith("--test-timeout="));
  return flag ? Number(flag.slice("--test-timeout=".length)) || 0 : 0;
}

/** The reporter: collects every event, then writes the summary, the durations and the annotations once at the end. */
export default async function* ciReport(source) {
  const events = [];
  for await (const e of source) events.push(e);
  const s = summarise(events);
  const env = process.env;
  const root = env.GITHUB_WORKSPACE ?? process.cwd();
  const out = render(s, { limitMs: limitMs(), title: env.TEST_REPORT_TITLE || "Tests", root });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, out.markdown);
  if (env.TEST_DURATIONS_FILE)
    writeFileSync(
      env.TEST_DURATIONS_FILE,
      JSON.stringify(Object.fromEntries([...s.durations].map(([f, ms]) => [relative(root, f), Math.round(ms)])), null, 1),
    );
  if (env.GITHUB_ACTIONS === "true") for (const line of out.annotations) yield `${line}\n`;
}
