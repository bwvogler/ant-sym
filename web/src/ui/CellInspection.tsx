import { dragOrbit, type InspectionOrbit } from "./inspectionOrbit.ts";
import type { InspectionScene } from "./InspectionScene.ts";
import { useEffect, useRef, useState } from "react";
import type { InspectionPatch } from "./inspectionPatch.ts";
import { INSPECTION_ATLAS_URL, LIFECYCLE_ATLAS_URL, LIFECYCLE_ATLAS_SIZE } from "./drawCellInspection.ts";
import { InspectionPatchRenderer, BELOW_ATLAS_URL, BELOW_ATLAS_SIZE } from "./drawInspectionPatch.ts";
import { DEFAULT_INSPECTION_OVERLAYS, SCENT_STYLES, inspectionMarkers } from "./inspectionOverlays.ts";

export default function CellInspection({
  state,
  read,
  onFrame,
  onClose,
}: {
  state: InspectionPatch;
  read: () => InspectionPatch;
  onFrame: (draw: () => void) => () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const reader = useRef(read);
  useEffect(() => {
    reader.current = read;
  }, [read]);
  const [failed, setFailed] = useState(false);
  const [software, setSoftware] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgl" | "software" | "fixed" | "loading">("loading");
  const sceneRef = useRef<InspectionScene | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; orbit: InspectionOrbit } | null>(null);
  const [overlays, setOverlays] = useState(DEFAULT_INSPECTION_OVERLAYS);
  const overlayOptions = useRef(overlays),
    redraw = useRef<(() => void) | null>(null);
  useEffect(() => {
    overlayOptions.current = overlays;
    redraw.current?.();
  }, [overlays]);
  const [loadedMode, setLoadedMode] = useState<InspectionPatch["mode"] | null>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => {
      // Hiding the card blurs its opener before mount. Restore after React reveals it again.
      queueMicrotask(() => {
        const opener = document.querySelector<HTMLButtonElement>("[data-inspect-cell]");
        if (opener?.getClientRects().length) opener.focus();
        else if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
      });
    };
  }, []);
  // One game clock for both renderer paths; no independent timers or animation loops.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const mode = state.mode,
      images: { surface?: CanvasImageSource; lifecycle?: CanvasImageSource; below?: CanvasImageSource } = {};
    const pending: HTMLImageElement[] = [];
    let disposed = false,
      scene: InspectionScene | null = null,
      ctx: CanvasRenderingContext2D | null = null;
    const fallback = new InspectionPatchRenderer();
    const draw = () => {
      if (disposed) return;
      if (scene) scene.draw(reader.current(), overlayOptions.current);
      else if (ctx) fallback.draw(ctx, reader.current(), images, 384, 320, overlayOptions.current);
    };
    redraw.current = draw;
    setLoadedMode(null);
    setRendererKind("loading");
    void import("./InspectionScene.ts")
      .then((m) => m.InspectionScene.create(cv, mode, software))
      .then((next) => {
        if (disposed) {
          next.dispose();
          return;
        }
        scene = next;
        sceneRef.current = next;
        setRendererKind(next.accelerated ? "webgl" : "software");
        setLoadedMode(mode);
        setFailed(false);
        draw();
      })
      .catch(() => {
        if (disposed) return;
        ctx = cv.getContext("2d");
        setRendererKind("fixed");
        setFailed(true);
        const load = (key: keyof typeof images, url: string, size: readonly number[]) => {
          const im = new Image();
          pending.push(im);
          im.onload = () => {
            if (disposed) return;
            if (im.naturalWidth !== size[0] || im.naturalHeight !== size[1]) return;
            images[key] = im;
            if (mode === "below" ? !!images.below : !!images.surface && !!images.lifecycle) setLoadedMode(mode);
            draw();
          };
          im.src = url;
        };
        if (mode === "below") load("below", BELOW_ATLAS_URL, BELOW_ATLAS_SIZE);
        else {
          load("surface", INSPECTION_ATLAS_URL, [1290, 1290]);
          load("lifecycle", LIFECYCLE_ATLAS_URL, LIFECYCLE_ATLAS_SIZE);
        }
        draw();
      });
    const lost = (event: Event) => {
      event.preventDefault();
      setLoadedMode(null);
      setRendererKind("loading");
      setSoftware(true);
    };
    cv.addEventListener("webglcontextlost", lost);
    const off = onFrame(draw);
    return () => {
      disposed = true;
      off();
      cv.removeEventListener("webglcontextlost", lost);
      redraw.current = null;
      sceneRef.current = null;
      scene?.dispose();
      for (const im of pending) im.onload = im.onerror = null;
    };
  }, [onFrame, state.mode, software]);
  const selected = state.selected,
    p = selected.place;
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Cell inspection"
      aria-labelledby="cell-inspection-title"
      className="panel-in pointer-events-auto fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 max-h-[min(58dvh,calc(100dvh-9rem))] overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-3 text-fg shadow-xl outline-none sm:inset-x-auto sm:top-[4.5rem] sm:right-3 sm:bottom-auto sm:max-h-[calc(100dvh-6rem)] sm:w-[min(24rem,48vw)] lg:max-h-[calc(100dvh-12rem)] lg:w-[26rem]"
    >
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex items-center justify-between gap-3 border-b border-line bg-panel px-3 py-2">
        <h2 id="cell-inspection-title" className="text-lg font-semibold">
          Cell {selected.cell.join(", ")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-raised"
        >
          Close inspection
        </button>
      </div>
      <p className="mt-1 text-xs text-fg-3">
        {p.view === "above" ? "Surface" : p.view === "below" ? "Underground" : "Map"} · selected cell + six neighbours · voxel detail
      </p>
      <div className="mt-3 grid gap-4">
        <div>
          <fieldset className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <legend className="sr-only">Inspection overlays</legend>
            <label className="flex min-h-11 items-center gap-1.5">
              <input type="checkbox" checked={overlays.scents} onChange={(e) => setOverlays((o) => ({ ...o, scents: e.target.checked }))} />
              Scents
            </label>
            <label className="flex min-h-11 items-center gap-1.5">
              <input
                type="checkbox"
                checked={overlays.markers}
                onChange={(e) => setOverlays((o) => ({ ...o, markers: e.target.checked }))}
              />
              Location markers
            </label>
          </fieldset>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              className="min-h-11 rounded-md border border-line px-3"
              disabled={rendererKind === "fixed" || rendererKind === "loading"}
              onClick={() => {
                sceneRef.current?.reset();
                redraw.current?.();
              }}
            >
              Map view
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-line px-3"
              disabled={rendererKind === "fixed" || rendererKind === "loading"}
              onClick={() => {
                sceneRef.current?.angle();
                redraw.current?.();
              }}
            >
              Angled view
            </button>
          </div>
          <canvas
            key={software ? "software" : "default"}
            ref={canvas}
            tabIndex={0}
            style={{ touchAction: "none", cursor: rendererKind === "fixed" ? "default" : "grab" }}
            onPointerDown={(e) => {
              const scene = sceneRef.current;
              if (!scene) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, orbit: { ...scene.orbit } };
            }}
            onPointerMove={(e) => {
              const d = drag.current,
                scene = sceneRef.current;
              if (!d || !scene || d.id !== e.pointerId) return;
              scene.orbit = dragOrbit(d.orbit, e.clientX - d.x, e.clientY - d.y);
              redraw.current?.();
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              const scene = sceneRef.current;
              if (!scene) return;
              const movement: Record<string, [number, number]> = {
                ArrowLeft: [-16, 0],
                ArrowRight: [16, 0],
                ArrowUp: [0, -12],
                ArrowDown: [0, 12],
              };
              if (e.key === "Home") {
                e.preventDefault();
                scene.reset();
                redraw.current?.();
              } else if (movement[e.key]) {
                e.preventDefault();
                scene.orbit = dragOrbit(scene.orbit, ...movement[e.key]);
                redraw.current?.();
              }
            }}
            data-view-kind={rendererKind === "fixed" ? "fixed" : "voxel-3d"}
            data-renderer={rendererKind}
            width="384"
            height="320"
            aria-label={`Seven-cell ${state.mode} inspection; ${selected.ants.length} workers in the selected cell`}
            data-assets-ready={loadedMode === state.mode ? "true" : "false"}
            className="mx-auto block h-auto max-h-[27dvh] w-full object-contain [image-rendering:pixelated] sm:max-h-none"
          />
          <p className="mt-1 text-xs text-fg-3">
            {rendererKind === "fixed" ? "Fixed view · 3D models unavailable" : "Drag to rotate · arrow keys rotate · Home resets"}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2" aria-label="Inspection overlay legend">
            {overlays.scents &&
              Object.values(SCENT_STYLES).map((s) => (
                <span key={s.label}>
                  <span aria-hidden="true" style={{ color: s.colour }}>
                    ■{" "}
                  </span>
                  {s.label}
                </span>
              ))}
            {overlays.markers && <span>Entrance · dashed ring / Chamber · diamond</span>}
          </div>
          {failed && (
            <p role="status" className="text-sm text-fg-2">
              The 3D models could not load. The fixed inspection and cell details remain available.
            </p>
          )}
        </div>
        <div className="self-center text-sm">
          <h3 className="mb-3 font-medium">Selected cell only</h3>
          {state.cells[0]?.surfaceStrip && (
            <p className="mb-3 text-xs text-fg-3">Surface boundary: surface workers are shown in the above view.</p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt className="text-fg-3">Ground</dt>
            <dd>{p.ground}</dd>
            <dt className="text-fg-3">Location</dt>
            <dd>
              {inspectionMarkers(p)
                .map((m) => m.label)
                .join(" · ") || "—"}
            </dd>
            <dt className="text-fg-3">Sensed home / food / alarm</dt>
            <dd>{[p.homeTrail, p.foodTrail, p.alarm].map((v) => `${Math.round(v * 100)}%`).join(" / ")}</dd>
            <dt className="text-fg-3">Workers</dt>
            <dd>{selected.ants.length}</dd>
            <dt className="text-fg-3">Queens</dt>
            <dd>
              {selected.queens.length}
              {selected.queens.some((q) => !q.alive) ? " · dead queen present" : ""}
            </dd>
            <dt className="text-fg-3">Eggs / larvae / pupae</dt>
            <dd>{selected.brood.join(" / ")}</dd>
            <dt className="text-fg-3">Carried brood</dt>
            <dd>{selected.ants.filter((a) => a.cargo === "brood").length}</dd>
            <dt className="text-fg-3">Fallen workers</dt>
            <dd>{selected.fallen}</dd>
            <dt className="text-fg-3">Buried in midden</dt>
            <dd>{selected.buried}</dd>
            <dt className="text-fg-3">Loose food</dt>
            <dd>{p.food.toFixed(2)}</dd>
            {p.chamber && (
              <>
                <dt className="text-fg-3">Stored food (whole chamber)</dt>
                <dd>{p.chamber.food.toFixed(2)}</dd>
              </>
            )}
            <dt className="text-fg-3">Recent surface / midden remains</dt>
            <dd>{selected.recentRemains ?? 0}</dd>
            <dt className="text-fg-3">Aphid density</dt>
            <dd>{selected.aphidDensity.toFixed(1)} / cell</dd>
            <dt className="text-fg-3">Spoil height</dt>
            <dd>{p.mound.toFixed(2)}</dd>
            <dt className="text-fg-3">Mycelium</dt>
            <dd>
              {p.hypha ? "Present" : "None"}
              {selected.knot ? " · knot" : ""}
              {selected.knotSprouted ? " (sprouted)" : ""}
              {selected.cord ? " · cord" : ""}
              {selected.fruit ? " · spore tufts" : ""}
              {selected.colonised ? " · colonised remains" : ""}
              {selected.stalk ? " · stalk" : ""}
            </dd>
            <dt className="text-fg-3">Spores</dt>
            <dd>{p.spores ? "Visible" : "None visible"}</dd>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-fg-3">
            The six neighbours give context; these counts apply only to the outlined centre cell. Food and aphid marks show abundance.
            Cadavers decay in steps over 15 simulation minutes. Buried counts are historical, not exposed bodies. Store marks illustrate the
            chamber stock. Floor brood icons are grouped; counts are exact. Soil grit and spoil relief are illustrative. Trail washes use
            the map’s sensed visibility. Scents are local strengths, not movement directions. Overlay switches affect this inspection only.
          </p>
        </div>
      </div>
    </aside>
  );
}
