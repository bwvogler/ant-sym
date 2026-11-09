import { useEffect, useMemo, useRef, useState } from "react";
import { generateOneWorld, type OneWorld } from "../colony/oneWorld.ts";
import { worldExtent, type WorldMap } from "../colony/world.ts";
import ColonyField from "./ColonyField.tsx";
import { useFrameBus } from "./frameBus.ts";
import { parseSeed, previewSeed, stillLife, withSeed } from "./oneWorldView.ts";
import { seg } from "./styles.ts";

type View = "above" | "below";

/**
 * The last few seeds' worlds, or null for a seed that made none: going back to a seed, and StrictMode running state
 * initialisers twice in development, make nothing again. Oldest out first.
 */
const made = new Map<number, OneWorld | null>();
const KEEP = 4;

/** The one world of `seed`, or null if it can't be made (generateOneWorld throws; logged, so a bug isn't taken for a seed). */
function tryWorld(seed: number): OneWorld | null {
  if (made.has(seed)) return made.get(seed)!;
  let world: OneWorld | null = null;
  try {
    world = generateOneWorld(seed);
  } catch (e) {
    console.error(`one world: seed ${seed}`, e);
  }
  made.set(seed, world);
  if (made.size > KEEP) made.delete(made.keys().next().value!);
  return world;
}

/** Point the address at `seed`, keeping the rest of it: a reload or a shared link opens the world shown. */
function showSeed(seed: number): void {
  history.replaceState(null, "", withSeed(window.location.search, seed) + window.location.hash);
}

/** The world the page opens on: the address's seed, or seed 1 when it has none or that seed makes no world (and why). */
function opening(search: string): { world: OneWorld; failed: string | null } {
  const asked = new URLSearchParams(search).get("seed");
  const seed = previewSeed(search);
  const world = tryWorld(seed);
  if (world) return { world, failed: asked === null || parseSeed(asked) !== null ? null : `"${asked}" is no seed (a whole number from 1); showing seed 1.` };
  return { world: tryWorld(1)!, failed: `Seed ${seed} makes no world; showing seed 1.` };
}

/** Each layer's stub colonies, made the first time it is shown and kept while its world lives: toggling builds nothing. */
const lives = new WeakMap<WorldMap, ReturnType<typeof stillLife>>();
function stillLifeOf(map: WorldMap): ReturnType<typeof stillLife> {
  let life = lives.get(map);
  if (!life) lives.set(map, (life = stillLife(map)));
  return life;
}

/**
 * One world, previewed (U2, ja-lp4.2; docs/one-world.md): the plane from above and the curtain from the side, generated
 * together and drawn read-only. No ants, no simulation: U3 puts colonies on both layers, U5 makes this the game's page.
 */
export default function OneWorldPreview() {
  // The world is made when a seed is applied, not while rendering: a seed that fails to make one leaves the last world
  // and the address as they were, and says so.
  const [start] = useState(() => opening(window.location.search));
  const [world, setWorld] = useState(start.world);
  const seed = world.seed;
  // What is typed in the seed box: free to be empty while typing; a new world is made on Enter or leaving the box.
  const [seedText, setSeedText] = useState(String(seed));
  const [failed, setFailed] = useState<string | null>(start.failed);
  // The address names the world shown, so a reload or a shared link opens it.
  useEffect(() => showSeed(start.world.seed), [start]);
  const [view, setView] = useState<View>("below");
  const map = view === "above" ? world.plane : world.curtain;
  const shown = stillLifeOf(map);
  const applySeed = () => {
    const n = parseSeed(seedText);
    // The current seed again (as leaving the box after a reset does): nothing changes, and a notice stays to be read.
    if (n === seed) return;
    if (n === null) {
      if (seedText.trim() !== "") setFailed(`"${seedText}" is no seed (a whole number from 1); still showing seed ${seed}.`);
      return setSeedText(String(seed));
    }
    const next = tryWorld(n);
    if (!next) {
      setFailed(`Seed ${n} makes no world; still showing seed ${seed}.`);
      return setSeedText(String(seed));
    }
    setFailed(null);
    setWorld(next);
    setSeedText(String(n));
    showSeed(n);
  };

  // ColonyField redraws when told a frame passed. Nothing runs here, so a frame is asked for only when the picture can
  // change: a drag, a pinch, a click, the wheel or a key moving the camera, the field resizing, the theme switching
  // (ColonyField draws once itself when it mounts). Hovering changes nothing, so it draws nothing.
  const { onFrame, fire } = useFrameBus();
  const pending = useRef(0);
  const poke = useMemo(
    () => () => {
      if (pending.current) return;
      pending.current = requestAnimationFrame(() => {
        pending.current = 0;
        fire();
      });
    },
    [fire],
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ro = new ResizeObserver(poke);
    if (box.current) ro.observe(box.current);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", poke);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", poke);
      cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, [poke]);

  const ext = worldExtent(map);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-3 p-4 text-sm text-fg">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">One world</h1>
        <span className="rounded-md bg-raised px-2 py-0.5 text-xs text-fg-2">preview: no ants yet</span>
        <div className="flex overflow-hidden rounded-md border border-line">
          {(["above", "below"] as View[]).map((v) => (
            <button key={v} type="button" className={seg(view === v)} onClick={() => setView(v)}>
              {v === "above" ? "from above" : "below ground"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-fg-2">Seed</span>
          <input
            type="number"
            min={1}
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            onBlur={applySeed}
            onKeyDown={(e) => e.key === "Enter" && applySeed()}
            className="w-20 rounded-md border border-line bg-panel px-2 py-1"
          />
        </label>
      </header>
      {failed && <p className="text-warn">{failed}</p>}
      <p className="text-fg-2">
        {view === "above"
          ? `The surface: ${world.plane.size.w}×${world.plane.size.h} cells of rock, ground and food, the nests' holes on it. The line through the holes runs ${world.line.sMax - world.line.sMin + 1} cells, ${world.line.margin} past each end.`
          : "Everything underground, under the line through the holes, unrolled flat: the strip along the top is the surface under the line, then the crust, broken only at each hole, its shaft and royal chamber, and soil, stones and buried food below."}
      </p>
      <div
        ref={box}
        className="relative"
        style={{ aspectRatio: `${ext.w} / ${ext.h}` }}
        onPointerDownCapture={poke}
        onPointerMoveCapture={(e) => e.buttons !== 0 && poke()}
        onPointerUpCapture={poke}
        onWheelCapture={poke}
        onKeyDownCapture={poke}
        onKeyUpCapture={poke}
        onClickCapture={poke}
      >
        <ColonyField key={`${seed}-${view}`} colonies={shown.colonies} fungus={shown.fungus} onFrame={onFrame} showFoodTrail={false} showHomeTrail={false} followed={null} onFollow={() => {}} />
      </div>
    </main>
  );
}
