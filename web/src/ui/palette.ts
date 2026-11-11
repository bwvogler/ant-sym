// Colours the field paints with that are not theme tokens, shared with the
// Learn drawer's swatches so a legend always matches the canvas.

/** The warm tone for the way home. */
export const HOME_RGB: [number, number, number] = [196, 110, 40];
/** Brood by stage (egg, larva, pupa): pale to tan, legible on the chamber washes in both themes. */
export const BROOD_RGB = ["#f2eee2", "#e8cf8a", "#b88a4a"];
/** Chamber washes by role (nest slice 3), faint enough to read in both themes: the queen's violet, brood rose, store gold, reception teal, midden grey. */
export const ROLE_RGB: Record<string, [number, number, number]> = {
  royal: [128, 84, 176],
  brood: [196, 96, 120],
  store: [196, 156, 48],
  reception: [48, 150, 150],
  midden: [120, 120, 110],
};

export const css = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
