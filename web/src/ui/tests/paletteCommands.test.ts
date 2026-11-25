import assert from "node:assert/strict";
import { test } from "node:test";
import type { Game } from "../../colony/index.ts";
import { GUIDE, guideFor } from "../guide.ts";
import { learnTarget } from "../learn.ts";
import { lensNow, offerProbe } from "../lensStore.ts";
import { colonyName } from "../names.ts";
import { paletteCommands, type PaletteCtx } from "../paletteCommands.ts";
import { getTheme, setTheme, THEMES } from "../theme.ts";
import { NOTICE_LEVELS, noticeLevel, setNoticeLevel } from "../toasts.ts";

// The command palette's commands (ja-fnd.6.2): the list the page gives the palette, and what each one does, from a fake page.

function setup(o: Partial<PaletteCtx> = {}, endless = false) {
  const calls: string[] = [];
  const game = {
    map: { endless },
    colonies: [{ ph: { has: () => true } }, { ph: { has: () => true } }],
    params: { species: { id: "generic" } },
  } as unknown as Game;
  const ctx: PaletteCtx = {
    game,
    controls: { playing: true, speed: 2, view: "above" },
    speeds: [1, 2, 4, 8],
    oneWorld: true,
    lab: false,
    lensOn: false,
    noticeLevel: "all",
    theme: "system",
    field: { current: { showAll: () => calls.push("showAll"), goNest: (k: number) => calls.push(`goNest ${k}`) } } as never,
    update: (p) => calls.push(`update ${JSON.stringify(p)}`),
    setView: (v) => calls.push(`setView ${v}`),
    setDrawer: (d) => calls.push(`setDrawer ${d}`),
    followHost: () => calls.push("followHost"),
    toggleLab: () => calls.push("toggleLab"),
    toggleLens: () => calls.push("toggleLens"),
    openSheet: () => calls.push("openSheet"),
    ...o,
  };
  const cmds = paletteCommands(ctx);
  const by = (id: string) => cmds.find((c) => c.id === id)!;
  return { cmds, by, calls, ctx };
}

test("the game's commands: play or pause by state, each speed with its key and 'now' on the current one, the views by the world and 'shown' on the current", () => {
  const { by, cmds, calls } = setup();
  assert.equal(by("play").label, "Pause");
  assert.equal(by("play").key, "Space");
  by("play").run();
  assert.deepEqual(calls.splice(0), ['update {"playing":false}']);
  assert.equal(setup({ controls: { playing: false, speed: 2, view: "above" } }).by("play").label, "Play");
  assert.deepEqual(
    cmds.filter((c) => c.id.startsWith("speed-")).map((c) => [c.id, c.label, c.key, c.off]),
    [
      ["speed-1", "Speed 1×", "1", undefined],
      ["speed-2", "Speed 2×", "2", "now"],
      ["speed-4", "Speed 4×", "3", undefined],
      ["speed-8", "Speed 8×", "4", undefined],
    ],
  );
  by("speed-4").run();
  assert.deepEqual(calls.splice(0), ['update {"speed":4}']);
  assert.equal(by("view-above").off, "shown");
  assert.equal(by("view-below").off, undefined);
  by("view-below").run();
  assert.deepEqual(calls.splice(0), ["setView below"]);
  by("host").run();
  assert.deepEqual(calls.splice(0), ["followHost"]);
});

test("there are no views to choose where there is no one world", () => {
  const { cmds } = setup({ oneWorld: false });
  assert.deepEqual(
    cmds.filter((c) => c.id.startsWith("view-")),
    [],
  );
});

test("the map's commands: the whole map, and a nest for each colony by its name", () => {
  const { by, cmds, calls } = setup();
  by("whole").run();
  assert.deepEqual(calls.splice(0), ["showAll"]);
  const nests = cmds.filter((c) => c.id.startsWith("nest-"));
  assert.deepEqual(
    nests.map((c) => c.label),
    [0, 1].map((k) => `Go to ${colonyName(k)}'s nest`),
  );
  nests[1]!.run();
  assert.deepEqual(calls.splice(0), ["goNest 1"]);
  // An endless plane has no whole map: the key 0 goes back to the start (PRD §66 E6).
  assert.equal(by("whole").label, "Whole map");
  const home = setup({}, true).by("whole");
  assert.equal(home.label, "Start");
  assert.equal(home.key, "0");
});

test("the panels: five drawers, the Codex's guide, and the Lab by whether it is open", () => {
  const { by, cmds, calls } = setup();
  assert.deepEqual(
    cmds.filter((c) => c.id.startsWith("drawer-")).map((c) => c.id),
    ["drawer-fungus", "drawer-evolve", "drawer-colonies", "drawer-saves", "drawer-settings"],
  );
  by("drawer-saves").run();
  assert.deepEqual(calls.splice(0), ["setDrawer saves"]);
  by("learn").run();
  assert.deepEqual(learnTarget(), { tab: "guide" });
  assert.equal(by("lab").label, "Lab mode: history, policy, world, Jev, levers, steps");
  assert.equal(setup({ lab: true }).by("lab").label, "Close the Lab");
  by("lab").run();
  assert.deepEqual(calls.splice(0), ["toggleLab"]);
});

test("help: the lens by whether it is on, the shortcuts sheet, the notice levels and the themes, each 'in use' on the current one", () => {
  const { by, cmds, calls } = setup();
  assert.equal(by("lens").label, "Lens: say what is under the pointer");
  assert.equal(setup({ lensOn: true }).by("lens").label, "Lens off");
  by("lens").run();
  by("shortcuts").run();
  assert.deepEqual(calls.splice(0), ["toggleLens", "openSheet"]);
  assert.deepEqual(
    cmds.filter((c) => c.id.startsWith("notices-")).map((c) => [c.id, c.off]),
    NOTICE_LEVELS.map((l) => [`notices-${l}`, l === "all" ? "in use" : undefined]),
  );
  assert.deepEqual(
    cmds.filter((c) => c.id.startsWith("theme-")).map((c) => [c.id, c.off]),
    THEMES.map((t) => [`theme-${t}`, t === "system" ? "in use" : undefined]),
  );
  assert.ok(by("theme-system").label.endsWith("(follow the device)"));
  assert.ok(!by("theme-dark").label.includes("follow"));
});

test("the Codex: an entry for each guide page the game has met, for the game's species, and one opens its entry", () => {
  const { cmds, ctx } = setup();
  const entries = guideFor((c) => ctx.game.colonies[0]!.ph.has(c), "generic");
  const learn = cmds.filter((c) => c.id.startsWith("learn-"));
  assert.deepEqual(
    learn.map((c) => c.id),
    entries.map((e) => `learn-${e.id}`),
  );
  assert.ok(learn.length > 0);
  learn[0]!.run();
  assert.deepEqual(learnTarget(), { tab: "guide", id: entries[0]!.id });
  assert.equal(learn[0]!.label, `Codex: ${entries[0]!.title}`);
  // the species' own pages come with the species: a game of a species that has pages of its own lists them, and the generic game does not
  const own = GUIDE.find((e) => e.species !== undefined);
  assert.ok(own, "the guide has a species' own page");
  const game = {
    map: { endless: false },
    colonies: [{ ph: { has: () => true } }],
    params: { species: { id: own!.species } },
  } as unknown as Game;
  const ids = setup({ game }).cmds.map((c) => c.id);
  assert.ok(ids.includes(`learn-${own!.id}`), "its own page is in the palette");
  assert.ok(!cmds.some((c) => c.id === `learn-${own!.id}`), "and not in the generic game's");
});

test("running any command first closes a pinned lens card", () => {
  const probe = { sx: 1, sy: 1, lv: 0, x: 1, y: 1, ant: null, pinned: true };
  for (const id of ["play", "speed-1", "whole", "drawer-fungus", "lens", "shortcuts", "learn", "lab"]) {
    offerProbe(probe);
    assert.notEqual(lensNow().pinned, null, "a card is pinned");
    setup().by(id).run();
    assert.equal(lensNow().pinned, null, `${id}: the card is closed`);
  }
});

test("every command has an id of its own, a label and a group", () => {
  const { cmds } = setup();
  assert.equal(new Set(cmds.map((c) => c.id)).size, cmds.length);
  for (const c of cmds) assert.ok(c.label && c.group, c.id);
});

/** Every command the palette lists that is not a Codex entry: id, group, key hint, search words, label (for the page at the setup's state). */
const EXPECTED: [string, string, string | undefined, string, string][] = [
  ["play", "Game", "Space", "pause play stop go", "Pause"],
  ["speed-1", "Game", "1", "fast slow", "Speed 1×"],
  ["speed-2", "Game", "2", "fast slow", "Speed 2×"],
  ["speed-4", "Game", "3", "fast slow", "Speed 4×"],
  ["speed-8", "Game", "4", "fast slow", "Speed 8×"],
  ["view-above", "Game", "v", "surface top", "View above"],
  ["view-below", "Game", "v", "underground nest side", "View below"],
  ["host", "Game", "f", "infected ant", "Follow a host of yours"],
  ["whole", "Map", "0", "zoom out fit home start", "Whole map"],
  ["nest-0", "Map", undefined, "colony hole", `Go to ${colonyName(0)}'s nest`],
  ["nest-1", "Map", undefined, "colony hole", `Go to ${colonyName(1)}'s nest`],
  ["drawer-fungus", "Panels", undefined, "infection aim", "The fungus"],
  ["drawer-evolve", "Panels", undefined, "evolve body upgrades", "Mutations"],
  ["drawer-colonies", "Panels", undefined, "numbers", "Colonies"],
  ["drawer-saves", "Panels", undefined, "save load continue", "Saved games"],
  ["drawer-settings", "Panels", undefined, "trails passphrase", "Settings"],
  ["learn", "Panels", undefined, "help guide learn", "Codex: the field guide"],
  [
    "lab",
    "Panels",
    "l",
    "details debug seed world jev spend history charts step numbers journal policy doctrine",
    "Lab mode: history, policy, world, Jev, levers, steps",
  ],
  ["lens", "Help", "i", "explain inspect what", "Lens: say what is under the pointer"],
  ["shortcuts", "Help", "?", "keys", "Keyboard shortcuts"],
  ["notices-all", "Help", undefined, "toasts notifications quiet mute kid bell", "Notices over the map: all"],
  ["notices-important", "Help", undefined, "toasts notifications quiet mute kid bell", "Notices over the map: important only"],
  ["notices-bell", "Help", undefined, "toasts notifications quiet mute kid bell", "Notices over the map: bell only"],
  ["theme-system", "Help", undefined, "theme dark light mode night day colour", "Appearance: system (follow the device)"],
  ["theme-light", "Help", undefined, "theme dark light mode night day colour", "Appearance: light"],
  ["theme-dark", "Help", undefined, "theme dark light mode night day colour", "Appearance: dark"],
];

test("every command is as listed: its group, key hint, search words and label (the hints are what the palette shows)", () => {
  const { cmds } = setup();
  const own = cmds.filter((c) => c.group !== "Codex");
  assert.deepEqual(
    own.map((c) => [c.id, c.group, c.key, c.words, c.label]),
    EXPECTED,
  );
  for (const c of cmds.filter((c) => c.group === "Codex")) {
    assert.equal(c.id.slice(0, 6), "learn-");
    assert.equal(c.words, "learn guide");
    assert.equal(c.key, undefined);
  }
});

test("choosing a notice level or a theme sets it", () => {
  const g = globalThis as { document?: unknown };
  const had = g.document;
  g.document = { documentElement: { dataset: {} } }; // the theme shows itself on <html>
  try {
    const { by } = setup();
    for (const l of NOTICE_LEVELS) {
      by(`notices-${l}`).run();
      assert.equal(noticeLevel(), l);
    }
    for (const t of THEMES) {
      by(`theme-${t}`).run();
      assert.equal(getTheme(), t);
    }
  } finally {
    setNoticeLevel("all");
    setTheme("system");
    g.document = had;
  }
});
