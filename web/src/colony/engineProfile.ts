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
  sampledAnt = false;

  readonly now = () => performance.now();

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
