// The per-ant step record (docs/refactor.md S3.4): tick's stages (perceive, decide, steer, move, arrive) pass what one
// computed for the ant to the next through it. One record per tick, reused for every ant: each field is written before it is read.

export class AntStep {
  ca!: number;
  sa!: number;
  h!: number;
  fl!: number;
  ff!: number;
  fr!: number;
  hl!: number;
  hf!: number;
  hr!: number;
  al!: number;
  af!: number;
  ar!: number;
  toEnemy!: number | null;
}
