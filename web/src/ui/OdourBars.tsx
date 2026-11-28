import { odourToneRgb, type Rgb } from "./field/colour.ts";
import type { OdourAxisRow } from "./odourLens.ts";

// An odour as the contact sense reads it (ja-zg1u.8): one small bar a number, the nest's value as a tick on it, and a swatch of the colour the field draws
// it in. The bars and the numbers carry everything the swatch does, so the readout does not rest on colour.

/** A page colour as rgb: `#rrggbb` (the page's tokens are all of that form). */
function rgbOf(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
}

/** The tone the field draws an odour in, as a CSS colour, from the page's own ink and warn tones now (the theme may have changed since the last draw). */
function pageTone(values: readonly number[]): string {
  if (typeof document === "undefined") return "transparent";
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const [r, g, b] = odourToneRgb(rgbOf(css("--ink")), rgbOf(css("--warn")), values, 0, values.length);
  return `rgb(${r}, ${g}, ${b})`;
}

/** A swatch of an odour's field colour. */
export function OdourSwatch({ values, label }: { values: readonly number[]; label: string }) {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-sm border border-line-strong align-middle"
      style={{ background: pageTone(values) }}
      role="img"
      aria-label={label}
    />
  );
}

/** The axes' bars: each 0 to 1, the nest's value as a tick (when there is one). */
export function OdourBars({ rows }: { rows: readonly OdourAxisRow[] }) {
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="odour axes">
      {rows.map((r) => (
        <div key={r.axis} className="flex items-center gap-2 font-mono text-xs" data-axis={r.axis}>
          <span className="w-12 shrink-0 whitespace-nowrap text-fg-3">axis {r.axis + 1}</span>
          <span className="relative h-1.5 w-28 shrink-0 overflow-hidden rounded bg-raised">
            <span
              className="absolute inset-y-0 left-0 bg-accent"
              style={{ width: `${Math.round(100 * Math.min(1, Math.max(0, r.value)))}%` }}
            />
            {r.nest !== null && (
              <span
                className="absolute inset-y-0 w-px bg-fg"
                style={{ left: `${Math.round(100 * Math.min(1, Math.max(0, r.nest)))}%` }}
                title={`its nest: ${r.nest.toFixed(2)}`}
              />
            )}
          </span>
          <span className="text-fg-2 tabular-nums">{r.value.toFixed(2)}</span>
          {r.nest !== null && <span className="text-fg-3 tabular-nums">nest {r.nest.toFixed(2)}</span>}
        </div>
      ))}
    </div>
  );
}
