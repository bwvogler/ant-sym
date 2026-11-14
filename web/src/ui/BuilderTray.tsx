import type { CSSProperties } from "react";
import { FLOAT } from "./kit.tsx";
import { colonyTone, GESTURE, TRAY_PX, type TrayItem, type TrayTool } from "./build.ts";

// The builder's tray (docs/builder.md, PRD §70, ja-kjj8.3, ja-kjj8.5): picture-only tools along the bottom of the screen,
// flush to its edge (Anthony et al.: targets at the edge are hit more often), with gaps between them. The tool in hand
// grows and takes a thick ring, never a glow alone (Hiniker et al. 2015: a look change alone is no prompt). The names are
// the buttons' accessible labels and their tooltips.

export default function BuilderTray({
  items,
  picked,
  little,
  smell,
  canUndo,
  odours,
  onPick,
  onUndo,
  onLittle,
  onSmell,
  onExit,
}: {
  items: readonly TrayItem[];
  /** the key of the tool in hand */
  picked: string;
  little: boolean;
  smell: boolean;
  canUndo: boolean;
  /** each colony's odour, for its crayon's colour */
  odours: readonly number[];
  onPick: (item: TrayItem) => void;
  onUndo: () => void;
  onLittle: () => void;
  onSmell: () => void;
  onExit: () => void;
}) {
  const px = little ? TRAY_PX.little : TRAY_PX.full;
  const size: CSSProperties = { width: px, height: px, fontSize: Math.round(px * 0.55) };
  const base = "relative grid shrink-0 place-items-center rounded-2xl transition-transform select-none disabled:opacity-30";
  const tool = (it: TrayItem) => {
    const on = it.key === picked;
    const ring = it.colony !== undefined ? colonyTone(odours[it.colony] ?? 0) : undefined;
    return (
      <button
        key={it.key}
        type="button"
        aria-label={it.label}
        title={it.label}
        aria-pressed={on}
        data-tool={it.key}
        className={`${base} ${on ? "z-10 scale-110 bg-accent-soft ring-4 ring-accent" : "bg-raised/70 hover:bg-raised"}`}
        style={{ ...size, ...(ring ? { boxShadow: `inset 0 -${Math.round(px / 7)}px 0 ${ring}` } : {}) }}
        onClick={() => onPick(it)}
      >
        <span aria-hidden>{it.picture}</span>
      </button>
    );
  };
  const extra = (label: string, picture: string, onClick: () => void, opts: { pressed?: boolean; disabled?: boolean } = {}) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={opts.pressed}
      disabled={opts.disabled}
      className={`${base} ${opts.pressed ? "bg-accent-soft ring-2 ring-accent" : "bg-raised/40 hover:bg-raised"}`}
      style={{ ...size, fontSize: Math.round(px * 0.45) }}
      onClick={onClick}
    >
      <span aria-hidden>{picture}</span>
    </button>
  );
  return (
    <nav
      aria-label="builder tools"
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[60rem] flex-wrap items-center justify-center gap-2 rounded-b-none px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${FLOAT}`}
    >
      {items.map(tool)}
      <span aria-hidden className="mx-1 h-10 w-px bg-line max-sm:hidden" />
      {extra("Undo", "↩️", onUndo, { disabled: !canUndo })}
      {!little && extra("Smell vision: see every trail", "👃", onSmell, { pressed: smell })}
      {extra(little ? "Big tray" : "Little hands", little ? "🧒" : "🧸", onLittle, { pressed: little })}
      {extra("Done building", "✅", onExit)}
    </nav>
  );
}

/** The first time a tool is picked: a finger shows its gesture over the map, with no words (Hiniker et al. 2015). */
export function ToolDemo({ tool }: { tool: TrayTool }) {
  const drag = GESTURE[tool] === "drag";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <span
        className={`text-7xl drop-shadow-lg ${drag ? "animate-[builder-drag_1.6s_ease-in-out_2]" : "animate-[builder-tap_0.8s_ease-in-out_3]"}`}
      >
        👆
      </span>
    </div>
  );
}
