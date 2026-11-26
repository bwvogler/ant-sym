import { mapPixelRatio } from "./playbackOptions.ts";
import { mapOrbit } from "./inspectionOrbit.ts";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { type Colony, CURTAIN, mapOfLayer, PLANE, type WorldMap } from "../colony/index.ts";
import { toWorld } from "./camera.ts";
import type { Followed } from "./follow.ts";
import { handleKey, type KeyHost } from "./field/keyboard.ts";
import { PointerController, type PointerHost, type PointerInput } from "./field/pointer.ts";
import type { FieldApi, FieldBuild, FieldProps } from "./field/api.ts";
import { isKnown } from "./fog/knownView.ts";
import { chamberUnder, linkTarget, pickAnt } from "./field/hit.ts";
import type { OrbitHost } from "./field/orbit.ts";
import type { FieldPen } from "./field/ctx.ts";
import FieldGoToMenu from "./FieldGoToMenu.tsx";
import FieldOrbitHandle from "./FieldOrbitHandle.tsx";
import { useCameraRig } from "./useCameraRig.ts";
import { useFieldFrame } from "./useFieldFrame.ts";
import { useLatest } from "./useLatest.ts";
import { isPalm } from "./build.ts";
import type { Specimen } from "./specimens.ts";
import type { FieldProbe } from "./lensStore.ts";

export type { FieldProbe };

// The colony's ground through a camera. One canvas at device resolution,
// redrawn every frame: only the chunks in view are painted, each into its
// own 64×64 canvas and scaled up without smoothing, so cells stay crisp;
// only the ants in view are drawn, as aerial worker sprites at hex zoom and ink ticks farther out, with a jade crumb on the
// carriers. Drag to pan, wheel or pinch to zoom, arrows/WASD and +/− on the
// keyboard; click an ant to follow it. Zoomed in, a minimap in the corner
// shows the whole map and where the view is (click it to jump). Colours
// come from the theme's CSS variables, so dark mode needs no code path of
// its own. The canvas sits absolutely in its aspect-ratio box: in flow, its
// own pixel height fed back into the box and stretched the map on a phone.
//
// One world (docs/one-world.md §5) is one game in two views, drawn one at a time: above, the plane, with the line
// dashed through the holes, each hole named, and the mound; below, the curtain unrolled, with the ground strip drawn
// from the plane cells under the line (P(s)), the mound's cut stacked on it and the plane's ants standing there, and a
// faint rule at each bend. Each view keeps its own camera; only the ants, corpses and scent of the view's layer show.
// The views are linked (U5.2): a click on the line above, or on the strip below, asks the page for the other view there
// (onLink); a followed ant that goes through a hole is reported (onCross), and the page carries the camera across. In
// the queen's pen the top view shows her flight's circle and, under the pointer, where she would settle.

export type { FieldApi, FieldBuild };

/** The pen on the field (one world's top view). */
export type { FieldPen };

/** No specimens: one empty list, so the default prop is the same each render. */
const NO_SPECIMENS: readonly Specimen[] = [];

/** A click (or a finger's tap) that moved less than this many CSS px is a click, not a drag. */
const CLICK_SLOP_PX = 8;

export default function ColonyField({
  colonies,
  fungus,
  sensed,
  onFrame,
  showFoodTrail,
  showHomeTrail,
  followed,
  onFollow,
  onChamber,
  world,
  view = CURTAIN,
  onLink,
  onCross,
  onLostSight,
  apiRef,
  pen = null,
  toolsAt = "top-2 left-2",
  lens = false,
  onProbe,
  build = null,
  traces = null,
  aphids = null,
  specimens = NO_SPECIMENS,
}: FieldProps) {
  // No colony is the player's (you are the fungus): this one only gives what every colony shares, the map and the holes.
  const anyColony = colonies[0] as Colony;
  const count = colonies.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbitAxes = useRef<HTMLButtonElement>(null);
  const orbit = useRef(mapOrbit());
  const angled = useRef(false);
  /** chamber names drawn on the side view's nests (the Labels button); a click on a chamber then inspects it */
  const [labels, setLabels] = useState(false);
  // What a frame's callbacks read each time they run: the props as of the last commit (ui/useLatest.ts).
  const labelsOn = useLatest(labels);
  const layers = useLatest({ food: showFoodTrail, home: showHomeTrail });
  /** the view shown: PLANE or CURTAIN. Read each frame, so switching draws no new field */
  const shown = useLatest(view);
  const follow = useRef<Followed | null>(followed);
  useEffect(() => {
    follow.current = followed;
  }, [followed]);
  /** the nest `n` went to last: it cycles through the colonies' nests */
  const nestTurn = useRef(0);
  const followCb = useLatest(onFollow);
  const crossCb = useLatest(onCross);
  const lostCb = useLatest(onLostSight);
  /** the followed ant's layer when last drawn: a change is a crossing (a new follow starts afresh) */
  const antLayer = useRef<{ f: Followed; layer: number } | null>(null);
  /**
   * The layer the page was last asked to show for the followed ant (onCross), until the view shown is it: a crossing is
   * judged against the view on its way, not the one still drawn. An ant flicking up and down a hole within the frame or
   * two the switch takes otherwise left the view on the wrong side of it (the e2e guard caught one in twenty runs).
   */
  const carryTo = useRef<number | null>(null);
  const penRef = useLatest(pen);
  const buildRef = useLatest(build);
  /** the pointer over the canvas (device px), for the pen's preview; null when it left */
  const hover = useRef<[number, number] | null>(null);
  const worldRef = useLatest(world);
  const sensedRef = useLatest(sensed);
  const rig = useCameraRig({ shown, worldRef, canvasRef, follow, followCb, sensed: sensedRef });

  /** The shown view's map: the plane or the curtain. */
  const shownMap = (): WorldMap => mapOfLayer(world, shown.current);
  // A new game starts zoomed out, in both views.
  useEffect(() => {
    rig.clear();
  }, [colonies, rig]);
  const aphidsRef = useLatest(aphids);
  const tracesRef = useLatest(traces);
  const pinnedRef = useLatest(specimens);
  const lensRef = useLatest(!!lens);
  const probeCb = useLatest(onProbe);
  /** The pointer gestures (ui/field/pointer.ts): the pointers down, the gesture under way, the palms the builder set aside (never panned, painted or counted toward a pinch). */
  const [ptr] = useState(() => new PointerController());
  // The frame loop (ui/useFieldFrame.ts): the canvas's draw and its observers, built again when the game changes.
  useFieldFrame({
    colonies,
    count,
    fungus,
    sensed,
    world,
    onFrame,
    anyColony,
    refs: {
      canvasRef,
      orbit,
      orbitAxes,
      angled,
      shown,
      buildRef,
      labelsOn,
      layers,
      hover,
      penRef,
      aphidsRef,
      tracesRef,
      pinnedRef,
      follow,
      followCb,
      antLayer,
      carryTo,
      crossCb,
      lostCb,
      rig,
    },
  });

  // ——— input: one pointer drags (pans), two pinch; a click picks an ant; the minimap jumps ———

  const dpr = mapPixelRatio;
  const slop = () => CLICK_SLOP_PX * dpr();
  const camera = () => rig.camera();
  const viewport = () => rig.viewport();
  const showAll = () => rig.showAll();
  /** Centre on colony k's nest (n cycles through them): on the shown layer (its hole on the plane above, its shaft and chamber below). */
  const goNest = (k: number) => {
    const col = colonies[k] ?? anyColony;
    nestTurn.current = k;
    // Below, a colony's shaft is on its own line's curtain: the page is asked to show that line (docs/endless-world.md §8), as a linked click does.
    if (shown.current !== PLANE && col.home !== shown.current && onLink) {
      const n = col.layers[col.home]?.nest;
      if (n) {
        const e = n.entrance;
        onLink(col.home, e ? (e.x + n.x) / 2 : n.x, e ? (e.y + n.y) / 2 : n.y);
        return;
      }
    }
    rig.goTo((col.layers[shown.current] ?? col.layers[0]!).nest);
  };

  // The page's handle on the cameras: a view opens where it is asked (a linked click, an ant carried across).
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      centreOn: (v, x, y, how) => rig.centreOn(v, x, y, how),
      camera: (v) => rig.cams.get(v)?.cam ?? null,
      showAll: () => showAll(),
      goNest: (k) => goNest(k),
      miniWindow: () => rig.miniWindow(),
    };
    return () => {
      apiRef.current = null;
    };
  });
  /** The orbit handle's host: the tilt of the close map (field/orbit.ts). */
  const orbitHost: OrbitHost = { orbit, camera, setCamera: (c) => rig.set(c), dpr };
  /** A click on nothing in one world: the other view, where the line or the strip says (field/hit.ts). */
  const link = (x: number, y: number) => {
    if (!onLink) return;
    const t = linkTarget(world, shown.current, camera(), viewport(), x, y, dpr());
    if (t) onLink(t.view, t.x, t.y);
  };
  /** Stop following now: the ref at once (a rAF draw must not re-centre on the ant first), the parent's state after. */
  const unfollow = () => {
    follow.current = null;
    onFollow(null);
  };
  const devicePoint = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  /** The nearest ant (any colony, on the view's layer) within PICK_PX of the point, or null. */
  const pick = (x: number, y: number): Followed | null =>
    pickAnt(colonies, camera(), viewport(), dpr(), shown.current, x, y, sensed.knowledge);
  /** The chamber under the point, as (colony index, chamber id), or null. */
  const chamberAt = (x: number, y: number) =>
    chamberUnder(shownMap(), colonies, camera(), viewport(), x, y, { knowledge: sensed.knowledge, lv: shown.current });

  /** Send a piece of stroke, device points to world, to the builder (on the shown view's layer). */
  const paint = (pts: [number, number][], first: boolean) => {
    const b = buildRef.current;
    if (!b?.tool) return;
    const c = camera();
    const v = viewport();
    b.onStroke(
      shown.current,
      pts.map(([px, py]) => {
        const [wx, wy] = toWorld(c, v, px, py);
        return { x: wx, y: wy };
      }),
      first,
    );
  };

  /** What the pointer controller reads and does on the page (ui/field/pointer.ts): this render's, like the handlers' closures were. */
  const ptrHost = (): PointerHost => ({
    rig,
    slop,
    angled: () => angled.current,
    tilt: () => orbit.current.tilt,
    build: () => buildRef.current,
    pick,
    paint,
    onPlane: () => shown.current === PLANE,
    following: () => !!follow.current,
    follow: (f) => {
      follow.current = f;
      onFollow(f);
    },
    setHover: (x, y) => {
      hover.current = [x, y];
    },
    lensOn: () => lensRef.current,
    probe: probeAt,
    pen: () => penRef.current,
    labelsOn: () => labelsOn.current,
    chamberAt,
    onChamber,
    link,
  });
  const pointerInput = (e: PointerEvent<HTMLCanvasElement>): PointerInput => {
    const [x, y] = devicePoint(e);
    return { id: e.pointerId, pointerType: e.pointerType, button: e.button, buttons: e.buttons, x, y, palm: isPalm(e) };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) e.preventDefault(); // middle-drag pans; no autoscroll
    if (!ptr.down(ptrHost(), pointerInput(e))) return; // a palm, set aside by the builder
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
  };

  /** Report canvas point (x, y) to the lens: the page's pixels, the world point and the ant there. */
  const probeAt = (x: number, y: number, pinned: boolean) => {
    const cv = canvasRef.current;
    if (!cv || !probeCb.current) return;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const [wx, wy] = toWorld(camera(), viewport(), x, y);
    probeCb.current({ sx: r.left + x / k, sy: r.top + y / k, lv: shown.current, x: wx, y: wy, ant: pick(x, y), pinned });
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => ptr.move(ptrHost(), pointerInput(e));

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => ptr.up(ptrHost(), pointerInput(e), e.type !== "pointerup");

  const keyHost = (): KeyHost => ({
    rig,
    angled: () => angled.current,
    tilt: () => orbit.current.tilt,
    following: () => !!follow.current,
    unfollow,
    // The n key cycles the nests the fungus knows (all of them without the fog).
    nextNest: () => {
      const ks = colonies.map((_, k) => k).filter((k) => isKnown(sensed.known, k));
      if (ks.length) goNest(ks.find((k) => k > nestTurn.current) ?? ks[0]!);
    },
  });
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (handleKey(keyHost(), e)) e.preventDefault();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`absolute inset-0 block h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${build?.tool ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        role="application"
        aria-label={`colony field: drag to pan, wheel or pinch to zoom, arrow keys to move, plus and minus to zoom, 0 for the whole map (the start nests, on the endless world), n to cycle the nests; click an ant to follow it (with the lens on, i, a click says what is there instead)${pen && view === PLANE ? "; click where the new queen flies" : view === PLANE ? "; click the line to look below there" : "; click the ground strip to look above there"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={() => ptr.dropMini(ptrHost())}
        onBlur={() => ptr.dropMini(ptrHost())}
        onPointerLeave={() => {
          hover.current = null;
          if (lensRef.current) probeCb.current?.(null);
        }}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      />
      <FieldOrbitHandle host={orbitHost} buttonRef={orbitAxes} />
      <FieldGoToMenu
        colonies={colonies}
        known={sensed.known}
        world={world}
        view={view}
        toolsAt={toolsAt}
        labels={labels}
        onLabels={setLabels}
        showAll={showAll}
        goNest={goNest}
      />
    </>
  );
}
