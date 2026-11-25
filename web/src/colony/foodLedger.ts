// The endless world's food totals (docs/endless-world.md §3), pure bookkeeping: `foodTotal` and `foodLeft` mean nothing once food appears as
// chunks are generated, so they become the food generated so far, plus what the game adds (regrowth, honeydew, a stroke) less what it takes.
// The ledger counts only the generated part: the map's own `foodTotal` and `foodLeft` carry the adds and takes (world.ts takeFoodCell, dropFood).
// It once had `add`, `take`, `total` and `left` too; nothing called them, so `left` went stale after the first take (ja-qpv.8.1) and they were removed.
// A chunk counts once, by its key, however many times it is generated: a chunk dropped from memory and generated again comes back the same
// and adds nothing the second time. The assays' `foodHome` does not use this: it divides by the food first generated within 2 U of the hole
// (`EndlessPlane.foodWithin`), a fixed disc.

export class FoodLedger {
  readonly #chunks = new Map<string, number>();
  #generated = 0;

  /** A chunk (or curtain block) `key` of `layer` was generated holding `amount` food: counted the first time only (a second, different amount throws). Returns whether it was new. */
  generated(layer: string, key: number, amount: number): boolean {
    const k = `${layer}:${key}`;
    const have = this.#chunks.get(k);
    if (have !== undefined) {
      // A chunk generates identically each time (the generators' guarantee): a different amount means that guarantee broke.
      if (have !== amount) throw new Error(`FoodLedger: ${k} was counted as ${have} food and now holds ${amount}`);
      return false;
    }
    this.#chunks.set(k, amount);
    this.#generated += amount;
    return true;
  }

  /** Forget every chunk counted and the totals (a load, before it `restore`s what the save counted, or, for an older save, counts the chunks again as they are made: endlessMap.ts loadEndless). */
  reset(): void {
    this.#chunks.clear();
    this.#generated = 0;
  }

  /** Every chunk counted, as [layer:key, amount] pairs in the order counted: what a save keeps so a load counts the same chunks without making them again. */
  entries(): [string, number][] {
    return [...this.#chunks];
  }

  /** Put back what `entries()` gave, into an empty ledger (a load, after `reset`): each chunk counted once with its amount, the total their sum. */
  restore(entries: readonly (readonly [string, number])[]): void {
    if (this.#chunks.size > 0) throw new Error("FoodLedger.restore: the ledger already counts chunks");
    for (const [k, amount] of entries) {
      this.#chunks.set(k, amount);
      this.#generated += amount;
    }
  }

  /** Food generated so far: what the generator placed in the chunks made, never what was added or taken since. */
  get generatedTotal(): number {
    return this.#generated;
  }

  /** How many chunks have been counted. */
  get chunks(): number {
    return this.#chunks.size;
  }
}
