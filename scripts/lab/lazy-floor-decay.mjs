// Compare lazy floor-mark evaporation with the game's Float32 field on a single open cell.
// A read computes all elapsed evaporation steps at once. A write starts the next interval.
// Usage: node scripts/lab/lazy-floor-decay.mjs
import { worldFromArrays } from "../../web/src/colony/world.ts";
import { DEFAULT_CHANNELS, MAX_LEVEL, Pheromones, SLEEP, stepInterval } from "../../web/src/colony/pheromone.ts";
import { helpAndExit } from "../lib/usage.mjs";

helpAndExit(import.meta.url);

const channel = "royal";
const dt = stepInterval(DEFAULT_CHANNELS[channel]);
const keep = 1 - DEFAULT_CHANNELS[channel].evaporation * dt;
const field = new Pheromones(worldFromArrays({ w: 16, h: 16 }, []));
const x = 8;
const y = 8;
let level = 0;
let written = 0;
function read(step) {
  const decayed = level * keep ** (step - written);
  // A chunk with only this one active cell sleeps when that cell falls below SLEEP.
  return decayed < SLEEP ? 0 : Math.fround(decayed);
}

let firstMismatch;
let different = 0;
let maxError = 0;
for (let step = 0; step <= 6000; step++) {
  if (step > 0) field.step(dt);
  if (step === 0 || step === 37) {
    field.depositCell(channel, x, y, 1);
    level = Math.fround(Math.min(MAX_LEVEL, read(step) + 1));
    written = step;
  }
  const lazy = read(step);
  const actual = field.fields[channel].get(x, y);
  if (lazy !== actual) {
    firstMismatch ??= { step, actual, lazy };
    different++;
    maxError = Math.max(maxError, Math.abs(lazy - actual));
  }
}
console.log(JSON.stringify({ samples: 6001, firstMismatch, different, maxError }, null, 2));
