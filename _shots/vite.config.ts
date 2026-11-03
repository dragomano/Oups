// Vite config for the capture harness: the project root, but with the Tauri
// bridge aliased to the stubs in ./stubs. Never used by the app itself.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, ".."),
  plugins: [svelte()],
  clearScreen: false,
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: resolve(here, "stubs/core.ts") },
      { find: /^@tauri-apps\/api\/event$/, replacement: resolve(here, "stubs/event.ts") },
      {
        find: /^@tauri-apps\/api\/webviewWindow$/,
        replacement: resolve(here, "stubs/webviewWindow.ts"),
      },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: resolve(here, "stubs/dialog.ts") },
    ],
  },
  server: { port: 1430, strictPort: true, host: "127.0.0.1" },
});
