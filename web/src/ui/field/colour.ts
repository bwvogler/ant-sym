// Colours the layers share (ja-fnd.6.3.5): a colony's tone by its odour. Plain TypeScript.

export type Rgb = [number, number, number];

/** A colony's tone by its odour t (0…1): ink at 0, the warn tone at 1, mixed between. */
export function odourRgb(ink: Rgb, warn: Rgb, t: number): Rgb {
  const m = (k: 0 | 1 | 2) => Math.round(ink[k] + (warn[k] - ink[k]) * Math.min(1, Math.max(0, t)));
  return [m(0), m(1), m(2)];
}

export function odourColour(ink: Rgb, warn: Rgb, t: number): string {
  const [r, g, b] = odourRgb(ink, warn, t);
  return `rgb(${r}, ${g}, ${b})`;
}
