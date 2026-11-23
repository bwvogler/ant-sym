import { useEffect, useRef, useState } from "react";
import { type Colony, PLANE, type OneWorld } from "../colony/index.ts";
import { colonyName } from "./names.ts";

// The "Go to" menu over the field (PRD §69; ja-fnd.6.3.12, docs/field-split.md): one compact menu, so the overlay never runs off a phone's width. The
// whole map, each colony's nest, and the chamber-labels toggle. It lives here, not in field/, which is plain TypeScript with no React.

export default function FieldGoToMenu({
  colonies,
  world,
  view,
  toolsAt,
  labels,
  onLabels,
  showAll,
  goNest,
}: {
  colonies: readonly Colony[];
  world: OneWorld;
  /** the view shown: its map decides whether there are chambers to label */
  view: number;
  /** where the menu sits over the field (position classes; the page keeps it clear of its own surfaces) */
  toolsAt: string;
  labels: boolean;
  onLabels: (on: (was: boolean) => boolean) => void;
  showAll: () => void;
  goNest: (k: number) => void;
}) {
  const [goOpen, setGoOpen] = useState(false);
  const goRef = useRef<HTMLDivElement>(null);
  // The Go to menu, open: Escape closes it (first, in the capture phase, so a drawer under it stays open) and so does a
  // press anywhere outside it. An Escape something above it took (a pinned lens card) or one a dialog over it will take
  // (the palette) is not its own: one Escape closes one thing (review of #196, S1).
  useEffect(() => {
    if (!goOpen) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setGoOpen(false);
    };
    const outside = (e: globalThis.PointerEvent) => {
      if (!goRef.current?.contains(e.target as Node)) setGoOpen(false);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
    };
  }, [goOpen]);
  const button =
    "pointer-events-auto rounded-md border border-line bg-panel/90 px-2.5 py-1 text-xs text-fg-2 shadow-sm backdrop-blur-sm hover:bg-raised";
  const item = "rounded-md px-3 py-1.5 text-left text-xs text-fg-2 hover:bg-raised";
  return (
    <div ref={goRef} className={`pointer-events-none absolute flex flex-col items-start gap-1 ${toolsAt}`}>
      <button
        type="button"
        className={button}
        aria-expanded={goOpen}
        onClick={() => setGoOpen((o) => !o)}
        title="Whole map, a colony's nest, chamber labels"
      >
        Go to ▾
      </button>
      {goOpen && (
        <div
          className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-lg"
          role="group"
          aria-label="go to"
        >
          <button type="button" className={item} onClick={() => (showAll(), setGoOpen(false))} title="Show the whole map (0)">
            Whole map
          </button>
          {colonies.map((_, k) => (
            <button
              key={k}
              type="button"
              className={item}
              onClick={() => (goNest(k), setGoOpen(false))}
              title={`Go to the ${colonyName(k)} colony's nest (n cycles nests)`}
            >
              {colonyName(k)} nest
            </button>
          ))}
          {(view === PLANE ? world.plane : world.curtain).chambers && (
            <button
              type="button"
              className={labels ? `${item} text-accent` : item}
              aria-pressed={labels}
              onClick={() => onLabels((on) => !on)}
              title="Name each chamber by its role; click a chamber to inspect it in the Codex"
            >
              {labels ? "✓ " : ""}Chamber labels
            </button>
          )}
        </div>
      )}
    </div>
  );
}
