import type { Chamber } from "../colony/index.ts";
export function chamberFoodSpots(ch: Chamber, contains: (x: number, y: number) => boolean = () => true): [number, number][] {
  if (ch.food < 1 || !ch.cells) return [];
  const cells: [number, number][] = [];
  for (const y of [ch.floorRow, ch.floorRow - 1]) for (let x = ch.x0; x <= ch.x1; x++) if (contains(x, y)) cells.push([x, y]);
  if (!cells.length) return [];
  return Array.from({ length: Math.min(40, Math.floor(ch.food)) }, (_, i) => cells[i % cells.length]!);
}
