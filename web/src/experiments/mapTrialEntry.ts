import { GAME_SPEED } from "../ui/useColony.ts";
import { openMapTrial } from "./mapTrialRuntime.ts";
import { MapTrialSnapshots, type MapTrialCommand, type MapTrialReply } from "./mapTrialState.ts";

let runtime: Awaited<ReturnType<typeof openMapTrial>> | undefined;
let snapshots = new MapTrialSnapshots();

self.addEventListener("message", ({ data }: MessageEvent<MapTrialCommand>) => {
  if (data.type === "init") {
    void openMapTrial(
      data.seed,
      data.antCount,
      (game, progress, rebuilt) => {
        if (rebuilt) {
          snapshots = new MapTrialSnapshots();
          self.postMessage({ type: "world", state: game.save() } satisfies MapTrialReply);
        }
        const frame = snapshots.frame(game, Boolean(progress));
        const transfer = frame.colonies.flatMap(({ ants }) => ants.map((a) => a.buffer as ArrayBuffer));
        self.postMessage({ ...frame, progress } satisfies MapTrialReply, { transfer });
      },
      (message) => self.postMessage({ type: "notice", message } satisfies MapTrialReply),
    )
      .then((opened) => {
        runtime = opened;
        runtime.command({ type: "clock", playing: false, speed: GAME_SPEED });
      })
      .catch((error: unknown) => self.postMessage({ type: "error", message: String(error) } satisfies MapTrialReply));
  } else runtime?.command(data);
});
