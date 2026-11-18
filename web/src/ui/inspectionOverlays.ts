import { ALARM_SHOWN, TRAIL_SHOWN, type LensProbe } from "./lens.ts";
import { HOME_RGB, ROLE_RGB, css } from "./palette.ts";

export interface InspectionOverlays {
  scents: boolean;
  markers: boolean;
}
export const DEFAULT_INSPECTION_OVERLAYS: InspectionOverlays = { scents: true, markers: true };
export const SCENT_STYLES = {
  home: { label: "Home · dashes", colour: css(HOME_RGB) },
  food: { label: "Food · dots", colour: "#1F6F5C" },
  alarm: { label: "Alarm · crosses", colour: "#8A5300" },
} as const;
export type InspectionScent = keyof typeof SCENT_STYLES;

/** Already host-sensed and settings-gated by probe. Scalar fields: no invented direction or route. */
export function inspectionScents(p: LensProbe): { kind: InspectionScent; strength: number }[] {
  const out: { kind: InspectionScent; strength: number }[] = [];
  for (const [kind, value, threshold] of [
    ["home", p.homeTrail, TRAIL_SHOWN],
    ["food", p.foodTrail, TRAIL_SHOWN],
    ["alarm", p.alarm, ALARM_SHOWN],
  ] as const)
    if (Number.isFinite(value) && value > threshold) out.push({ kind, strength: Math.min(1, value) });
  return out;
}

export function inspectionMarkers(p: LensProbe): { kind: "entrance" | "chamber"; label: string; colour: string }[] {
  const out: { kind: "entrance" | "chamber"; label: string; colour: string }[] = [];
  if (p.hole >= 0) out.push({ kind: "entrance", label: "Entrance", colour: "#68AF9A" });
  if (p.chamber)
    out.push({ kind: "chamber", label: `${p.chamber.role} chamber`, colour: css(ROLE_RGB[p.chamber.role] ?? [120, 120, 110]) });
  return out;
}
