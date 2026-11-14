// The colony's per-ant arrays, each declared once here: its type, its fill and what it holds. The colony allocates them from this table
// (they become its own properties, typed by `interface Colony extends AntArrays`), the save carries them with its other public fields,
// and other modules read them as `colony.<name>` (docs/refactor.md S3). Index i is ant i. Only per-ant arrays belong here: what is
// per colony or per layer stays a field of the Colony.

/** An empty cell key: no cell (colony.ts NO_CELL). Every cellKey (hex.ts) is ≥ 0, so −2^31 is never a cell. */
export const NO_KEY = -0x80000000;

/** The colony parameters the table reads: a fill that starts as a parameter, and the one array whose length depends on one. */
export interface AntParams {
  odour: number;
  tolerance: number;
  routeStep: number;
  routeMax: number;
}

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
  /** what every ant starts with when that is a colony parameter */
  readonly fillParam?: keyof AntParams;
  /** elements per ant, when it is not one (the array is n times this) */
  readonly perAnt?: (p: AntParams) => number;
  /**
   * Where a newborn's slot goes back to its start: "spawn" (the colony's spawn resets it), or "asIs" (also reset by Colony.asIs, a host made healthy: the
   * fungus's gains and its odour cues). To its fill, or to `resetTo`. Absent: spawn leaves it (it computes it, or a cache is kept). Adding a per-ant field
   * that starts afresh in a newborn is this one word.
   */
  readonly reset?: "spawn" | "asIs";
  readonly resetTo?: number;
}

export const ANT_FIELDS = {
  // ——— the ants' public arrays (read by the page, the tests and the scripts) ———
  /** the layer each ant is on (all `home` on a colony with one) */
  layer: { type: Uint8Array },
  x: { type: Float32Array },
  y: { type: Float32Array },
  heading: { type: Float32Array },
  /** index into MODES */
  mode: { type: Uint8Array, reset: "spawn" },
  carrying: { type: Uint8Array, reset: "spawn" },
  /** carrying a soil pellet it dug, home to the mound */
  pellet: { type: Uint8Array, reset: "spawn" },
  /** seconds of digging left at the soil face ahead; 0 = not digging */
  digT: { type: Float32Array, reset: "spawn" },
  /** the heading the cell it is digging should carry on the tunnel at (NaN: none chosen; the face's own direction) */
  digAim: { type: Float32Array, fill: NaN, reset: "spawn" },
  // Path integration in the side view (nest slice 1, docs/nest-and-home.md §3.1). An ant knows where home is only
  // by counting its own steps, and the count drifts: about 10 % of the distance walked (Wehner). Its depth does not
  // drift: gravity tells it how far it has climbed. So it believes its goal lies drift × distance off to one side.
  /** distance walked since the surface vector reset (coming up out of the hole) */
  odoSurf: { type: Float32Array, reset: "spawn" },
  /** distance walked underground since the in-nest memory reset (in the chamber) */
  odoNest: { type: Float32Array, reset: "spawn" },
  /** this trip's drift on the surface and in the nest, per unit walked (Gaussian, σ = PI_DRIFT); on one world's plane, driftSurf is the x part */
  driftSurf: { type: Float32Array, reset: "spawn" },
  /**
   * One world's plane (U3b, docs/one-world.md §4): the surface drift's y part. Each part is drawn with σ = PI_DRIFT/√2 at
   * its own hole, so the vector's error is PI_DRIFT × distance (RMS) in 2D, as the side view's is across the ground.
   */
  driftSurfY: { type: Float32Array, reset: "spawn" },
  driftNest: { type: Float32Array, reset: "spawn" },
  /** cells added to the believed goal while searching round it (it got there and found nothing): grows, alternating sides; on one world's plane, the loop's reach */
  search: { type: Float32Array, reset: "spawn" },
  /** one world's plane: the direction of the search's current point from where the vector ran out (a quarter turn more each time); with loops (searchLoops), the first loop's heading */
  searchA: { type: Float32Array, reset: "spawn" },
  /** one world's plane, with loops (searchLoops): the search's point, counted from its start, three a loop (out, across, back to the centre) */
  searchLeg: { type: Uint32Array },
  /**
   * One world's plane, with siteFidelity (ja-lp4.15): where the ant believes the food it last picked up lay, relative to its
   * hole (x and y; NaN: none). Its home vector at the pickup, negated: where it stood less where it believed its hole was.
   */
  foodX: { type: Float32Array, fill: NaN, reset: "spawn" },
  foodY: { type: Float32Array, fill: NaN, reset: "spawn" },
  /**
   * One world's plane, with routeMemory (ja-lp4.16): the places ant i stored on its way out of its hole, x then y, routeMax
   * a slot (slot i × routeMax + k); routeN of them are in use. Its own positions only, cleared as it comes up out of its
   * own hole.
   */
  routePlaces: { type: Float32Array, perAnt: (p) => Math.max(2, Math.min(255, Math.floor(p.routeMax))) * 2 },
  routeN: { type: Uint8Array, reset: "spawn" },
  /** cells between two places now (routeStep, doubled each time the store is halved), and the odometer (odoSurf) where the last was stored */
  routeGap: { type: Float32Array, fillParam: "routeStep", reset: "spawn" },
  routeAt: { type: Float32Array, reset: "spawn" },
  /** 0 = recording (or none), 1 = retracing (routeGoal is the place it steers for), 2 = has retraced this trip */
  routeState: { type: Uint8Array, reset: "spawn" },
  routeGoal: { type: Int16Array, fill: -1, reset: "spawn" },
  /** each ant's age and lifespan, seconds (the side view: workers die of age, so an orphaned colony dwindles) */
  age: { type: Float32Array, reset: "spawn" },
  lifespan: { type: Float32Array, fill: Infinity },
  /** the first cell of the wall being followed by cell: back there, it has been all the way round */
  loopX: { type: Int32Array, fill: NO_KEY },
  loopY: { type: Int32Array },
  /** which hand it keeps on tunnel walls when it walks a tunnel (+1 right, −1 left), chosen afresh each trip out */
  hand: { type: Int8Array },
  /** seconds left of keeping a hand on a chamber's wall, after touching soil; 0 = wandering freely */
  hugT: { type: Float32Array, reset: "spawn" },
  alive: { type: Uint8Array },
  /** bumped every time a slot gets a new ant, so (slot, gen) names one ant even after its slot is reused */
  gen: { type: Uint32Array },
  /** seconds since the ant was last at the nest or picked up food (trail strength, backfill timing; not tiredness) */
  since: { type: Float32Array, reset: "spawn" },
  /** seconds of unsuccessful search, less rest inside the nest: tired above the colony's patience (ja-q47) */
  fatigue: { type: Float32Array, reset: "spawn" },
  /** encounters with nestmates coming home with food, leaking with a half-life of MET_HALF (behaviour MR 5) */
  met: { type: Float32Array, reset: "spawn" },
  /** seconds in contact with strangers, leaking (behaviour MR 5.2): how much of the rival a scout met; more lays a stronger raid trail */
  foes: { type: Float32Array, reset: "spawn" },
  /** 1 while the ant goes home to tell of the strangers it found, laying the raid trail (behaviour MR 5.2) */
  reporting: { type: Uint8Array, reset: "spawn" },
  /** seconds of alarm smelt or strangers in reach, leaking with a half-life of THREAT_HALF: a defender's threshold state (docs/stance.md) */
  threat: { type: Float32Array, reset: "spawn" },
  /** nestmates round a waiting ant at home, felt over CROWD_HALF (docs/stance.md: a crowded colony raids) */
  crowd: { type: Float32Array, reset: "spawn" },
  /**
   * 1 while this ant acts on the colony's raid stance (behaviour MR 5.2): it smelt a scout's raid trail, or went out as a scout.
   * Every other ant carries on as a forager. Cleared when it is home again with no trail under it.
   */
  recruited: { type: Uint8Array, reset: "spawn" },
  /**
   * One world (ja-web): 1 while this ant has a pass through the gate at the top of its shaft: it came down its hole with
   * food, and goes back out unprompted (a successful forager never waits, PRD §48), or its `leave` said go. Cleared when
   * it climbs out.
   */
  leaveOk: { type: Uint8Array, reset: "spawn" },
  /** the quality of the food in its jaws (world.ts: WorldMap.quality), tasted at pickup; read only while it carries food (left as it was after delivery) */
  quality: { type: Float32Array, fill: 1, reset: "spawn" },
  /** seconds left of a detour after bumping into rock, when the pull toward the nest (or the raid) is off */
  detour: { type: Float32Array, reset: "spawn" },
  /** recent bumps, fading over seconds: each bump in a row doubles the next detour */
  bumps: { type: Float32Array, reset: "spawn" },
  /** fungal load, 0..1 (fungus.ts): the fungus inside the ant; it never touches the ant's choices directly */
  load: { type: Float32Array, reset: "spawn" },
  /** which strain (an index into the fungus's strains) the load is; meaningful only where load > 0 */
  strain: { type: Uint8Array, reset: "spawn" },
  /** immune priming from grooming visible nestmates, 0..1: scales down every load the ant takes */
  resist: { type: Float32Array, reset: "spawn" },
  /** the preset the fungus runs in this ant (an index into levers.ts PRESETS; 0 = as it is or dormant; CUSTOM = Jev's own mix of levels) */
  expr: { type: Uint8Array, reset: "spawn" },
  // What the ant perceives (docs/fungus-policy.md §2): gains on the scent that is there, 1 = as it is.
  // The fungus writes them (fungus.ts); the ant cannot tell. Its situation and its steering both read
  // the bent sensors, and its own policy still decides. Seen food, the nest and rock are never bent.
  /** food scent × this */
  gainFood: { type: Float32Array, fill: 1, reset: "asIs" },
  /** home scent × this */
  gainHome: { type: Float32Array, fill: 1, reset: "asIs" },
  /** alarm × this */
  gainAlarm: { type: Float32Array, fill: 1, reset: "asIs" },
  /** the other colony's food trail, × this, smelled as food scent (0 = not at all) */
  foreignFood: { type: Float32Array, reset: "asIs" },
  /** the ant's sense of time out: it is tired after patience × this */
  clock: { type: Float32Array, fill: 1, reset: "asIs" },
  /** the ant's energy, 0..1 (ja-xu6.1, hunger.ts): drained with time (faster outside), refilled by eating where food lies in its own nest; at 0 it dies. The side view only. */
  energy: { type: Float32Array, fill: 1, reset: "spawn" },
  /** the hunger it feels by touch: begging larvae, a hungry queen, need passed on by nestmates (hunger.ts). Draws old ants to carry food inside. */
  need: { type: Float32Array, reset: "spawn" },
  /** the queen's scent it carries (ja-lo8.9, royal.ts): picked up touching her, shared by contact, fading. The side view only. */
  scent: { type: Float32Array, reset: "spawn" },
  /** how strongly it perceives that scent (the fungus's queen-scent lever: 1 as it is) */
  scentGain: { type: Float32Array, fill: 1, reset: "asIs" },
  // Recognition (recognition.ts): who is a stranger is a matter of odour, not of colony.
  /** the ant's odour, 0..1: a blend of cuticular hydrocarbons; strangers are ants whose odour differs by more than a tolerance */
  odour: { type: Float32Array, fillParam: "odour" },
  /** how far apart an odour must be for this ant to perceive a stranger (params.tolerance, widened by the fungus) */
  tolerance: { type: Float32Array, fillParam: "tolerance", reset: "asIs" },
  /** the calming cue the ant gives off, 0..1 (the fungus's): it counts as (1 − calm) of an enemy, and charges at (1 − calm) of the pace */
  calm: { type: Float32Array, reset: "asIs" },
  /** the fungal share of its odour, 0..MAX_MASK (the fungus's): its odour is its nest's, that share of the way to the fungus's own */
  mask: { type: Float32Array, reset: "asIs" },
  // What the ant gives off (docs/fungus-policy.md §4.C); the fungus writes them, 1 / 0 = as it is.
  /** trail laid × this (C1) */
  layGain: { type: Float32Array, fill: 1, reset: "asIs" },
  /** carrying food, it also lays this share of its food trail into the other colony's food field (C2): it leaks where food is */
  crossLay: { type: Float32Array, reset: "asIs" },
  /** in a fight it lays (1 − this) of the alarm (C3): a quiet fight recruits fewer defenders */
  quiet: { type: Float32Array, reset: "asIs" },
  /** how far (× 0.5) the fungus pushes its odour away from its nest's: past the tolerance, its own colony takes it for a stranger (B6) */
  estrange: { type: Float32Array, reset: "asIs" },
  /** the fungal situation (fungalPolicy.ts encodeFungal) the fungus last chose for it in; −1 = none */
  fungal: { type: Int16Array, fill: -1, reset: "spawn" },
  // What the fungus bends inside the nest (nest slice 8; the fungus writes them, 1 / 0 = as it is).
  /** the nest's floor marks smelled × this: road signs, and the chamber it is in */
  gainMarks: { type: Float32Array, fill: 1, reset: "asIs" },
  /** 0..1: past ½, brood smells like store and store like brood */
  swapMarks: { type: Float32Array, reset: "asIs" },
  /** 0..1: how surely it kills the queen and brood it touches, CROWN_RATE × this a second (lethal, the fungus's crown; its load) */
  regicide: { type: Float32Array, reset: "asIs" },
  /** the share of its strain's visibility it shows its groomers (the fungus's "showing" lever, ja-lo8.4): under 1 it hides the fungus */
  show: { type: Float32Array, fill: 1, reset: "asIs" },
  /** homing round an obstacle by touch: 0 = not; +1 = keeping the wall on its right, −1 = on its left */
  wall: { type: Int8Array, reset: "spawn" },
  /** distance home to beat to leave a wall: where it met the wall, or underground the nearest it has been since its last give-up */
  hitDist: { type: Float32Array },
  /** seconds spent following the current wall */
  followT: { type: Float32Array },
  /** seconds since a wall-following ant last touched rock (ahead, or on its wall side) */
  untouched: { type: Float32Array, reset: "spawn" },
  /** the nearest a homing ant has been to its nest this trip, and seconds since it last got 1 cell nearer */
  bestD: { type: Float32Array, fill: Infinity, reset: "spawn" },
  stallT: { type: Float32Array, reset: "spawn" },
  /** where this homing trip first met rock, or underground the latest wall it met (NaN until then, and after a give-up): with the nest it fixes the line the ant leaves walls on */
  mx: { type: Float32Array, fill: NaN, reset: "spawn" },
  my: { type: Float32Array, fill: NaN },
  /** following a wall cell by cell: the way it faces (0 east, 1 south, 2 west, 3 north) and the cell it is walking to (NO_CELL = decide now) */
  gdir: { type: Uint8Array },
  gx: { type: Int32Array, fill: NO_KEY, reset: "spawn" },
  gy: { type: Int32Array },
  /** 1 while the wall being followed is followed cell by cell (any wall underground, or a tunnel), 0 by touch (rock on open ground) */
  byCell: { type: Uint8Array, reset: "spawn" },
  // ——— the arrays that were private to the colony ———
  /** the cell each ant is in, and the position that was worked out for (a cache: cellOf costs more than a floor, and many steps ask) */
  cellX: { type: Int32Array },
  cellY: { type: Int32Array },
  cellAtX: { type: Float32Array, fill: NaN },
  cellAtY: { type: Float32Array, fill: NaN },
  /** a cell where this free-walking ant last found no tunnel (cellKey; NO_KEY none): it needn't look again until it moves on */
  noTunnel: { type: Float64Array, fill: NO_KEY },
  /** 1 while a pellet carrier is walking a stale branch to fill its end (see BACKFILL.enterStale) */
  staleWalk: { type: Uint8Array, reset: "spawn" },
  /** the cell (cellKey) where this pellet carrier last looked for space to fill, this trip: once a cell is enough */
  looked: { type: Float64Array, fill: NO_KEY, reset: "spawn" },
  /** the side view: what each homing ant is heading for (0 the chamber, 1 the entrance); a change drops the wall it was following */
  goalKind: { type: Uint8Array, reset: "spawn" },
  /** 1 while the ant is underground (the last tick), so coming up out of the hole is seen */
  under: { type: Uint8Array, reset: "spawn", resetTo: 1 },
  /** the side view: a homing ant following the ground's surface round spoil to the hole: the nearness (#holeMetric) it must beat to let go; NaN = not following */
  groundMin: { type: Float64Array, fill: NaN, reset: "spawn" }, // float64: compared with the metric itself (float32 rounding let the ant "beat" it on the cell it was set at)
  /** cells walked on that surface (at each flipDue, the other hand) */
  groundT: { type: Uint16Array },
  /** the hole x (#holeX) groundMin was measured against */
  groundRef: { type: Float64Array, fill: NaN },
  // Chambers (nest slice 2): the side view's nest is dug, not given.
  /** the face this ant is digging for a chamber (cellKey; NO_KEY none), and for which: chamber id + 1, or 0 for a new one */
  chamberCell: { type: Float64Array, fill: NO_KEY, reset: "spawn" },
  chamberFor: { type: Int16Array },
  // Floor marks (nest slice 3): the role of the last chamber each ant was in (MARKS index + 1; 0 none), and seconds since.
  lastRole: { type: Uint8Array, reset: "spawn" },
  sinceRole: { type: Float32Array, reset: "spawn" },
  /** seconds an ant has rested at home in "return" (see REST) */
  restT: { type: Float32Array, reset: "spawn" },
  /** 1 while an ant carries brood (a nurse), and the chamber it is taking it to */
  broodHeld: { type: Uint8Array, reset: "spawn" },
  broodTo: { type: Int16Array, fill: -1, reset: "spawn" },
  /** seconds a nurse has held its brood, or a porter its food */
  holdT: { type: Float32Array, reset: "spawn" },
  /** what ant i felt by touch last tick (hunger.ts): it passes on PASS of it */
  feltLast: { type: Float32Array, reset: "spawn" },
  // Food flow (nest slice 5; with a queen): food lies in chambers; foragers bring it to reception, porters carry it on.
  /** the chamber an ant carrying food is taking it to (−1: a forager, to reception or the royal chamber), and 1 if it is a porter's move inside the nest */
  portTo: { type: Int16Array, fill: -1, reset: "spawn" },
  porter: { type: Uint8Array, reset: "spawn" },
  /** 1 while an ant carries a corpse (moved like a soil pellet: up and out, along the ground) */
  corpse: { type: Uint8Array, reset: "spawn" },
  /** 1 while an ant carried a load at its last step (what ends its trip when the load is put down: `arrive`) */
  loaded: { type: Uint8Array, reset: "spawn" },
  /** the cell (cellKey) where ant i last put a load down, while it still stands there; else NO_KEY */
  putAt: { type: Float64Array, fill: NO_KEY, reset: "spawn" },
  /**
   * The side view: a pellet carrier carrying its pellet out along the ground: it drops it once it is this many
   * columns from the hole (NaN: not carrying one out), on side #spoilSide, having walked #spoilT seconds. One world's
   * plane (U3c): this far from home by its own vector (a corpse: at least this far, and off the mound), walking out on
   * heading #spoilA, drawn at the crossing (or, spreading spoil off the mound, away from where it believes home is).
   */
  spoilTo: { type: Float32Array, fill: NaN, reset: "spawn" },
  spoilSide: { type: Int8Array },
  spoilT: { type: Float32Array },
  spoilA: { type: Float32Array },
  /**
   * What the pellet carried is (with `pellet`; one place for it, review of MR 15: five per-ant arrays each cleared by
   * hand): DUG, soil it dug, to the hole and out, or into unused space on the way; LOOSE, loose soil off the mound (moved,
   * not dug: not in soilDug), out along the ground; FILL, loose soil taken down into the nest to backfill. `clearPellet`
   * (pellets.ts) puts the pellet and all its state down at once.
   */
  soil: { type: Uint8Array, reset: "spawn" },
  /** the cell it looked from before that (cellKey; NO_KEY none): the way it came, which is never a stale branch */
  cameFrom: { type: Float64Array, fill: NO_KEY, reset: "spawn" },
  /** the cell (cellKey; NO_KEY none) this ant last dug: its pellet never goes straight back in there */
  lastDug: { type: Float64Array, fill: NO_KEY, reset: "spawn" },
  /** releases from a soil wall this trip that made no progress home (see NO_GAIN) */
  noGain: { type: Uint8Array },
  /** 1 once a recruited ant has been away from the nest: coming home then ends its raid */
  gone: { type: Uint8Array, reset: "spawn" },
  /** a raider that has left the raid trail to search on, until it is home (ja-sf1) */
  pastEnd: { type: Uint8Array, reset: "spawn" },
  /** 1 while the ant is on home ground with its threat past defendAt: its stance is defend (docs/stance.md) */
  defending: { type: Uint8Array, reset: "spawn" },
  /** 1 from when fatigue passes patience until it has rested to nothing: a tired forager rests fully, not just under the line */
  tired: { type: Uint8Array, reset: "spawn" },
  /** the situation each ant was last asked about, encoded; −1 = never */
  asked: { type: Int16Array, fill: -1, reset: "spawn" },
  /** the question behind each ant's current mode: its situation (with the mode it had) when last asked; −1 = never */
  question: { type: Int16Array, fill: -1, reset: "spawn" },
  // ——— the desert ant's heat (ja-rf5.5, heat.ts), last so the fields before keep their places (tests/unit/antReset's scribbles) ———
  /** body heat, °C above the nest's: only a species with heat (heatDay > 0) keeps it; 0 otherwise */
  bodyHeat: { type: Float32Array, reset: "spawn" },
  /** 1 while it feels hot: from heatFelt until its body is back below heatCool */
  hot: { type: Uint8Array, reset: "spawn" },
  /**
   * seconds until an ant whose mode was drawn from Jev's probabilities draws again in the same situation (params.reroll;
   * ja-nan3); −1 = its last answer was not drawn, so it is asked again only when its situation changes
   */
  redraw: { type: Float32Array, fill: -1, reset: "spawn" },
} as const satisfies Record<string, ArrayField>;

export type AntArrays = { -readonly [K in keyof typeof ANT_FIELDS]: InstanceType<(typeof ANT_FIELDS)[K]["type"]> };

/** The fields spawn resets, with the value each goes back to (its fill, its parameter, or `resetTo`): [name, value]. `asIs` only: the fields Colony.asIs resets. */
export function antResets(p: AntParams, asIs = false): [string, number][] {
  const out: [string, number][] = [];
  for (const [k, f] of Object.entries(ANT_FIELDS) as [string, ArrayField][]) {
    if (f.reset === undefined || (asIs && f.reset !== "asIs")) continue;
    if (f.perAnt) throw new Error(`ants: ${k} has several elements an ant and cannot be reset by value`);
    out.push([k, f.resetTo ?? (f.fillParam !== undefined ? p[f.fillParam] : (f.fill ?? 0))]);
  }
  return out;
}

/** Every array of the table, for `n` ants. */
export function makeAntArrays(n: number, p: AntParams): AntArrays {
  const a: Record<string, ArrayLike<number>> = {};
  for (const [k, f] of Object.entries(ANT_FIELDS) as [string, ArrayField][]) {
    const v = new f.type(n * (f.perAnt ? f.perAnt(p) : 1));
    if (f.fillParam !== undefined) v.fill(p[f.fillParam]);
    else if (f.fill !== undefined) v.fill(f.fill);
    a[k] = v;
  }
  return a as unknown as AntArrays;
}
