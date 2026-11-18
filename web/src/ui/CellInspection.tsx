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
  // Share the game's render clock; no timer or independent animation loop. Re-read live positions each frame.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    const lifecycle = new Image();
    const below = new Image();
    const mode = state.mode,
      renderer = new InspectionPatchRenderer();
    let lifecycleReady = false,
      ready = false,
      belowReady = false,
      disposed = false;
    const draw = () => {
      if (!disposed)
        renderer.draw(
          ctx,
          reader.current(),
          { surface: ready ? image : undefined, lifecycle: lifecycleReady ? lifecycle : undefined, below: belowReady ? below : undefined },
          384,
          320,
          overlayOptions.current,
        );
    };
    redraw.current = draw;
    const load = (im: HTMLImageElement, url: string, size: readonly number[], accept: () => void) => {
      im.onload = () => {
        if (disposed) return;
        if (im.naturalWidth !== size[0] || im.naturalHeight !== size[1]) {
          setFailed(true);
          return;
        }
        accept();
        if (mode === "below" ? belowReady : ready && lifecycleReady) {
          setLoadedMode(mode);
          setFailed(false);
        }
        draw();
      };
      im.onerror = () => {
        if (!disposed) setFailed(true);
      };
      im.src = url;
    };
    if (mode === "below")
      load(below, BELOW_ATLAS_URL, BELOW_ATLAS_SIZE, () => {
        belowReady = true;
      });
    else {
      load(image, INSPECTION_ATLAS_URL, [1290, 1290], () => {
        ready = true;
      });
      load(lifecycle, LIFECYCLE_ATLAS_URL, LIFECYCLE_ATLAS_SIZE, () => {
        lifecycleReady = true;
      });
    }
    const off = onFrame(draw);
    draw();
    return () => {
      disposed = true;
      redraw.current = null;
      off();
      image.onload = image.onerror = null;
      lifecycle.onload = lifecycle.onerror = null;
      below.onload = below.onerror = null;
    };
  }, [onFrame, state.mode]);
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
          <canvas
            ref={canvas}
            width="384"
            height="320"
            aria-label={`Seven-cell ${state.mode} inspection; ${selected.ants.length} workers in the selected cell`}
            data-assets-ready={loadedMode === state.mode ? "true" : "false"}
            className="mx-auto block h-auto max-h-[27dvh] w-full object-contain [image-rendering:pixelated] sm:max-h-none"
          />
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
              The inspection image could not load. Cell details are still available.
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
            <dt className="text-fg-3">Food</dt>
            <dd>{p.food.toFixed(2)}</dd>
            <dt className="text-fg-3">Aphid density</dt>
            <dd>{selected.aphidDensity.toFixed(1)} / cell</dd>
            <dt className="text-fg-3">Spoil height</dt>
            <dd>{p.mound.toFixed(2)}</dd>
            <dt className="text-fg-3">Mycelium</dt>
            <dd>
              {p.hypha ? "Present" : "None"}
              {selected.knot ? " · knot" : ""}
              {selected.stalk ? " · stalk" : ""}
            </dd>
            <dt className="text-fg-3">Spores</dt>
            <dd>{p.spores ? "Visible" : "None visible"}</dd>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-fg-3">
            The six neighbours give context; these counts apply only to the outlined centre cell. Food and aphid marks show abundance. Floor
            brood and fallen-ant icons are grouped; counts are exact. Soil grit and spoil relief are illustrative. Trail washes use the
            map’s sensed visibility. Scents are local strengths, not movement directions. Overlay switches affect this inspection only.
          </p>
        </div>
      </div>
    </aside>
  );
}
