// Perceive (docs/refactor.md S3.4): the first stage of an ant's step in tick. Its three sensors read every channel, the alarm it smells is noted, and the nearest strangers in reach give a heading (and the odds against them). Moved out of Colony.tick verbatim but for `this` becoming `col`; what it found goes to the next stages through the step record.

import type { Colony } from "./colony.ts";
import { CELL, cellOf } from "./hex.ts";
import { freshReach } from "./grid.ts";
import { enemyHeading, odds, sense } from "./sense.ts";
import type { AntStep } from "./step.ts";
import { trailLevel } from "./vocab.ts";

export function perceive(col: Colony, i: number, s: AntStep): void {
  const ca = s.ca;
  const sa = s.sa;
  let h = col.heading[i];
  // Three sensors (left, front, right), each read on every channel at once.
  const sn = col.s;
  const ch = Math.cos(h);
  const sh = Math.sin(h);
  cellOf(col.x[i], col.y[i]);
  const ax = CELL[0];
  const ay = CELL[1];
  freshReach(); // the three sensors share one search of the ground round the ant (inReachShared)
  sense(col, i, ch * ca + sh * sa, sh * ca - ch * sa, 0, ax, ay); // h − a
  sense(col, i, ch, sh, 1, ax, ay);
  sense(col, i, ch * ca - sh * sa, sh * ca + ch * sa, 2, ax, ay); // h + a
  const fl = sn[0];
  const ff = sn[1];
  const fr = sn[2];
  const hl = sn[3];
  const hf = sn[4];
  const hr = sn[5];
  const al = sn[6];
  // What this ant smells of alarm, for its Touch this tick (behaviour MR 4: graded alarm).
  col.alarmAnt = i;
  col.alarmSmelt = trailLevel(Math.max(sn[6], sn[7], sn[8]));
  const af = sn[7];
  const ar = sn[8];
  const toEnemy = enemyHeading(col, i);
  col.oddsNow = toEnemy === null ? "none" : odds(col, i);
  s.h = h;
  s.fl = fl;
  s.ff = ff;
  s.fr = fr;
  s.hl = hl;
  s.hf = hf;
  s.hr = hr;
  s.al = al;
  s.af = af;
  s.ar = ar;
  s.toEnemy = toEnemy;
}
