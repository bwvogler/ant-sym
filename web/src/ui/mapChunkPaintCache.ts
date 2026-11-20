type Input = ArrayBufferView | undefined;
const bytes = (input: Input) => (input ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null);
function equal(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  if (!(a.byteOffset % 4) && !(b.byteOffset % 4) && !(a.byteLength % 4)) {
    const aa = new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4),
      bb = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  } else for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Exact input snapshots: direct typed-array writes invalidate tiles without simulation revision counters or stale timers. */
export class MapChunkPaintCache {
  private snapshots = new WeakMap<object, { tag: string; inputs: (Uint8Array | null)[] }>();
  needsPaint(tile: object, tag: string, inputs: Input[]): boolean {
    const previous = this.snapshots.get(tile),
      next = inputs.map(bytes);
    let changed = !previous || previous.tag !== tag || previous.inputs.length !== inputs.length;
    const snapshots = next.map((input, i) => {
      const old = previous?.inputs[i] ?? null;
      if (equal(old, input)) return old;
      changed = true;
      if (old && input && old.length === input.length) {
        old.set(input);
        return old;
      }
      return input?.slice() ?? null;
    });
    if (changed) this.snapshots.set(tile, { tag, inputs: snapshots });
    return changed;
  }
  clear(): void {
    this.snapshots = new WeakMap();
  }
}
