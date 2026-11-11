// The ants' per-ant arrays that were private to the colony, each declared once here: its type, its fill and what it holds. The colony
// allocates them from this table (they become its own properties, typed by `interface Colony extends AntArrays`), the save carries them
// with its public arrays, and other modules read them as `colony.<name>` (docs/refactor.md S3). Index i is ant i, as for x, y, mode, …

/** An empty cell key: no cell (colony.ts NO_CELL). */
export const NO_KEY = -0x80000000;

interface ArrayField {
  readonly type:
    | Float32ArrayConstructor
    | Float64ArrayConstructor
    | Int8ArrayConstructor
    | Int16ArrayConstructor
    | Int32ArrayConstructor
    | Uint8ArrayConstructor
    | Uint16ArrayConstructor
    | Uint32ArrayConstructor;
  /** what every ant starts with; absent: 0 */
  readonly fill?: number;
}

export const ANT_FIELDS = {
  /** the cell each ant is in, and the position that was worked out for (a cache: cellOf costs more than a floor, and many steps ask) */
  cellX: { type: Int32Array },
  cellY: { type: Int32Array },
  cellAtX: { type: Float32Array, fill: NaN },
  cellAtY: { type: Float32Array, fill: NaN },
  /** a cell where this free-walking ant last found no tunnel (cellKey; NO_KEY none): it needn't look again until it moves on */
  noTunnel: { type: Int32Array, fill: NO_KEY },
  /** 1 while a pellet carrier is walking a stale branch to fill its end (see BACKFILL.enterStale) */
  staleWalk: { type: Uint8Array },
  /** the cell (cellKey) where this pellet carrier last looked for space to fill, this trip: once a cell is enough */
  looked: { type: Int32Array, fill: NO_KEY },
  /** the side view: what each homing ant is heading for (0 the chamber, 1 the entrance); a change drops the wall it was following */
  goalKind: { type: Uint8Array },
  /** 1 while the ant is underground (the last tick), so coming up out of the hole is seen */
  under: { type: Uint8Array },
  /** the side view: a homing ant following the ground's surface round spoil to the hole: the nearness (#holeMetric) it must beat to let go; NaN = not following */
  groundMin: { type: Float64Array, fill: NaN }, // float64: compared with the metric itself (float32 rounding let the ant "beat" it on the cell it was set at)
  /** cells walked on that surface (at each flipDue, the other hand) */
  groundT: { type: Uint16Array },
  /** the hole x (#holeX) groundMin was measured against */
  groundRef: { type: Float64Array, fill: NaN },
  // Chambers (nest slice 2): the side view's nest is dug, not given.
  /** the face this ant is digging for a chamber (cellKey; NO_KEY none), and for which: chamber id + 1, or 0 for a new one */
  chamberCell: { type: Int32Array, fill: NO_KEY },
  chamberFor: { type: Int16Array },
  // Floor marks (nest slice 3): the role of the last chamber each ant was in (MARKS index + 1; 0 none), and seconds since.
  lastRole: { type: Uint8Array },
  sinceRole: { type: Float32Array },
  /** seconds an ant has rested at home in "return" (see REST) */
  restT: { type: Float32Array },
  /** 1 while an ant carries brood (a nurse), and the chamber it is taking it to */
  broodHeld: { type: Uint8Array },
  broodTo: { type: Int16Array, fill: -1 },
  /** seconds a nurse has held its brood, or a porter its food */
  holdT: { type: Float32Array },
  /** what ant i felt by touch last tick (hunger.ts): it passes on PASS of it */
  feltLast: { type: Float32Array },
  // Food flow (nest slice 5; with a queen): food lies in chambers; foragers bring it to reception, porters carry it on.
  /** the chamber an ant carrying food is taking it to (−1: a forager, to reception or the royal chamber), and 1 if it is a porter's move inside the nest */
  portTo: { type: Int16Array, fill: -1 },
  porter: { type: Uint8Array },
  /** 1 while an ant carries a corpse (moved like a soil pellet: up and out, along the ground) */
  corpse: { type: Uint8Array },
  /** 1 while an ant carried a load at its last step (what ends its trip when the load is put down: `arrive`) */
  loaded: { type: Uint8Array },
  /** the cell (cellKey) where ant i last put a load down, while it still stands there; else NO_KEY */
  putAt: { type: Int32Array, fill: NO_KEY },
  /**
   * The side view: a pellet carrier carrying its pellet out along the ground: it drops it once it is this many
   * columns from the hole (NaN: not carrying one out), on side #spoilSide, having walked #spoilT seconds. One world's
   * plane (U3c): this far from home by its own vector (a corpse: at least this far, and off the mound), walking out on
   * heading #spoilA, drawn at the crossing (or, spreading spoil off the mound, away from where it believes home is).
   */
  spoilTo: { type: Float32Array, fill: NaN },
  spoilSide: { type: Int8Array },
  spoilT: { type: Float32Array },
  spoilA: { type: Float32Array },
  /**
   * What the pellet carried is (with `pellet`; one place for it, review of MR 15: five per-ant arrays each cleared by
   * hand): DUG, soil it dug, to the hole and out, or into unused space on the way; LOOSE, loose soil off the mound (moved,
   * not dug: not in soilDug), out along the ground; FILL, loose soil taken down into the nest to backfill. #clearPellet
   * puts the pellet and all its state down at once.
   */
  soil: { type: Uint8Array },
  /** the cell it looked from before that (packed; −1 none): the way it came, which is never a stale branch */
  cameFrom: { type: Int32Array, fill: NO_KEY },
  /** the cell (packed) this ant last dug: its pellet never goes straight back in there */
  lastDug: { type: Int32Array, fill: NO_KEY },
  /** releases from a soil wall this trip that made no progress home (see NO_GAIN) */
  noGain: { type: Uint8Array },
  /** 1 once a recruited ant has been away from the nest: coming home then ends its raid */
  gone: { type: Uint8Array },
  /** a raider that has left the raid trail to search on, until it is home (ja-sf1) */
  pastEnd: { type: Uint8Array },
  /** 1 while the ant is on home ground with its threat past defendAt: its stance is defend (docs/stance.md) */
  defending: { type: Uint8Array },
  /** 1 from when fatigue passes patience until it has rested to nothing: a tired forager rests fully, not just under the line */
  tired: { type: Uint8Array },
  /** the situation each ant was last asked about, encoded; −1 = never */
  asked: { type: Int16Array, fill: -1 },
  /** the question behind each ant's current mode: its situation (with the mode it had) when last asked; −1 = never */
  question: { type: Int16Array, fill: -1 },
} as const satisfies Record<string, ArrayField>;

export type AntArrays = { -readonly [K in keyof typeof ANT_FIELDS]: InstanceType<(typeof ANT_FIELDS)[K]["type"]> };

/** Every array of the table, for `n` ants. */
export function makeAntArrays(n: number): AntArrays {
  const a: Record<string, ArrayLike<number>> = {};
  for (const [k, f] of Object.entries(ANT_FIELDS) as [string, ArrayField][]) {
    const v = new f.type(n);
    if (f.fill !== undefined) v.fill(f.fill);
    a[k] = v;
  }
  return a as unknown as AntArrays;
}
