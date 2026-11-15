import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { clock } from "./clock.ts";
import { chartKey, endLabels, linePath, nearestSample, type Sample } from "./history.ts";

// One of Lab mode's history charts (PRD §69.7): a line chart of a measure over game time, small multiples sharing the
// time axis. The dataviz skill's specs: 2 px lines with round joins, recessive hairline grid, a legend for two or more
// lines and a name at each line's end where they don't collide, text in the text tokens (a short line key carries the
// colour), a crosshair that snaps to the nearest sample and reads out every line there (the pointer, or the arrow keys once
// the chart has focus). A line with no value yet (a colony not founded) leaves a gap. The History tab adds the table.

export interface Series {
  name: string;
  /** a CSS colour: var(--series-n) */
  color: string;
  /** one a sample; null where there is none (a gap, not 0) */
  values: readonly (number | null)[];
}

const H = 120;
const M = { top: 8, right: 64, bottom: 18, left: 40 };

export default function HistoryChart({
  title,
  samples,
  series,
  yMax,
  format,
}: {
  title: string;
  samples: readonly Sample[];
  series: readonly Series[];
  yMax: number;
  /** a value as read out: on the y axis, the end labels and the crosshair */
  format: (v: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const [at, setAt] = useState(-1);
  const ph = H - M.top - M.bottom;
  const y = (v: number) => M.top + ph - (Math.min(v, yMax) / yMax) * ph;
  const last = samples.length - 1;
  const read = (v: number | null | undefined) => (v === null || v === undefined ? "—" : format(v));
  const ends = endLabels(
    series.map((s) => ({ name: s.name, value: s.values[last] ?? null })),
    y,
    format,
  );
  const endText = (e: (typeof ends)[number]) => (series.length > 1 ? `${e.names.join(" · ")} ${format(e.value)}` : format(e.value));
  // The right margin fits the longest end label (11 px text, about 6.4 px a character), within reason.
  const right = Math.min(160, Math.max(M.right, 12 + Math.ceil(6.4 * Math.max(0, ...ends.map((e) => endText(e).length)))));
  const pw = w - M.left - right;
  const t0 = samples[0]?.t ?? 0;
  const t1 = Math.max(t0 + 1, samples[samples.length - 1]?.t ?? 1);
  const x = (t: number) => M.left + ((t - t0) / (t1 - t0)) * pw;
  const hover = at >= 0 && at <= last ? at : -1;
  const onKey = (e: KeyboardEvent) => {
    const to = chartKey(e.key, hover, last);
    if (to === null) return;
    e.preventDefault();
    setAt(to);
  };
  return (
    <figure className="min-w-0" aria-label={title}>
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-fg-2">{title}</span>
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.name} className="flex items-center gap-1 text-fg-3">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
      </figcaption>
      <div ref={box} className="relative mt-1">
        <svg
          width={w}
          height={H}
          className="block touch-none rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
          role="img"
          tabIndex={0}
          aria-label={`${title}: ${series.map((s) => `${s.name} ${read(s.values[last])}`).join(", ")} now. The arrow keys read back through time.`}
          onKeyDown={onKey}
          onBlur={() => setAt(-1)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = t0 + ((e.clientX - r.left - M.left) / pw) * (t1 - t0);
            setAt(nearestSample(samples, t));
          }}
          onPointerLeave={() => setAt(-1)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={M.left} x2={M.left + pw} y1={y(f * yMax)} y2={y(f * yMax)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 6} y={y(f * yMax)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--fg-3)">
                {format(f * yMax)}
              </text>
            </g>
          ))}
          <text x={M.left} y={H - 4} fontSize={10} fill="var(--fg-3)">
            {clock(t0)}
          </text>
          <text x={M.left + pw} y={H - 4} fontSize={10} fill="var(--fg-3)" textAnchor="end">
            {clock(t1)}
          </text>
          {series.map((s) => (
            <path
              key={s.name}
              d={linePath(s.values, (i) => x(samples[i]!.t), y)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {ends.map((e) => (
            <text key={e.names[0]} x={M.left + pw + 6} y={e.y} dy="0.32em" fontSize={11} fill="var(--fg-2)">
              {endText(e)}
            </text>
          ))}
          {hover >= 0 && (
            <g>
              <line
                x1={x(samples[hover]!.t)}
                x2={x(samples[hover]!.t)}
                y1={M.top}
                y2={M.top + ph}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = s.values[hover] ?? null;
                return v === null ? null : (
                  <circle key={s.name} cx={x(samples[hover]!.t)} cy={y(v)} r={4} fill={s.color} stroke="var(--ground)" strokeWidth={2} />
                );
              })}
            </g>
          )}
        </svg>
        {hover >= 0 && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-md"
            style={x(samples[hover]!.t) > w / 2 ? { right: w - x(samples[hover]!.t) + 8 } : { left: x(samples[hover]!.t) + 8 }}
          >
            <div className="font-mono text-fg-3">{clock(samples[hover]!.t)}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-fg-2">
                <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.name} <span className="ml-auto pl-2 font-mono text-fg tabular-nums">{read(s.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
