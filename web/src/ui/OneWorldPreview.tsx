import { useEffect, useMemo, useRef, useState } from "react";
import { generateOneWorld } from "../colony/oneWorld.ts";
import { worldExtent } from "../colony/world.ts";
import ColonyField from "./ColonyField.tsx";
import { previewSeed, stillLife } from "./oneWorldView.ts";
import { seg } from "./styles.ts";

type View = "above" | "below";

/**
 * One world, previewed (U2, ja-lp4.2; docs/one-world.md): the plane from above and the curtain from the side, generated
 * together and drawn read-only. No ants, no simulation: U3 puts colonies on both layers, U5 makes this the game's page.
 */
export default function OneWorldPreview() {
  const [seed, setSeed] = useState(() => previewSeed(window.location.search));
  // What is typed in the seed box: free to be empty while typing; a new world is made on Enter or leaving the box.
  const [seedText, setSeedText] = useState(String(seed));
  const [view, setView] = useState<View>("below");
  const world = useMemo(() => generateOneWorld(seed), [seed]);
  const map = view === "above" ? world.plane : world.curtain;
  const shown = useMemo(() => stillLife(map), [map]);
  const applySeed = () => {
    const n = Number(seedText);
    if (Number.isInteger(n) && n >= 1) setSeed(n);
    else setSeedText(String(seed));
  };

  // ColonyField redraws when told a frame passed; with nothing running, tell it every animation frame.
  const listeners = useRef(new Set<() => void>());
  useEffect(() => {
    let id = requestAnimationFrame(function frame() {
      for (const fn of listeners.current) fn();
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const onFrame = useMemo(
    () => (fn: () => void) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
    [],
  );

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
      <p className="text-fg-2">
        {view === "above"
          ? `The surface: ${world.plane.size.w}×${world.plane.size.h} cells of rock, ground and food, the nests' holes on it. The line through the holes runs ${world.line.sMax - world.line.sMin + 1} cells, ${world.line.margin} past each end.`
          : "Everything underground, under the line through the holes, unrolled flat: the strip along the top is the surface under the line, then the crust, broken only at each hole, its shaft and royal chamber, and soil, stones and buried food below."}
      </p>
      <div className="relative" style={{ aspectRatio: `${ext.w} / ${ext.h}` }}>
        <ColonyField key={`${seed}-${view}`} colonies={shown.colonies} fungus={shown.fungus} onFrame={onFrame} showFoodTrail={false} showHomeTrail={false} followed={null} onFollow={() => {}} />
      </div>
    </main>
  );
}
