import { shortcuts } from "./keys.ts";
import { Icon, Kbd, Modal } from "./kit.tsx";

// The shortcuts sheet (PRD §69.3, ja-mvo9.2): the key ?, the palette, or Settings. Read from keys.ts's table, the one the
// page's key handler answers, so the two can't drift apart.

export default function Shortcuts({ speeds, onClose }: { speeds: readonly number[]; onClose: () => void }) {
  return (
    <Modal label="keyboard shortcuts" onClose={onClose} className="max-w-md">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[15px] font-semibold text-fg">Keyboard shortcuts</h2>
        <button
          type="button"
          className="ml-auto grid size-8 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div className="overflow-y-auto px-4 py-3">
        {shortcuts(speeds).map((g) => (
          <section key={g.group} className="mb-3 last:mb-0" aria-label={g.group}>
            <h3 className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">{g.group}</h3>
            {g.rows.some((r) => r.map) && <p className="text-xs text-fg-3">Click the map first, so it has the keys.</p>}
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-[13px]">
              {g.rows.map((r) => (
                <div key={r.does} className="contents">
                  <dt className="flex flex-wrap gap-1">
                    {r.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dt>
                  <dd className="text-fg-2">{r.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
