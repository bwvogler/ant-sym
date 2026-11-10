import { ChunkLayer, type Cells } from "./chunks.ts";

// Saving a game (the fungus game, ja-lo8.6), pure: no DOM, no storage (ui/saves.ts keeps the blobs in IndexedDB).
//
// A save is the game's state as JSON. A restore never rebuilds the object graph from it: Game.restore builds a fresh
// game from the same world seed and settings (so every reference between colonies, map, fungus and recognition is
// wired as it always is), then pours the saved values into it in place. Each class says what it holds: its public
// data fields (generic, by key) and its private ones (its own saveState / loadState). The guard is a test: run, save,
// restore into a fresh game, run on; every array must hash as an unbroken run's (tests/save.test.ts).

/** A typed array of any of the kinds the sim keeps, by constructor name. */
const TYPED: Record<string, new (b: ArrayBuffer) => ArrayLike<number>> = {
  Float32Array,
  Float64Array,
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Uint8ClampedArray,
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k);
  return out;
}

/** Any value the sim keeps, as JSON: typed arrays as base64, chunk layers as their chunks, Maps and Sets as lists. Functions are left out. */
export function encode(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : { $n: Number.isNaN(v) ? "NaN" : v > 0 ? "Inf" : "-Inf" };
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "function") return undefined;
  if (ArrayBuffer.isView(v)) {
    const a = v as unknown as { constructor: { name: string }; buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
    return { $ta: a.constructor.name, d: toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) };
  }
  if (typeof (v as { saveState?: unknown }).saveState === "function") return { $state: (v as { saveState(): unknown }).saveState() };
  if (v instanceof ChunkLayer) {
    const chunks: unknown[] = [];
    v.forEach((cx, cy, a) => chunks.push([cx, cy, encode(a)]));
    return { $chunks: chunks };
  }
  if (Array.isArray(v)) return v.map(encode);
  if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [encode(k), encode(x)]) };
  if (v instanceof Set) return { $set: [...v].map(encode) };
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const e = encode(x);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  return undefined;
}

/** A chunk layer's saved chunks. */
export interface SavedChunks {
  $chunks: [number, number, unknown][];
}

/** JSON back to values: typed arrays, Maps, Sets; a chunk layer stays as its chunks (fillLayer puts them back). */
export function decode(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decode);
  const o = v as Record<string, unknown>;
  if ("$n" in o) return o.$n === "NaN" ? NaN : o.$n === "Inf" ? Infinity : -Infinity;
  if ("$ta" in o) {
    const Ctor = TYPED[o.$ta as string];
    if (!Ctor) throw new Error(`save: no typed array ${String(o.$ta)}`);
    const bytes = fromBase64(o.d as string);
    return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
  if ("$chunks" in o) return o; // kept as is: only a layer knows how to make its chunks
  if ("$map" in o) return new Map((o.$map as [unknown, unknown][]).map(([k, x]) => [decode(k), decode(x)]));
  if ("$set" in o) return new Set((o.$set as unknown[]).map(decode));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = decode(x);
  return out;
}

/** Put a layer's saved chunks back: it is emptied first, so chunks written after the save are gone too. */
export function fillLayer<A extends Cells>(layer: ChunkLayer<A>, saved: unknown): void {
  layer.dropAll();
  for (const [cx, cy, a] of (saved as SavedChunks).$chunks) layer.put(cx, cy, decode(a) as A);
}

/**
 * A saved value into what holds it now, in place where it can be (typed arrays, chunk layers, Maps, Sets, arrays and
 * plain objects keep their identity, which other objects may hold); returns what the holder should hold.
 */
export function fillLike(current: unknown, saved: unknown): unknown {
  if (current instanceof ChunkLayer) {
    fillLayer(current, saved);
    return current;
  }
  const special = saved !== null && typeof saved === "object" && !Array.isArray(saved) && Object.keys(saved).some((k) => k.startsWith("$"));
  if (special && "$state" in (saved as object) && current && typeof (current as { loadState?: unknown }).loadState === "function") {
    (current as { loadState(s: unknown): void }).loadState((saved as { $state: unknown }).$state);
    return current;
  }
  // A plain object (or one of the sim's own) into the one it is now, field by field: chunk layers and arrays inside it keep their identity.
  if (!special && saved !== null && typeof saved === "object" && !Array.isArray(saved) && current !== null && typeof current === "object" && !Array.isArray(current) && !ArrayBuffer.isView(current) && !(current instanceof Map) && !(current instanceof Set)) {
    const t = current as Record<string, unknown>;
    for (const [k, x] of Object.entries(saved as Record<string, unknown>)) {
      const d = Object.getOwnPropertyDescriptor(t, k);
      if (d && d.get && !d.set) continue; // computed from the rest (a getter): nothing to put back
      t[k] = fillLike(t[k], x);
    }
    return current;
  }
  const v = decode(saved);
  if (ArrayBuffer.isView(current) && ArrayBuffer.isView(v) && (current as unknown as ArrayLike<number>).length === (v as unknown as ArrayLike<number>).length && current.constructor === v.constructor) {
    (current as unknown as { set(a: ArrayLike<number>): void }).set(v as unknown as ArrayLike<number>);
    return current;
  }
  if (current instanceof Map && v instanceof Map) {
    current.clear();
    for (const [k, x] of v) current.set(k, x);
    return current;
  }
  if (current instanceof Set && v instanceof Set) {
    current.clear();
    for (const x of v) current.add(x);
    return current;
  }
  if (Array.isArray(current) && Array.isArray(v)) {
    current.splice(0, current.length, ...(v as unknown[]));
    return current;
  }
  return v;
}

/** An object's public data fields (own, enumerable, not functions), but those named in `skip`: references to others' state, or what is rebuilt. */
export function saveFields(o: object, skip: ReadonlySet<string> = new Set()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (skip.has(k) || typeof v === "function") continue;
    const e = encode(v);
    if (e !== undefined) out[k] = e;
  }
  return out;
}

/** Saved public fields back into an object, in place where they can be (fillLike); a field it doesn't have now is set. */
export function loadFields(o: object, saved: Record<string, unknown>): void {
  const t = o as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved)) t[k] = fillLike(t[k], v);
}
