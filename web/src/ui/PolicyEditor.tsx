import { useState } from "react";
import Segmented from "./Segmented.tsx";
import {
  chipClass,
  chipRowClass,
  growShape,
  type Preset,
  type PresetStyle,
  wordsBoxClass,
  wordsRules,
  type WordsRules,
} from "./policyEditing.ts";

// The one editor for a policy's words (ja-fnd.6.4.3, docs/refactor.md S5.4): the fungus's aim in the bar under the map, a colony's doctrine in
// the Lab, and the doctrine of a new queen's colony in the pen were three hand-written copies of the same two things, a row of presets and a
// box for the player's words. `PresetPicker` and `WordsBox` are those; each place lays them out as it needs and keeps its own meaning for a
// draft (the words as typed) and a commit (the words settled), so what is sent to Jev is the caller's, not this module's. What they do and
// look like is `policyEditing.ts`, which a test runs.

export function PresetPicker({
  presets,
  active,
  onPick,
  style = "segmented",
  label,
  disabled = false,
  className = "",
  extra,
}: {
  presets: readonly Preset[];
  /** whether the words in the box are this preset's */
  active: (p: Preset) => boolean;
  onPick: (p: Preset) => void;
  style?: PresetStyle;
  /** names the group to a screen reader */
  label?: string;
  disabled?: boolean;
  /** more classes for the row (a margin) */
  className?: string;
  /** more buttons at the end of a row of chips (the pen's "her mother's") */
  extra?: { name: string; onPick: () => void }[];
}) {
  if (style !== "chips")
    return (
      <Segmented
        label={label}
        className={`${style === "compact" ? "shrink-0 text-[13px]" : "text-sm"}${className ? ` ${className}` : ""}`}
        options={presets.map((p) => ({
          key: p.id,
          label: p.name,
          on: active(p),
          onPick: () => onPick(p),
          disabled,
          className: style === "compact" ? "px-2.5 py-1" : undefined,
        }))}
      />
    );
  return (
    <div className={chipRowClass(className)} role="group" aria-label={label}>
      {presets.map((p) => {
        const on = active(p);
        return (
          <button key={p.id} type="button" className={chipClass(on)} aria-pressed={on} disabled={disabled} onClick={() => onPick(p)}>
            {p.name}
          </button>
        );
      })}
      {extra?.map((x) => (
        <button key={x.name} type="button" className={chipClass(false)} disabled={disabled} onClick={x.onPick}>
          {x.name}
        </button>
      ))}
    </div>
  );
}

export function WordsBox({
  value,
  label,
  className = "",
  rows,
  grow = false,
  disabled = false,
  title,
  ...rules
}: WordsRules & {
  value: string;
  /** names the box to a screen reader */
  label: string;
  /** size and spacing: the place's own */
  className?: string;
  rows?: number;
  /** one line until it has focus, then four (the aim bar) */
  grow?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const on = wordsRules(rules);
  const shape = grow ? growShape(open) : { rows, wrap: undefined };
  return (
    <textarea
      className={wordsBoxClass(className, grow, open)}
      rows={shape.rows}
      wrap={shape.wrap}
      value={value}
      disabled={disabled}
      title={title}
      onFocus={grow ? () => setOpen(true) : undefined}
      onChange={on.change}
      onBlur={(e) => {
        setOpen(false);
        on.blur(e);
      }}
      onKeyDown={on.key}
      aria-label={label}
    />
  );
}
