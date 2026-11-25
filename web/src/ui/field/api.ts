// What the page may ask of the field and give it (ja-fnd.6.3.12, docs/field-split.md): the types ColonyField's props are made of. Re-exported by ColonyField.

import type { AphidClump, BuildTool, Colony, Fungus, OneWorld } from "../../colony/index.ts";
import type { Camera, Reach } from "../camera.ts";
import type { Followed } from "../follow.ts";
import type { SensedMap } from "../fungusSight.ts";
import type { FieldProbe } from "../lensStore.ts";
import type { Specimen } from "../specimens.ts";
import type { AntTraces } from "../trace.ts";
import type { FieldPen } from "./ctx.ts";

/** The builder on the field (ja-kjj8.3, ja-kjj8.4). */
export interface FieldBuild {
  /** the tool in hand; null: Move (one finger pans and a tap picks an ant, as ever); "tweezers": a touch on an ant lifts it */
  tool: BuildTool | "tweezers" | null;
  /** smell vision (owner, PRD §73): every colony's trails and alarm, everywhere, each trail in its colony's tone */
  smell: boolean;
  /** a piece of a stroke at world points on `layer` (PLANE or CURTAIN); `first`: a new drag begins */
  onStroke: (layer: number, points: { x: number; y: number }[], first: boolean) => void;
  /** the tweezers carry colony k's ant i to world (x, y) on the plane; `first`: a new lift begins */
  onTweeze?: (k: number, i: number, x: number, y: number, first: boolean) => void;
}

/** What the page may ask of the field's cameras. */
export interface FieldApi {
  /**
   * Centre view `view`'s camera (PLANE or CURTAIN) on world (x, y): it is the camera that view opens
   * with. At the shown view's zoom; `close`: at least LINK_ZOOM, so the place shows; `span`: zoomed so that many world
   * units fit across the box's shorter side.
   */
  centreOn: (view: number, x: number, y: number, how?: { close?: boolean; span?: number; keepFollow?: boolean }) => void;
  /** view `view`'s camera as last drawn (null before it was shown or centred) */
  camera: (view: number) => Camera | null;
  /** the whole map, in the view shown (the key 0) */
  showAll: () => void;
  /** colony k's nest, in the view shown (the key n cycles them) */
  goNest: (k: number) => void;
  /** the rectangle of the plane the minimap shows now, in world units: the whole map on a bounded one, the window of chunks round the camera on an endless one (the dev hook reads it) */
  miniWindow: () => Reach;
}

/** What the page gives the field (ColonyField's props). */
export interface FieldProps {
  /** every colony on the map: the first drawn in ink, the second in the warn tone, the ones founded later by their odour (ja-lo8.8) */
  colonies: readonly Colony[];

  /** the fungus: spores drawn on the ground, infected ants marked */
  fungus: Fungus;
  /** what the fungus's hosts have sensed (PRD §65): every colony's trails and alarm show only there, fading */
  sensed: SensedMap;
  onFrame: (fn: () => void) => () => void;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  followed: Followed | null;
  onFollow: (f: Followed | null) => void;
  /** with chamber labels on, a click on a chamber (no ant under it): colony k's chamber `id` (the Learn drawer's Nest tab) */
  onChamber?: (k: number, id: number) => void;
  /** one world: the plane and the curtain, drawn one at a time (`view`) */
  world: OneWorld;
  /** which of one world's layers to show: PLANE (above) or CURTAIN (below) */
  view?: number;
  /**
   * One world: a click (no ant under it) on the line in the top view, or on the side view's strip or the sky over it,
   * asks for the other view (PLANE or CURTAIN) centred on (x, y) there: the strip at that column below, P(s) above.
   */
  onLink?: (view: number, x: number, y: number) => void;
  /** One world: the followed ant has gone through a hole, out of the shown view, onto layer `view` at (x, y). */
  onCross?: (view: number, x: number, y: number) => void;
  /** under the fog: the followed ant walked out of every observer's sight and the follow ended */
  onLostSight?: (f: Followed) => void;
  /** the field's cameras, for the page (centreOn: a linked click, an ant carried across) and the dev hook */
  apiRef?: { current: FieldApi | null };
  /** one world's queen's pen: her flight's circle on the plane, where she would settle, and a click to found there */
  pen?: FieldPen | null;
  /** where the "Go to" menu sits over the field (position classes; the page keeps it clear of its own surfaces) */
  toolsAt?: string;
  /** the specimens (PRD §69.5): each marked on the map with its label */
  specimens?: readonly Specimen[];
  /** the lens is on (PRD §69.3): a mouse over the map reports what is under it, and a click reports it pinned instead of following */
  lens?: boolean;
  /** what is under the pointer, with the lens on (null: the pointer left the map) */
  onProbe?: (p: FieldProbe | null) => void;
  /** the builder (docs/builder.md, PRD §73): the tool in hand, smell vision, and where a stroke goes; null when it is off */
  build?: FieldBuild | null;
  /** the ants the tweezers moved: each one's way home, drawn on the top view (ja-cwjp), builder on or off */
  traces?: AntTraces | null;
  /** the builder's aphid clumps (docs/aphids.md, ja-nzkg.6), read each frame: the game replaces its list as clumps go */
  aphids?: (() => readonly AphidClump[]) | null;
}
