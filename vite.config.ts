import process from "node:process";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [svelte()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Frontend output lives in build/ — dist/ is reserved for the portable
    // staging folder (dist/Oups), so the two never wipe each other.
    outDir: "build",
    rollupOptions: {
      input: {
        main: "index.html",
        popup: "popup.html",
        editor: "editor.html",
        settings: "settings.html",
      },
    },
  },
}));
