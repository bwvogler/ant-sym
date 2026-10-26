import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins()],
  // Fixed port, strict so a second instance fails loudly instead of serving a
  // twin on the next port. 38500 = Jev Ants; Lingo Dojo is 38400, Atlas 38300,
  // Wine Guide 38200, Basecamp 38100. Polling watcher: macOS FSEvents delivery
  // is unreliable on this machine and silently kills HMR.
  server: { port: 38500, strictPort: true, watch: { usePolling: true, interval: 300 } },
});
