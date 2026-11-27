const STEERING_PARTS = ["tunnelNavigation", "homing", "scentProbes", "terrainChecks", "trailResponseAndDeposit"] as const;
type SteeringPart = (typeof STEERING_PARTS)[number];

/** Timing for one on-demand capture. Pass timings are measured, ant stages are sampled. */
export class EngineProfile {
  private static readonly STRIDE = 16;
  private ticks = 0;
  private engineMs = 0;
  private antsMs = 0;
  private colonyMs = 0;
  private pheromonesMs = 0;
  private occupancyMs = 0;
  private fungusMs = 0;
  private sensedMs = 0;
  private decisionsMs = 0;
  private steeringMs = 0;
  private movementMs = 0;
  private policyMs = 0;
  private samples = 0;
  private policySamples = 0;
  private readonly steeringParts = {
    tunnelNavigation: 0,
    homing: 0,
    scentProbes: 0,
    terrainChecks: 0,
    trailResponseAndDeposit: 0,
  };
  private steeringAccountedMs = 0;
  private trailInputsMs = 0;
  private trailChoiceMs = 0;
  private trailWritesMs = 0;
  sampledAnt = false;

  readonly now: () => number;

  constructor(now = () => performance.now()) {
    this.now = now;
  }

  beginTick(): void {
    this.ticks++;
  }

  sampleAnt(index: number): boolean {
    this.sampledAnt = (index & (EngineProfile.STRIDE - 1)) === (this.ticks & (EngineProfile.STRIDE - 1));
    if (this.sampledAnt) this.samples++;
    return this.sampledAnt;
  }

  antStage(stage: "sense" | "decide" | "steer" | "move", ms: number): void {
    switch (stage) {
      case "sense":
        this.sensedMs += ms;
        break;
      case "decide":
        this.decisionsMs += ms;
        break;
      case "steer":
        this.steeringMs += ms;
        break;
      case "move":
        this.movementMs += ms;
        break;
    }
  }

  policy(ms: number): void {
    this.policyMs += ms;
    this.policySamples++;
  }

  /** Clock with already-attributed work removed, so a homing span excludes the probes and tunnel work inside it. */
  steeringClock(): number {
    return this.now() - this.steeringAccountedMs;
  }

  steeringSpan(part: SteeringPart, start: number, end = this.steeringClock()): void {
    const ms = end - start;
    this.steeringParts[part] += ms;
    this.steeringAccountedMs += ms;
  }

  trailParts(inputs: number, choice: number, writes: number): void {
    this.trailInputsMs += inputs;
    this.trailChoiceMs += choice;
    this.trailWritesMs += writes;
  }

  ants(ms: number): void {
    this.antsMs += ms;
  }
  colony(ms: number): void {
    this.colonyMs += ms;
  }
  pheromones(ms: number): void {
    this.pheromonesMs += ms;
  }
  occupancy(ms: number): void {
    this.occupancyMs += ms;
  }
  fungus(ms: number): void {
    this.fungusMs += ms;
  }
  endTick(ms: number): void {
    this.engineMs += ms;
  }

  report() {
    const perTick = (ms: number) => (this.ticks ? ms / this.ticks : 0);
    // Use the sample shares to split the independently measured ant loop.
    // Per-stage timer rounding and outliers are amplified by simple extrapolation.
    const sampledMs = this.sensedMs + this.decisionsMs + this.steeringMs + this.movementMs;
    const estimate = (ms: number) => (sampledMs ? (ms / sampledMs) * perTick(this.antsMs) : 0);
    return {
      ticks: this.ticks,
      meanMsPerTick: {
        ants: perTick(this.antsMs),
        colonyMaintenance: perTick(this.colonyMs),
        pheromones: perTick(this.pheromonesMs),
        occupancyAndCombat: perTick(this.occupancyMs),
        fungus: perTick(this.fungusMs),
        other: perTick(this.engineMs - this.antsMs - this.colonyMs - this.pheromonesMs - this.occupancyMs - this.fungusMs),
      },
      sampledAnts: this.samples,
      sampledPolicyLookups: this.policySamples,
      estimatedTrailMsPerTick: {
        prepareInputs: estimate(this.trailInputsMs),
        chooseTrail: estimate(this.trailChoiceMs),
        rateAndWrite: estimate(this.trailWritesMs),
      },
      estimatedSteeringMsPerTick: {
        ...Object.fromEntries(STEERING_PARTS.map((part) => [part, estimate(this.steeringParts[part])])),
        other: estimate(this.steeringMs - this.steeringAccountedMs),
      } as Record<SteeringPart | "other", number>,
      estimatedAntStageMsPerTick: {
        sensing: estimate(this.sensedMs),
        stanceAndDecisions: estimate(this.decisionsMs),
        steering: estimate(this.steeringMs),
        movementAndArrival: estimate(this.movementMs),
        policyLookupWithinStages: estimate(this.policyMs),
      },
    };
  }
}

/** Active only during the synchronous Game.tick. The browser policy callback runs inside that tick. */
export let activeEngineProfile: EngineProfile | null = null;

export function withEngineProfile(profile: EngineProfile, tick: () => void): void {
  const previous = activeEngineProfile;
  activeEngineProfile = profile;
  profile.beginTick();
  try {
    tick();
  } finally {
    profile.sampledAnt = false;
    activeEngineProfile = previous;
  }
}

/** Time a steering helper only for the existing ant sample. These wrappers live at the steering call sites. */
export function profileSteering<Args extends unknown[], Result>(
  part: SteeringPart,
  run: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => {
    const profile = activeEngineProfile;
    if (!profile?.sampledAnt) return run(...args);
    const start = profile.steeringClock();
    const result = run(...args);
    profile.steeringSpan(part, start);
    return result;
  };
}
