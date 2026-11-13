// The per-ant step record (docs/refactor.md S3.4): tick's stages (perceive, stance, decide, steer, move and dig, arrive) pass what one
// computed for the ant to the next through it. One record per tick, reused for every ant: each field is written before it is read (initialised only so V8 keeps the numbers unboxed: review of #147).

export class AntStep {
  ca = 0;
  sa = 0;
  h = 0;
  fl = 0;
  ff = 0;
  fr = 0;
  hl = 0;
  hf = 0;
  hr = 0;
  al = 0;
  af = 0;
  ar = 0;
  toEnemy: number | null = null;
}
