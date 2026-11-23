import { type RefObject, useRef } from "react";
import { type OrbitHost, orbitKey, resetOrbit, tiltMap } from "./field/orbit.ts";
import type { InspectionOrbit } from "./inspectionOrbit.ts";

// The tilt handle in the middle of the close map (ja-fnd.6.3.12, docs/field-split.md): hidden until the frame says the map can tilt (the frame's result
// shows and hides it through `buttonRef`); drag up to tilt, down to flatten, Home or a double-click resets, the arrow keys step it.

export default function FieldOrbitHandle({ host, buttonRef }: { host: OrbitHost; buttonRef: RefObject<HTMLButtonElement | null> }) {
  const drag = useRef<{ id: number; y: number; start: InspectionOrbit } | null>(null);
  return (
    <button
      ref={buttonRef}
      hidden
      type="button"
      aria-label="Tilt close map. Up and down arrow keys tilt. Home resets."
      title="Drag up to tilt · drag down to flatten · Home or double-click resets"
      className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border border-line bg-panel px-2 py-1 text-xs text-fg-2 shadow-md active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, y: e.clientY, start: host.orbit.current };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id === e.pointerId) {
          tiltMap(host, d.start, e.clientY - d.y);
        }
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => {
        resetOrbit(host);
      }}
      onKeyDown={(e) => {
        if (orbitKey(host, e.key)) e.preventDefault();
      }}
    >
      <svg
        aria-hidden="true"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="#e95151" d="M15 17h13m-4-4 4 4-4 4" />
        <path stroke="#36a45c" d="m15 17-9 10m0-5v5h5" />
        <path stroke="#3888de" d="M15 17V4m-4 4 4-4 4 4" />
      </svg>
      Tilt
    </button>
  );
}
