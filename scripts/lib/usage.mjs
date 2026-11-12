// `--help` for the maintained scripts, from the one place each already documents itself: its leading comment block.
// A script calls `helpAndExit(import.meta.url)` right after its imports; with --help or -h among its arguments it
// prints that block (the `//` lines at the top of the file, shebang skipped) and exits 0 before doing anything, so an
// agent that asks a script what it does gets the same text a reader of the file does, never a second copy to keep
// current (docs/agent-guide.md: point, don't copy). web/src/ui/tests/scriptsHelp.test.ts holds that every script answers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The leading `//` comment block of the file at `url` (an import.meta.url), without the `// ` marks. */
export function headerOf(url) {
  const lines = readFileSync(fileURLToPath(url), "utf8").split("\n");
  const out = [];
  for (const line of lines) {
    if (line.startsWith("#!")) continue;
    if (!line.startsWith("//")) break;
    out.push(line.replace(/^\/\/ ?/, ""));
  }
  return out.join("\n");
}

/** With --help or -h in `argv`, print the script's header and exit 0; otherwise do nothing. */
export function helpAndExit(url, argv = process.argv.slice(2)) {
  if (!argv.includes("--help") && !argv.includes("-h")) return;
  console.log(headerOf(url));
  process.exit(0);
}
