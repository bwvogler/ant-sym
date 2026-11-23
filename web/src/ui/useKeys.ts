import { useCallback, useEffect, useState } from "react";
import { toggleLab } from "./labStore.ts";
import { clearProbe } from "./lensStore.ts";
import { pageKey } from "./keys.ts";
import type { ColonyControls } from "./useColony.ts";

// The page's keys and what they open (PRD §69.3; ja-fnd.6.2, docs/refactor.md S5.2): the command palette, the shortcuts sheet and the lens, and the one key
// handler (keys.ts: one handler, one table, which the shortcuts sheet reads). What ColonyApp's Page held inline.

/** A dialog that has the page: the game's keys wait while one is open (the palette's key still works). */
const BLOCKING = ['[aria-modal="true"]', ...["Codex", "Start", "The queen's pen"].map((l) => `[role="dialog"][aria-label="${l}"]`)].join(
  ", ",
);

export function useKeys({
  playing,
  view,
  speeds,
  update,
  oneWorld,
  setView,
  followHost,
}: {
  playing: boolean;
  view: ColonyControls["view"];
  /** the speeds the HUD offers (the keys 1 to 4) */
  speeds: readonly number[];
  update: (patch: Partial<ColonyControls>) => void;
  oneWorld: boolean;
  setView: (view: "above" | "below") => void;
  followHost: () => void;
}) {
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  // Where the lens looks lives in a store (ui/lensStore.ts) the map reports to and LensLayer reads: the page doesn't
  // re-render as the pointer moves (review of #196, N3).
  const toggleLens = useCallback(() => {
    setLensOn((on) => !on);
    clearProbe();
  }, []);
  // The page's keys (ui/keys.ts): one handler, one table, which the shortcuts sheet reads.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const toggleInput = t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio");
      const a = pageKey(
        {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          alt: e.altKey,
          typing: !!t && (t.isContentEditable || (!toggleInput && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))),
          control:
            toggleInput || !!t?.closest("button, a[href], summary, [role='button'], [role='option'], [role='tab'], [role='menuitem']"),
        },
        speeds,
      );
      if (!a) return;
      // Over a dialog that has the page (the palette, the sheet, the Codex, the start, the queen's pen) only the
      // palette's key works: the game's keys wait.
      if (a.kind !== "palette" && document.querySelector(BLOCKING)) return;
      e.preventDefault();
      if (a.kind === "palette") {
        setSheet(false);
        setPalette((o) => !o);
      } else if (a.kind === "shortcuts") setSheet(true);
      else if (a.kind === "lens") toggleLens();
      else if (a.kind === "lab") toggleLab();
      else if (a.kind === "play") update({ playing: !playing });
      else if (a.kind === "speed") update({ speed: a.speed });
      else if (a.kind === "view") {
        if (oneWorld) setView(view === "above" ? "below" : "above");
      } else followHost();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [playing, view, speeds, update, oneWorld, setView, followHost, toggleLens]);
  return { palette, setPalette, sheet, setSheet, lensOn, toggleLens };
}
