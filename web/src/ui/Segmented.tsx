import type { ReactNode } from "react";
import { segButtonClass, segRowClass } from "./segmented.ts";

// A joined group of buttons (ja-fnd.6.4.5): see segmented.ts for what it looks like. Each option says for itself whether it is on and what
// picking it does, so a choice among several (the speed) and a set of independent switches (the trails drawn) are the same thing.

export interface SegOption {
  key: string;
  label: ReactNode;
  /** whether this button is the one chosen (or, for a switch, on) */
  on: boolean;
  onPick: () => void;
  title?: string;
  disabled?: boolean;
  /** the place's own classes for this button */
  className?: string;
}

export default function Segmented({
  options,
  label,
  role = "group",
  fill = false,
  soft = false,
  className = "",
}: {
  options: readonly SegOption[];
  /** names the group to a screen reader */
  label?: string;
  /** `tablist`: the buttons are tabs (aria-selected), else toggles (aria-pressed) */
  role?: "group" | "tablist";
  fill?: boolean;
  soft?: boolean;
  /** the group's own classes (a text size, a margin) */
  className?: string;
}) {
  const tabs = role === "tablist";
  return (
    <div className={segRowClass(className)} role={role} aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role={tabs ? "tab" : undefined}
          aria-selected={tabs ? o.on : undefined}
          aria-pressed={tabs ? undefined : o.on}
          className={segButtonClass(o.on, { fill, soft, more: o.className })}
          title={o.title}
          disabled={o.disabled}
          onClick={o.onPick}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
