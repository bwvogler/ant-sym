// The endless world's food totals (docs/endless-world.md §3), pure bookkeeping: `foodTotal` and `foodLeft` mean nothing once food appears as
// chunks are generated, so they become the food generated so far, plus what the game adds (regrowth, honeydew, a stroke) less what it takes.
// A chunk counts once, by its key, however many times it is generated: a chunk dropped from memory and generated again comes back the same
// and adds nothing the second time. The assays' `foodHome` does not use this: it divides by the food first generated within 2 U of the hole
// (`EndlessPlane.foodWithin`), a fixed disc.

export class FoodLedger {
  readonly #chunks = new Map<string, number>();
  #generated = 0;
  #added = 0;
  #taken = 0;

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

  /** Forget every chunk counted and the totals (a load, which counts the chunks again as they are made: endlessMap.ts loadEndless). */
  reset(): void {
    this.#chunks.clear();
    this.#generated = 0;
    this.#added = 0;
    this.#taken = 0;
  }

  /** The game put food on the map (regrowth, honeydew, a stroke). */
  add(amount: number): void {
    this.#added += amount;
  }

  /** The game took food off the map (eaten, carried to the stores). */
  take(amount: number): void {
    this.#taken += amount;
  }

  /** Food generated so far: what the generator placed in the chunks made, never what was added or taken since. */
  get generatedTotal(): number {
    return this.#generated;
  }

  /** `foodTotal`: generated so far plus added, as the bounded map's total counts what regrowth adds. */
  get total(): number {
    return this.#generated + this.#added;
  }

  /** `foodLeft`: the total less what was taken. */
  get left(): number {
    return this.total - this.#taken;
  }

  /** How many chunks have been counted. */
  get chunks(): number {
    return this.#chunks.size;
  }
}
