/** Longest single sim step: sensing a trail 3 cells ahead needs steps well under a cell. */
export const MAX_STEP = 1 / 30;
const STEP_MS = MAX_STEP * 1000;
const MAX_DEBT_MS = 8 * STEP_MS;
const SLICE_MS = 12;

/** Fixed simulation steps with a bounded backlog and a time budget for each turn. */
export class FixedStepClock {
  #last = 0;
  #debt = 0;

  speed: number;

  constructor(speed: number) {
    this.speed = speed;
  }

  reset(now: number): void {
    this.#last = now;
    this.#debt = 0;
  }

  pump(now: number, tick: () => unknown, readClock = () => performance.now()): number {
    this.#debt = Math.min(MAX_DEBT_MS, this.#debt + Math.max(0, now - this.#last) * this.speed);
    this.#last = now;
    while (this.#debt >= STEP_MS) {
      this.#debt -= STEP_MS;
      if (tick() === false || readClock() - now >= SLICE_MS) break;
    }
    return Math.max(0, (STEP_MS - this.#debt) / this.speed - (readClock() - now));
  }
}
