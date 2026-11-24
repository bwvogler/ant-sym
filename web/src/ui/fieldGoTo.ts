import { mapOfLayer, type OneWorld } from "../colony/index.ts";

/** Whether the "Go to" menu offers chamber labels: the map of the view shown (the plane, or the curtain of the line that layer is) has chambers. */
export const hasChamberLabels = (world: OneWorld, view: number): boolean => !!mapOfLayer(world, view).chambers;
