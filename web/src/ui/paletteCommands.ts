import type { RefObject } from "react";
import type { Game } from "../colony/index.ts";
import type { FieldApi } from "./field/api.ts";
import { guideFor } from "./guide.ts";
import { openLearn } from "./learn.ts";
import { clearProbe } from "./lensStore.ts";
import { colonyName } from "./names.ts";
import type { Command } from "./commands.ts";
import { setTheme, THEME_LABEL, THEMES, type Theme } from "./theme.ts";
import { NOTICE_LEVEL_LABEL, NOTICE_LEVELS, setNoticeLevel } from "./toasts.ts";
import type { ColonyControls } from "./useColony.ts";

// The command palette's commands (PRD §69.3, ja-mvo9.2; ja-fnd.6.2, docs/refactor.md S5.2): everything the HUD, the rail, the map's menu and the keys do,
// and every guide entry, as the list the palette ranks (commands.ts). What ColonyApp's Page built inline, as a function of what the page holds: it
// reads that through `PaletteCtx` and nothing else, so a Node test runs it. Running a command closes a pinned lens card first, which would otherwise
// stay over what the command opens (review of #196, N4).

/** What the commands read of the page, and the page's actions they call. */
export interface PaletteCtx {
  game: Game;
  controls: Pick<ColonyControls, "playing" | "speed" | "view">;
  /** the speeds the HUD offers (the keys 1 to 4) */
  speeds: readonly number[];
  oneWorld: boolean;
  /** the Lab is open */
  lab: boolean;
  /** the lens is on */
  lensOn: boolean;
  noticeLevel: string;
  theme: Theme;
  field: RefObject<FieldApi | null>;
  update: (patch: Partial<ColonyControls>) => void;
  setView: (view: "above" | "below") => void;
  setDrawer: (d: "fungus" | "evolve" | "colonies" | "saves" | "settings") => void;
  followHost: () => void;
  toggleLab: () => void;
  toggleLens: () => void;
  openSheet: () => void;
}

/** A command the page can run now (Palette.tsx's `Runnable`). */
export interface PaletteCommand extends Command {
  run: () => void;
}

export function paletteCommands(ctx: PaletteCtx): PaletteCommand[] {
  const {
    game,
    controls,
    speeds,
    oneWorld,
    lab,
    lensOn,
    noticeLevel,
    theme,
    field,
    update,
    setView,
    setDrawer,
    followHost,
    toggleLab,
    toggleLens,
    openSheet,
  } = ctx;
  const SPEEDS = speeds;
  return [
    {
      id: "play",
      label: controls.playing ? "Pause" : "Play",
      group: "Game",
      key: "Space",
      words: "pause play stop go",
      run: () => update({ playing: !controls.playing }),
    },
    ...SPEEDS.map((v, j) => ({
      id: `speed-${v}`,
      label: `Speed ${v}×`,
      group: "Game",
      key: String(j + 1),
      words: "fast slow",
      ...(controls.speed === v ? { off: "now" } : {}),
      run: () => update({ speed: v }),
    })),
    ...(oneWorld
      ? (["above", "below"] as const).map((v) => ({
          id: `view-${v}`,
          label: `View ${v}`,
          group: "Game",
          key: "v",
          words: v === "above" ? "surface top" : "underground nest side",
          ...(controls.view === v ? { off: "shown" } : {}),
          run: () => setView(v),
        }))
      : []),
    { id: "host", label: "Follow a host of yours", group: "Game", key: "f", words: "infected ant", run: followHost },
    { id: "whole", label: "Whole map", group: "Map", key: "0", words: "zoom out fit", run: () => field.current?.showAll() },
    ...game.colonies.map((_, k) => ({
      id: `nest-${k}`,
      label: `Go to ${colonyName(k)}'s nest`,
      group: "Map",
      words: "colony hole",
      run: () => field.current?.goNest(k),
    })),
    ...(
      [
        ["fungus", "The fungus", "infection aim"],
        ["evolve", "Mutations", "evolve body upgrades"],
        ["colonies", "Colonies", "numbers"],
        ["saves", "Saved games", "save load continue"],
        ["settings", "Settings", "trails passphrase"],
      ] as const
    ).map(([d, label, words]) => ({ id: `drawer-${d}`, label, group: "Panels", words, run: () => setDrawer(d) })),
    { id: "learn", label: "Codex: the field guide", group: "Panels", words: "help guide learn", run: () => openLearn({ tab: "guide" }) },
    {
      id: "lab",
      label: lab ? "Close the Lab" : "Lab mode: history, policy, world, Jev, levers, steps",
      group: "Panels",
      key: "l",
      words: "details debug seed world jev spend history charts step numbers journal policy doctrine",
      run: toggleLab,
    },
    {
      id: "lens",
      label: lensOn ? "Lens off" : "Lens: say what is under the pointer",
      group: "Help",
      key: "i",
      words: "explain inspect what",
      run: toggleLens,
    },
    { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", key: "?", words: "keys", run: openSheet },
    ...NOTICE_LEVELS.map((l) => ({
      id: `notices-${l}`,
      label: `Notices over the map: ${NOTICE_LEVEL_LABEL[l].toLowerCase()}`,
      group: "Help",
      words: "toasts notifications quiet mute kid bell",
      off: noticeLevel === l ? "in use" : undefined,
      run: () => setNoticeLevel(l),
    })),
    ...THEMES.map((t) => ({
      id: `theme-${t}`,
      label: `Appearance: ${THEME_LABEL[t].toLowerCase()}${t === "system" ? " (follow the device)" : ""}`,
      group: "Help",
      words: "theme dark light mode night day colour",
      off: theme === t ? "in use" : undefined,
      run: () => setTheme(t),
    })),
    ...guideFor((c) => game.colonies[0]!.ph.has(c), game.params.species.id).map((e) => ({
      id: `learn-${e.id}`,
      label: `Codex: ${e.title}`,
      group: "Codex",
      words: "learn guide",
      run: () => openLearn({ tab: "guide", id: e.id }),
    })),
  ].map((c) => ({ ...c, run: () => (clearProbe(), c.run()) }));
}
