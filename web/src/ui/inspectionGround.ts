/** Shared materials for the close sprite terrain and the inspection voxel faces. */
export const INSPECTION_GROUND = {
  surfaceSoil: ["#DB9B59", "#E3A363", "#D29454", "#E8AB6B", "#D89B5B"],
  belowSoil: ["#AF855E", "#B58B63", "#A77D56", "#BA916B", "#A9825C"],
  rock: ["#858D88", "#929A95", "#7D8681", "#9AA19B", "#818985"],
  back: "#503B2D",
} as const;

function average(colours: readonly string[]): [number, number, number] {
  const channel = (offset: number) =>
    Math.round(colours.reduce((sum, hex) => sum + parseInt(hex.slice(offset, offset + 2), 16), 0) / colours.length);
  return [channel(1), channel(3), channel(5)];
}

// Each pellet level darkens the disturbed soil. The highest levels share the darkest swatch.
const moundOffsets = [
  [0, 0, 0],
  [-12, -10, -7],
  [-24, -20, -13],
  [-36, -30, -18],
  [-48, -39, -23],
  [-60, -48, -28],
];
export const MOUND_GROUND = moundOffsets.map((offset) =>
  INSPECTION_GROUND.surfaceSoil.map(
    (hex) => "#" + offset.map((delta, i) => (parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) + delta).toString(16).padStart(2, "0")).join(""),
  ),
);

export function moundGroundLevel(height: number): number {
  return Math.min(MOUND_GROUND.length - 1, height);
}

export const CLOSE_SPRITE_GROUND = {
  mound: MOUND_GROUND.map(average),
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
