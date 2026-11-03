// Small controls shared by the colony page's panels.

export function Slider({ label, value, min, max, step, format, onChange, disabled = false }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className={`mt-3 block first:mt-0 ${disabled ? "opacity-60" : ""}`} title={disabled ? "Locked while Jev runs" : undefined}>
      <span className="flex justify-between text-sm text-fg-2">
        <span>{label}</span>
        <span className="font-mono text-fg">{format(value)}</span>
      </span>
      <input className="mt-1 w-full" type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** A spend or time bar turns warn past this share of its cap (both pages). */
export const NEAR_CAP = 0.85;

/** A share bar, 0..1. `warnAt`: turn warn past this share (spend and time against a cap). */
export function Bar({ value, warnAt, thin = false }: { value: number; warnAt?: number; thin?: boolean }) {
  return (
    <div className={`${thin ? "mt-1 h-1" : "mt-2 h-1.5"} w-full overflow-hidden rounded bg-raised`}>
      <div className={`h-full ${warnAt !== undefined && value > warnAt ? "bg-warn" : "bg-accent"} transition-[width] duration-300`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
