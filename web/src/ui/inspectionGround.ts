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

export const CLOSE_SPRITE_GROUND = {
  spoil: average(INSPECTION_GROUND.dugSoil),
  surface: average(INSPECTION_GROUND.surfaceSoil),
  soil: average(INSPECTION_GROUND.belowSoil),
  rock: average(INSPECTION_GROUND.rock),
  back: average([INSPECTION_GROUND.back]),
};
