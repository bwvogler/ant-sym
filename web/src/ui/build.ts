// The builder's tray, pure (docs/builder.md "Young children on a touch screen", PRD §73, ja-kjj8.3, ja-kjj8.5): which tools
// it shows, their pictures, names and gestures, and the rules for a touch. Pictures are illustrated icons (web/public/ui-icons):
// concrete and in colour, so a child who can't read knows them (Hiniker et al. 2016: abstract symbols fail below 5). The names
// are for the accessible label and the spoken name, never needed to use a tool.

import type { BuildTool } from "../colony/index.ts";
import { iconUrl } from "./iconUrl.ts";

/** A tray tool: Move pans the map with one finger; the rest are the builder's. */
/** A tray tool: Move pans the map with one finger; the tweezers lift an ant; the rest are strokes. */
export type TrayTool = "move" | "tweezers" | BuildTool;

/** The full tray (the 7-year-old's), in order. The crayon appears once per colony (up to CRAYONS). */
export const FULL: readonly TrayTool[] = [
  "move",
  "tweezers",
  "dig",
  "dirt",
  "rock",
  "sugar",
  "crumb",
  "aphids",
  "crayon",
  "noEntry",
  "rain",
];
/** The little-hands tray: four tools only, bigger still (owner, PRD §73). */
export const LITTLE: readonly TrayTool[] = ["move", "sugar", "dig", "rain"];
/** Crayons shown at most: one per colony, the first few. */
export const CRAYONS = 4;

export const LABEL: Record<TrayTool, string> = {
  move: "Move",
  tweezers: "Tweezers: pick up an ant",
  noEntry: "No entry sign",
  dig: "Dig",
  dirt: "Dirt",
  rock: "Rock",
  sugar: "Sugar",
  crumb: "Crumbs",
  aphids: "Aphids",
  crayon: "Trail crayon",
  rain: "Rain",
};

/** Each tool's icon file in web/public/ui-icons/builder (without `.png`). */
export const PICTURE: Record<TrayTool, string> = {
  move: "move",
  tweezers: "tweezers",
  noEntry: "no-entry",
  dig: "dig",
  dirt: "dirt",
  rock: "rock",
  sugar: "sugar",
  crumb: "crumb",
  aphids: "aphids",
  crayon: "trail-crayon",
  rain: "rain",
};

/** The tray's other buttons' icon files. */
export const EXTRA_PICTURE = {
  undo: "undo",
  smell: "smell-vision",
  little: "little-hands",
  done: "done-building",
} as const;

/** The URL of a tray tool's (or extra button's) icon. */
export const trayIconUrl = (picture: string): string => iconUrl("builder", picture);

/** The first-use demonstration's gesture: a tap, or a drag. */
export const GESTURE: Record<TrayTool, "tap" | "drag"> = {
  move: "drag",
  tweezers: "drag",
  noEntry: "drag",
  dig: "drag",
  dirt: "drag",
  rock: "tap",
  sugar: "tap",
  crumb: "tap",
  aphids: "tap",
  crayon: "drag",
  rain: "drag",
};

/**
 * Button sizes, CSS px: the full tray's 64 and the little tray's 88 (design: about 1.5× and 2× the 44 px usually given for
 * adults; no study gives a child's minimum, docs/builder.md).
 */
export const TRAY_PX = { full: 64, little: 88 } as const;

/** A touch whose contact is wider or taller than this many CSS px is a palm or a resting hand, and is ignored (design). */
export const PALM_PX = 60;

export interface TrayItem {
  tool: TrayTool;
  /** the crayon's colony */
  colony?: number;
  key: string;
  label: string;
  /** the icon file name (see PICTURE) */
  picture: string;
}

/**
 * The tray's tools: the little four, or the full set with a crayon per colony (`names`: each colony's name; `trails`: the species
 * lays a food trail; `tends`: it takes honeydew and tends aphids, docs/aphids.md).
 */
export function trayItems(little: boolean, names: readonly string[], trails = true, tends = true): TrayItem[] {
  const out: TrayItem[] = [];
  for (const tool of little ? LITTLE : FULL) {
    if (tool === "crayon") {
      // A species that lays no food trail (the desert ant, ja-rf5.11) gets no crayon: it would draw nothing its ants read.
      if (!trails) continue;
      names
        .slice(0, CRAYONS)
        .forEach((name, colony) =>
          out.push({ tool, colony, key: `crayon-${colony}`, label: `${LABEL.crayon}, ${name}`, picture: PICTURE.crayon }),
        );
    } else if (tool === "noEntry" && !trails)
      continue; // the sign turns trail followers: no trails, nothing to turn
    else if (tool === "aphids" && !tends)
      continue; // a species that takes no honeydew (the desert ant) would ignore them
    else out.push({ tool, key: tool, label: LABEL[tool], picture: PICTURE[tool] });
  }
  return out;
}

/** Whether a touch is a palm (its contact area too big for a fingertip). A mouse or pen reports 1 × 1 or 0 × 0. */
export function isPalm(e: { pointerType: string; width: number; height: number }): boolean {
  return e.pointerType === "touch" && (e.width > PALM_PX || e.height > PALM_PX);
}

/** The tools whose first use has been shown (per browser; the page works without it). */
const SEEN_KEY = "jevants.builder.seen";

export function seenTools(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(tool: TrayTool): void {
  try {
    const s = seenTools();
    s.add(tool);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    // no storage: the demonstration shows again next time
  }
}

/** A colony's tone on the page: its odour mixed from ink (0) to the warn tone (1), as its ants are drawn. */
export function colonyTone(odour: number): string {
  const t = Math.round(100 * Math.min(1, Math.max(0, odour)));
  return `color-mix(in srgb, var(--warn) ${t}%, var(--ink))`;
}
