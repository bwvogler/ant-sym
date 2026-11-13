import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// No runtime import cycle in web/src (ja-fnd.4.9; review of #141, S1). The colony split moves code into modules
// that import each other; a cycle among them works only while none of them reads an import at module load, and
// breaks with a TDZ error the day one does. Only `import type` is erased; `import { type A }` still loads its module. Tests are left out.

const SRC = new URL("../../", import.meta.url).pathname; // web/src/

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "tests") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) yield p;
  }
}

/** The relative modules a file loads at run time: every import and re-export from a relative path but `import type` / `export type`. */
export function valueImports(file: string, text: string): string[] {
  const out: string[] = [];
  const STATEMENT = /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["'](\.{1,2}\/[^"']+)["']/gm;
  for (const m of text.matchAll(STATEMENT)) {
    if (m[1]) continue; // import type … / export type …: erased
    // `import { type A }` is not erased: verbatimModuleSyntax and Node's type stripping leave `import {} from …`, which
    // still loads the module, so it is an edge like any other (only `import type` is erased).
    out.push(resolve(dirname(file), m[3]!));
  }
  for (const m of text.matchAll(/^\s*import\s*["'](\.{1,2}\/[^"']+)["']/gm)) out.push(resolve(dirname(file), m[1]!));
  return out;
}

/** Every cycle in the graph, each as the files on it (one representative per strongly connected component). */
function cycles(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const found: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || (graph.get(v) ?? []).includes(v)) found.push(scc);
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) visit(v);
  return found;
}

test("the import scan: what loads a module counts, `import type` doesn't", () => {
  const f = join(SRC, "colony", "x.ts");
  const at = (p: string) => resolve(SRC, "colony", p);
  assert.deepEqual(valueImports(f, 'import { a, type B } from "./a.ts";'), [at("a.ts")]);
  assert.deepEqual(valueImports(f, 'import type { Colony } from "./colony.ts";'), []);
  assert.deepEqual(valueImports(f, 'import { type A, type B } from "./b.ts";'), [at("b.ts")]);
  assert.deepEqual(valueImports(f, 'export { swap } from "./c.ts";\nexport type { T } from "./d.ts";'), [at("c.ts")]);
  assert.deepEqual(valueImports(f, 'import {\n  a,\n  b,\n} from "./e.ts";'), [at("e.ts")]);
  assert.deepEqual(valueImports(f, 'import * as ns from "./f.ts";'), [at("f.ts")]);
});

test("no runtime import cycle among web/src's modules", () => {
  const graph = new Map<string, string[]>();
  for (const f of walk(SRC)) graph.set(f, valueImports(f, readFileSync(f, "utf8")));
  assert.ok(graph.size > 40, `scanned ${graph.size} files`);
  const found = cycles(graph).map((c) => c.map((f) => relative(SRC, f)).sort());
  assert.deepEqual(found, [], `runtime import cycles: ${JSON.stringify(found)}`);
});
