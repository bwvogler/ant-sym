// After tick-stage.mjs: add a new stage file's imports, from tsc's "Cannot find name" errors and the colony modules' exports.
// From the repo root: node scripts/lab/tick-stage-imports.mjs <file.ts>. Then run tsc again. Colony and AntStep come out as `import type`;
// another class used only as a type comes out as a value import, and a
// name imported under another name (nx as stepX) is reported not found: fix those by hand.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const dir = ROOT + "web/src/colony/";
const file = process.argv[2];
let out = "";
try {
  execSync("npx tsc -b", { cwd: ROOT + "web", encoding: "utf8" });
} catch (e) {
  out = e.stdout;
}
const names = new Set(
  [
    ...out.matchAll(
      new RegExp(`src/colony/${file.replace(".", "\\.")}\\(\\d+,\\d+\\): error TS(?:2304|2552): Cannot find name '(\\w+)'`, "g"),
    ),
  ].map((m) => m[1]),
);
const where = new Map(); // name -> [module, isType]
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== file)) {
  const t = readFileSync(dir + f, "utf8");
  for (const m of t.matchAll(/^export (?:declare )?(function|const|let|class|type|interface|enum) (\w+)/gm))
    if (names.has(m[2]) && !where.has(m[2])) where.set(m[2], [f, m[1] === "type" || m[1] === "interface"]);
  // Destructured exports: export const [A, B] = … / export const { A, B } = … (review of #149, N4)
  for (const m of t.matchAll(/^export const [[{]([^\]}]+)[\]}]/gm))
    for (const n of m[1].split(",").map((x) => x.trim().split(":").pop().trim()))
      if (names.has(n) && !where.has(n)) where.set(n, [f, false]);
}
// A stage takes the colony and the step record as parameters: types only (a value import of colony.ts would be a runtime cycle).
for (const n of ["Colony", "AntStep"]) if (where.has(n)) where.get(n)[1] = true;
const missing = [...names].filter((n) => !where.has(n));
const byMod = new Map();
for (const [n, [f, isType]] of where) {
  if (!byMod.has(f)) byMod.set(f, []);
  byMod.get(f).push(isType ? `type ${n}` : n);
}
const lines = [...byMod]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([f, ns]) => {
    const allTypes = ns.every((n) => n.startsWith("type "));
    const list = ns.map((n) => (allTypes ? n.slice(5) : n)).sort((a, b) => a.replace("type ", "").localeCompare(b.replace("type ", "")));
    return `import ${allTypes ? "type " : ""}{ ${list.join(", ")} } from "./${f}";`;
  });
const src = readFileSync(dir + file, "utf8").split("\n");
const at = src.findIndex((l) => l.startsWith("export function"));
src.splice(at, 0, ...lines, "");
writeFileSync(dir + file, src.join("\n"));
console.log(`${file}: ${lines.length} import lines; not found: ${missing.join(", ") || "none"}`);
