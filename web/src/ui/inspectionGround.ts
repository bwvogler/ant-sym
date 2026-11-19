/** Shared materials for the close sprite terrain and the inspection voxel faces. */
export const INSPECTION_GROUND = {
  surfaceSoil: ["#DB9B59", "#E3A363", "#D29454", "#E8AB6B", "#D89B5B"],
  dugSoil: ["#A77B50", "#C39765", "#916B46", "#B38B5E", "#8B684A"],
  belowSoil: ["#AF855E", "#B58B63", "#A77D56", "#BA916B", "#A9825C"],
  rock: ["#858D88", "#929A95", "#7D8681", "#9AA19B", "#818985"],
  back: "#503B2D",
} as const;

function average(colours: readonly string[]): [number, number, number] {
  const channel = (offset: number) =>
    Math.round(colours.reduce((sum, hex) => sum + parseInt(hex.slice(offset, offset + 2), 16), 0) / colours.length);
  return [channel(1), channel(3), channel(5)];
}

// More pellets cover more of the pale ground. This is the distant average of
// the same fixed dirt material, with shadow becoming stronger as balls stack.
const bare = average(INSPECTION_GROUND.surfaceSoil),
  dug = average(INSPECTION_GROUND.dugSoil);
const moundColours = [0, 0.23, 0.37, 0.47, 0.55, 0.62].map((coverage, level) =>
  bare.map((channel, i) => Math.round(channel * (1 - coverage) + dug[i] * coverage * (1 - level * 0.015))),
);

export function moundGroundLevel(height: number): number {
  return Math.min(moundColours.length - 1, height);
}

export const CLOSE_SPRITE_GROUND = {
  mound: moundColours,
  surface: average(INSPECTION_GROUND.surfaceSoil),
  soil: average(INSPECTION_GROUND.belowSoil),
  rock: average(INSPECTION_GROUND.rock),
  back: average([INSPECTION_GROUND.back]),
};

/** Bring in the close material palette ahead of the first voxel blend, at 48 CSS px per hex. */
export function inspectionGroundMix(cssZoom: number): number {
  const t = Math.max(0, Math.min(1, (cssZoom - 18) / (48 - 18)));
  return t * t * (3 - 2 * t);
}
