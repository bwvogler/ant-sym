import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyTheme, parseTheme, THEME_KEY, THEMES } from "../theme.ts";

// The player's light or dark choice (PRD §69.9): the stored value, what it puts on <html>, and the two copies of the dark
// theme in index.css (CSS can't share one rule between a media query and an attribute).

const here = (p: string) => new URL(p, import.meta.url);
const css = readFileSync(here("../../index.css"), "utf8");

test("a stored value is light, dark, or the system's", () => {
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("dark"), "dark");
  for (const odd of [null, undefined, "", "system", "Dark", "auto", "dark "]) assert.equal(parseTheme(odd), "system", `“${odd}”`);
  assert.deepEqual([...THEMES], ["system", "light", "dark"]);
});

test("light and dark are data-theme on the page, the system's is none", () => {
  const root = { dataset: {} as DOMStringMap };
  applyTheme("dark", root);
  assert.equal(root.dataset.theme, "dark");
  applyTheme("light", root);
  assert.equal(root.dataset.theme, "light");
  applyTheme("system", root);
  assert.equal("theme" in root.dataset, false);
});

/** The declarations of the first rule that opens with `selector`, as name → value. */
function declarations(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `index.css has ${selector}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.replace(/\s*\/\*.*?\*\/\s*/g, "").trim()]),
  );
}

test("the dark theme under the system's preference and under data-theme=dark are the same variables", () => {
  const media = declarations(':root:not([data-theme="light"])');
  const chosen = declarations(':root[data-theme="dark"]');
  assert.ok(Object.keys(media).length > 20, "the dark theme has its variables");
  assert.deepEqual(chosen, media);
});

test("every variable the dark theme sets, the light theme sets first", () => {
  const light = declarations(":root {");
  for (const name of Object.keys(declarations(':root[data-theme="dark"]'))) assert.ok(name in light, `${name} has a light value`);
});

/** What index.html's boot script does with a stored value: the data-theme it leaves on <html>, and whether it threw. */
function boot(read: () => string | null): { theme: string | undefined; threw: boolean } {
  const html = readFileSync(here("../../../index.html"), "utf8");
  const body = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(body, "index.html has the boot script");
  const document = { documentElement: { dataset: {} as DOMStringMap } };
  const localStorage = {
    getItem: (key: string) => {
      assert.equal(key, THEME_KEY, "it reads the key the store writes");
      return read();
    },
  };
  let threw = false;
  try {
    new Function("localStorage", "document", body)(localStorage, document);
  } catch {
    threw = true;
  }
  return { theme: document.documentElement.dataset.theme, threw };
}

test("the page's boot script applies a stored light or dark before the first paint, and nothing else (review of #252, S2)", () => {
  assert.deepEqual(
    boot(() => "dark"),
    { theme: "dark", threw: false },
  );
  assert.deepEqual(
    boot(() => "light"),
    { theme: "light", threw: false },
  );
  for (const odd of [null, "system", "", "auto", "Dark"])
    assert.deepEqual(
      boot(() => odd),
      { theme: undefined, threw: false },
      `“${odd}”`,
    );
  assert.deepEqual(
    boot(() => {
      throw new Error("no storage");
    }),
    { theme: undefined, threw: false },
    "a browser without storage: the system's, no error",
  );
});

// WCAG 2.x contrast, from the tokens in index.css: what axe found under S5 (--fg-3 at 4.38:1, white on the dark spore badge).
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test("a lever name's three colours (spore, accent, error: ui/leverKinds.ts) clear 4.5:1 on the surfaces they sit on, in both themes", () => {
  const themes = { light: declarations(":root {"), dark: declarations(':root[data-theme="dark"]') };
  for (const [name, dark] of Object.entries(themes)) {
    const v = { ...themes.light, ...dark };
    // The upgrade tooltip and the ant card's chips are on raised; the Policy tab and the Levers tab on the panel and the ground.
    for (const text of ["--spore", "--accent", "--err"])
      for (const surface of ["--raised", "--panel", "--ground"]) {
        const c = contrast(v[text]!, v[surface]!);
        assert.ok(c >= 4.5, `${name}: ${text} on ${surface} is ${c.toFixed(2)}:1`);
      }
  }
});

test("body text clears 4.5:1 on every surface, in the light theme and the dark one", () => {
  const themes = { light: declarations(":root {"), dark: declarations(':root[data-theme="dark"]') };
  for (const [name, dark] of Object.entries(themes)) {
    const v = { ...themes.light, ...dark };
    for (const text of ["--fg", "--fg-2", "--fg-3"])
      for (const surface of ["--ground", "--paper", "--panel", "--raised"]) {
        const c = contrast(v[text]!, v[surface]!);
        assert.ok(c >= 4.5, `${name}: ${text} on ${surface} is ${c.toFixed(2)}:1`);
      }
    const badge = contrast(v["--spore-ink"]!, v["--spore"]!);
    assert.ok(badge >= 4.5, `${name}: the spore badge's text is ${badge.toFixed(2)}:1`);
  }
});
