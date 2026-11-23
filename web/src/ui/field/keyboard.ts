// The field's keys and wheel (ja-fnd.6.3.11 part 3, docs/field-split.md): arrows and WASD pan, plus and minus zoom about the centre,
// 0 or Home shows the whole map, n goes to the next nest, Escape drops a follow; the wheel zooms about the pointer. Plain TypeScript with
// no DOM: the shell turns each browser event into these inputs and does what only an event can do (preventDefault). A unit test drives it.

import type { Camera, Extent, Viewport } from "../camera.ts";
import { zoomBy } from "../camera.ts";
import { panGround } from "./rig.ts";

/** A key press, as the handler reads it. */
export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** something earlier already claimed the key (the drawer's Escape) */
  defaultPrevented: boolean;
}

/** What the keys read and do on the page. */
export interface KeyHost {
  rig: {
    camera(): Camera;
    set(c: Camera): void;
    viewport(): Viewport;
    extent(): Extent & { x0: number };
    showAll(): void;
  };
  /** the map is tilted (the inspection orbit) */
  angled(): boolean;
  /** the tilt, radians */
  tilt(): number;
  following(): boolean;
  /** stop following now */
  unfollow(): void;
  /** `n`: the next nest */
  nextNest(): void;
}

/** Each arrow and WASD key's pan as a share of the view's smaller side (the ground moves the opposite way). */
const STEP = 0.15;
/** A zoom key's factor in, and out. */
const ZOOM_IN = 1.25;
const ZOOM_OUT = 0.8;
/** The wheel's zoom rate: a factor of e^(−deltaY × this). */
export const WHEEL_RATE = 0.0015;

/**
 * Act on a key. True when it was the field's (the shell then stops the browser's default for it); false when it was not and
 * passes: a browser or system shortcut (Ctrl, Cmd or Alt held), a key the field has no use for, or an Escape with nothing to drop.
 */
export function handleKey(host: KeyHost, e: KeyInput): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false; // browser and system shortcuts (Ctrl+0, Ctrl+S, …) pass through
  if (e.key === " ") return true; // the focused field doesn't scroll the page
  const rig = host.rig;
  const v = rig.viewport();
  const c = rig.camera();
  const step = Math.min(v.w, v.h) * STEP;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [step, 0],
    a: [step, 0],
    ArrowRight: [-step, 0],
    d: [-step, 0],
    ArrowUp: [0, step],
    w: [0, step],
    ArrowDown: [0, -step],
    s: [0, -step],
  };
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // Shift or Caps Lock still moves
  const m = moves[key];
  if (m) {
    if (host.following()) host.unfollow();
    rig.set(panGround(c, m[0], m[1], host.angled() ? host.tilt() : null));
  } else if (e.key === "+" || e.key === "=") rig.set(zoomBy(c, rig.extent(), v, v.w / 2, v.h / 2, ZOOM_IN));
  else if (e.key === "-" || e.key === "_") rig.set(zoomBy(c, rig.extent(), v, v.w / 2, v.h / 2, ZOOM_OUT));
  else if (e.key === "0" || e.key === "Home") rig.showAll();
  else if (key === "n") host.nextNest();
  // Escape drops a follow; with nothing followed it is left for the drawer (review of #182, S7).
  else if (e.key === "Escape" && host.following() && !e.defaultPrevented) host.unfollow();
  else return false;
  return true;
}

/** A wheel turn over the canvas: the point in device pixels, and how far it turned. */
export interface WheelInput {
  x: number;
  y: number;
  deltaY: number;
}

/** The wheel zooms about the pointer (about the centre of the view when the map is tilted). */
export function handleWheel(
  rig: { zoomAround(v: Viewport, sx: number, sy: number, factor: number): void },
  v: Viewport,
  e: WheelInput,
  angled: boolean,
): void {
  rig.zoomAround(v, angled ? v.w / 2 : e.x, angled ? v.h / 2 : e.y, Math.exp(-e.deltaY * WHEEL_RATE));
}
