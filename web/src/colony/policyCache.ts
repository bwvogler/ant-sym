/** FNV-1a, for the context part of the cache key: a changed legend or question text invalidates every answer. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Situation key → Jev's answer, for one policy context (legend, questions, doctrine). Modes, stances and interventions each keep their own. */
export class PolicyCache<T> {
  readonly context: string;
  #map = new Map<string, T>();

  constructor(context: string, entries: [string, T][] = []) {
    this.context = context;
    for (const [k, v] of entries) this.#map.set(k, v);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: string): T | undefined {
    return this.#map.get(key);
  }

  put(key: string, answer: T): void {
    this.#map.set(key, answer);
  }

  clear(): void {
    this.#map.clear();
  }

  entries(): [string, T][] {
    return [...this.#map.entries()];
  }
}
