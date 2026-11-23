import assert from "node:assert/strict";
import { test } from "node:test";
import type { Game } from "../../colony/index.ts";
import { guideFor } from "../guide.ts";
import { learnTarget } from "../learn.ts";
import { lensNow, offerProbe } from "../lensStore.ts";
import { colonyName } from "../names.ts";
import { paletteCommands, type PaletteCtx } from "../paletteCommands.ts";
import { THEMES } from "../theme.ts";
import { NOTICE_LEVELS } from "../toasts.ts";

// The command palette's commands (ja-fnd.6.2): the list the page gives the palette, and what each one does, from a fake page.

function setup(o: Partial<PaletteCtx> = {}) {
  const calls: string[] = [];
  const game = {
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

test("the Codex: an entry for each guide page the game has met, and one opens its entry", () => {
  const { cmds, game } = setup() as unknown as { cmds: ReturnType<typeof paletteCommands>; game: Game };
  void game;
  const { ctx } = setup();
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

test("each command is in its group, and the views carry the words that find them", () => {
  const { cmds, by } = setup();
  const group = (id: string): string => {
    if (/^(play|speed-|view-|host)/.test(id)) return "Game";
    if (/^(whole|nest-)/.test(id)) return "Map";
    if (/^(drawer-|learn$|lab$)/.test(id)) return "Panels";
    if (/^learn-/.test(id)) return "Codex";
    return "Help";
  };
  for (const c of cmds) assert.equal(c.group, group(c.id), c.id);
  assert.equal(by("view-above").words, "surface top");
  assert.equal(by("view-below").words, "underground nest side");
  assert.equal(by("host").words, "infected ant");
});
