import type { JevRequest } from "../../shared/jev.ts";
import { DEFAULT_MENU, estimateTokens, LANE_KINDS, LANE_LIST, LANES, type LaneName, type LaneWords } from "../colony/index.ts";

// What Jev is sent, pure: the Learn drawer shows the exact request for one
// situation, and what a question costs. Requests pack many situations behind
// one shared legend and doctrine (colonyBrain.ts), so the cost of a question
// is a full request's size over the situations it carries, as useColonyJev's
// estimates have always been.

export { SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE } from "../colony/index.ts";
const MENU_ON = new Set(DEFAULT_MENU);

export { PER_REQUEST } from "../colony/index.ts";

/** A sample for lane N: the situation type its row takes (the lane registry's). */
type SampleOf<N extends LaneName> = { lane: N; situation: (typeof LANES)[N]["sample"] };
export type Sample = SampleOf<"mode"> | SampleOf<"stance"> | (SampleOf<"fungus"> & { menu?: ReadonlySet<string> });

/**
 * The request lane `lane` would send for these situations under these words (doctrine or aim): the lane's own key and pack, with the ids its
 * items carry. The fungus's request asks the levers its key says a host in that situation is asked (the menu's, a queen's or a worker's).
 */
export function requestFor(sample: Sample, words: string, n = 1, laneWords?: LaneWords): JevRequest {
  const lane = LANE_LIST.find((l) => l.name === sample.lane)!;
  const menu = sample.lane === "fungus" ? (sample.menu ?? MENU_ON) : undefined;
  const key = lane.key(sample.situation, menu, laneWords); // a species' own words: its key and its request (ja-fnd.5.13)
  return lane.pack(
    Array.from({ length: n }, (_, k) => ({ id: `${lane.kind.idPrefix}${k}`, key, situation: sample.situation })),
    words,
    laneWords,
  );
}

/** Each lane's own sample situation, as the Learn panel shows it and a question is costed by it. */
const SAMPLES = Object.fromEntries(LANE_LIST.map((l) => [l.name, { lane: l.name, situation: l.sample }])) as Record<LaneName, Sample>;

/** Situations a request carries in lane `lane`: PER_REQUEST, but fewer for the fungus (a question per lever each). */
export function perRequest(lane: LaneName): number {
  return LANE_KINDS[lane].perRequest;
}

/** Estimated input tokens per question (one situation) in lane `lane`, packed as the page packs them. */
export function tokensPerQuestion(lane: LaneName, words: string, laneWords?: LaneWords): number {
  const n = perRequest(lane);
  // A species' own mode words (ja-fnd.5.12, review of #132 S2): its sample has its own fields, at their first values.
  const schema = lane === "mode" ? laneWords?.schema : undefined;
  const sample = schema ? ({ lane: "mode", situation: { ...schema.decode(0), ...SAMPLES.mode.situation } } as Sample) : SAMPLES[lane];
  return Math.round(estimateTokens(requestFor(sample, words, n, laneWords)) / n);
}
