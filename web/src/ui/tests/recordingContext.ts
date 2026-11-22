// A fake CanvasRenderingContext2D that records what a layer does to it (ja-fnd.6.3.5, docs/field-split.md "the recording fake context"): every
// method call and every property set, in order, as one line each: `arc(100, 20.5, 3, 0, 6.283)`, `fillStyle = #ink`. A layer's log is its
// behaviour without a browser; the Chromium scenes (scripts/field-shots.mjs) confirm that the logs are of what the pixels show. Text is measured
// as half its font size a character, so widths are the same on every machine. Numbers are rounded to 3 places. save() and restore() keep the
// properties (and the line dash) as a real context does; a call with a number that is not finite throws (a real canvas silently ignores it, which
// hides a bug: NaN from a bad division draws nothing and reports nothing). recordingPath() is a Path2D that records its commands.

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

/** A Path2D that records its commands; as an argument of a call it shows as `path{moveTo(1, 2); lineTo(3, 4)}`. */
export class RecordedPath {
  readonly cmds: string[] = [];
  private add(name: string, args: number[]): void {
    for (const a of args) if (!Number.isFinite(a)) throw new Error(`path ${name}: ${args.join(", ")} is not finite`);
    this.cmds.push(`${name}(${args.map(fmt).join(", ")})`);
  }
  moveTo(x: number, y: number): void {
    this.add("moveTo", [x, y]);
  }
  lineTo(x: number, y: number): void {
    this.add("lineTo", [x, y]);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.add("bezierCurveTo", [a, b, c, d, e, f]);
  }
  quadraticCurveTo(a: number, b: number, c: number, d: number): void {
    this.add("quadraticCurveTo", [a, b, c, d]);
  }
  closePath(): void {
    this.cmds.push("closePath()");
  }
  toString(): string {
    return `path{${this.cmds.join("; ")}}`;
  }
}

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
  let dash: number[] = [];
  const stack: { state: Record<string, unknown>; dash: number[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, name) {
        const n = String(name);
        if (PROPS.has(n)) return state[n];
        return (...args: unknown[]) => {
          for (const a of args)
            if (typeof a === "number" && !Number.isFinite(a))
              throw new Error(`${n}(${args.map(fmt).join(", ")}): a number is not finite (a real canvas would ignore the call)`);
          log.push(`${n}(${args.map(fmt).join(", ")})`);
          if (n === "save") {
            stack.push({ state: { ...state }, dash: [...dash] });
            return undefined;
          }
          if (n === "restore") {
            const top = stack.pop();
            if (top) {
              Object.assign(state, top.state);
              dash = top.dash;
            }
            return undefined;
          }
          if (n === "setLineDash") {
            dash = [...(args[0] as number[])];
            return undefined;
          }
          if (n === "getLineDash") return [...dash];
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

/**
 * The value of property `prop` just before line `index` of the log, the way a real context would hold it (save and restore applied): the colour a
 * fill() is about to use is `stateAt(log, i, "fillStyle")` for the fill's index i. It reads the values back from the log's text, so numbers are
 * the log's rounded ones (a 0.0225 reads back 0.023) and `true` and `false` are booleans.
 */
export function stateAt(log: readonly string[], index: number, prop: string): unknown {
  const state: Record<string, unknown> = { ...DEFAULTS };
  const stack: Record<string, unknown>[] = [];
  for (let i = 0; i < index; i++) {
    const l = log[i]!;
    if (l === "save()") stack.push({ ...state });
    else if (l === "restore()") Object.assign(state, stack.pop() ?? {});
    else {
      const m = /^(\w+) = (.*)$/.exec(l);
      if (m) state[m[1]!] = /^-?[\d.]+$/.test(m[2]!) ? Number(m[2]) : m[2] === "true" ? true : m[2] === "false" ? false : m[2];
    }
  }
  return state[prop];
}

/** A log with each path argument shortened to its size, `path#12`: the calls' order and the paths' sizes, without a hundred curve coordinates. */
export const shape = (log: readonly string[]): string[] =>
  log.map((l) => l.replace(/path\{[^}]*\}/g, (p) => `path#${p === "path{}" ? 0 : p.split("; ").length}`));
