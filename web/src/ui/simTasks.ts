/** Schedule a turn, returning a function that cancels it. */
export type SimTasks = (delay: number, run: () => void) => () => void;

let ready: MessageChannel | undefined;
let serial = 0;
const pending = new Map<number, () => void>();

/** Yield to the browser between slices without the nested-timer delay when steps are already due. */
export const browserSimTasks: SimTasks = (delay, run) => {
  if (delay > 0) {
    const timer = setTimeout(run, delay);
    return () => clearTimeout(timer);
  }
  if (!ready) {
    ready = new MessageChannel();
    ready.port1.onmessage = ({ data }: MessageEvent<number>) => {
      const task = pending.get(data);
      pending.delete(data);
      task?.();
    };
  }
  const id = ++serial;
  pending.set(id, run);
  ready.port2.postMessage(id);
  return () => {
    pending.delete(id);
  };
};
