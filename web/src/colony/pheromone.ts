import type { WorldSize } from "./world.ts";

// Pheromone fields, pure: one Float32 grid per channel, laid by ants, read by
// their sensors, evaporating and spreading every tick. This is the colony's
// free coordination: no ant talks to another, they all read the ground.
// Food trail: laid by ants carrying food home, so it leads to food. Home
// trail: laid by ants walking out, so it leads home. Alarm: painted by the
// fungus (and, later, laid in fights); it fades fast and ants steer away.

export type Channel = "food" | "home" | "alarm";
export const CHANNELS: Channel[] = ["food", "home", "alarm"];

export interface ChannelParams {
  /** share lost per second */
  evaporation: number;
  /** spread per second toward the 4-neighbour mean (0 = none) */
  diffusion: number;
}

export const DEFAULT_CHANNELS: Record<Channel, ChannelParams> = {
  food: { evaporation: 0.06, diffusion: 0.3 },
  home: { evaporation: 0.02, diffusion: 0.3 },
  alarm: { evaporation: 0.25, diffusion: 0.8 },
};

/** No cell holds more than this, so a crowded trail does not drown the gradient. */
export const MAX_LEVEL = 20;

export class Pheromones {
  readonly size: WorldSize;
  readonly fields: Record<Channel, Float32Array>;
  params: Record<Channel, ChannelParams>;
  #scratch: Float32Array;

  constructor(size: WorldSize, params: Record<Channel, ChannelParams> = DEFAULT_CHANNELS) {
    this.size = size;
    this.params = params;
    const cells = size.w * size.h;
    this.fields = { food: new Float32Array(cells), home: new Float32Array(cells), alarm: new Float32Array(cells) };
    this.#scratch = new Float32Array(cells);
  }

  /** Add to the cell under (x, y). */
  deposit(channel: Channel, x: number, y: number, amount: number): void {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.size.w || cy >= this.size.h) return;
    const f = this.fields[channel];
    const i = cy * this.size.w + cx;
    f[i] = Math.min(MAX_LEVEL, (f[i] as number) + amount);
  }

  /** The level under (x, y); −1 off the map, so a sensor reads the edge as worse than bare ground. */
  read(channel: Channel, x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.size.w || cy >= this.size.h) return -1;
    return this.fields[channel][cy * this.size.w + cx] as number;
  }

  /** Evaporate and spread every channel by dt seconds. Rock cells hold nothing and take nothing. */
  step(dt: number, rock: Uint8Array): void {
    const { w, h } = this.size;
    for (const ch of CHANNELS) {
      const f = this.fields[ch];
      const keep = Math.max(0, 1 - this.params[ch].evaporation * dt);
      const k = Math.min(0.25, this.params[ch].diffusion * dt);
      const out = this.#scratch;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (rock[i]) {
            out[i] = 0;
            continue;
          }
          const v = f[i] as number;
          // Mean of the open neighbours; rock and the edge count as this cell, so nothing leaks into them.
          const l = x > 0 && !rock[i - 1] ? (f[i - 1] as number) : v;
          const r = x < w - 1 && !rock[i + 1] ? (f[i + 1] as number) : v;
          const u = y > 0 && !rock[i - w] ? (f[i - w] as number) : v;
          const d = y < h - 1 && !rock[i + w] ? (f[i + w] as number) : v;
          out[i] = (v + k * ((l + r + u + d) / 4 - v)) * keep;
        }
      }
      f.set(out);
    }
  }

  total(channel: Channel): number {
    let s = 0;
    for (const v of this.fields[channel]) s += v;
    return s;
  }

  clear(): void {
    for (const ch of CHANNELS) this.fields[ch].fill(0);
  }
}
