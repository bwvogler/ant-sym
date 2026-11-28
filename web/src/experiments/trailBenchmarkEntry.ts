import { runTrailBenchmark, type TrailBenchmarkMessage } from "./trailBenchmark.ts";

const send = (message: TrailBenchmarkMessage) => self.postMessage(message);
void runTrailBenchmark((pairs) => send({ type: "progress", pairs })).then(
  (result) => send({ type: "result", result }),
  (error: unknown) => send({ type: "error", message: error instanceof Error ? error.message : String(error) }),
);
