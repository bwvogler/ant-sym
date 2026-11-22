// A fake CanvasRenderingContext2D that records what a layer does to it (ja-fnd.6.3.5, docs/field-split.md "the recording fake context"): every
// method call and every property set, in order, as one line each: `arc(100, 20.5, 3, 0, 6.283)`, `fillStyle = #ink`. A layer's log is its
// behaviour without a browser; the Chromium scenes (scripts/field-shots.mjs) confirm that the logs are of what the pixels show. Text is measured
// as half its font size a character, so widths are the same on every machine. Numbers are rounded to 3 places.

const PROPS = new Set([
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "globalAlpha",
  "font",
  "textAlign",
  "textBaseline",
  "imageSmoothingEnabled",
  "globalCompositeOperation",
]);

const DEFAULTS: Record<string, unknown> = {
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  globalAlpha: 1,
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  imageSmoothingEnabled: true,
  globalCompositeOperation: "source-over",
};

const fmt = (v: unknown): string => {
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (Array.isArray(v)) return `[${v.map(fmt).join(", ")}]`;
  return String(v);
};

export interface Recording {
  ctx: CanvasRenderingContext2D;
  /** every call and property set, in order, one line each */
  log: string[];
  /** the property values now */
  state: Record<string, unknown>;
}

export function recordingContext(): Recording {
  const log: string[] = [];
  const state: Record<string, unknown> = { ...DEFAULTS };
  const ctx = new Proxy(
    {},
    {
      get(_t, name) {
        const n = String(name);
        if (PROPS.has(n)) return state[n];
        return (...args: unknown[]) => {
          log.push(`${n}(${args.map(fmt).join(", ")})`);
          if (n === "measureText") {
            const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
            return { width: String(args[0]).length * px * 0.5 };
          }
          return undefined;
        };
      },
      set(_t, name, value) {
        const n = String(name);
        state[n] = value;
        log.push(`${n} = ${fmt(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log, state };
}

/** The log's lines that are calls of `name` (their argument lists, without the name). */
export const callsOf = (log: readonly string[], name: string): string[] =>
  log.filter((l) => l.startsWith(`${name}(`)).map((l) => l.slice(name.length + 1, -1));
