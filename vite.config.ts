import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set by `tauri android dev` / `tauri ios dev` so the emulator or a physical
// device can reach this machine's dev server. Unset for desktop and web.
const host = process.env.TAURI_DEV_HOST;

// Tauri sets TAURI_ENV_PLATFORM during its builds. When it's absent we're
// building the plain web target and can assume a current browser.
const platform = process.env.TAURI_ENV_PLATFORM;
const buildTarget =
  platform === undefined
    ? "es2022"
    : platform === "windows"
      ? "chrome105"
      : "safari13";

// GitHub Pages serves project sites from a subpath, so assets must be
// requested as /tauri-discord-clone/assets/… there. Every other build — Tauri
// on all five native targets, and `pnpm dev` — serves from the root.
const base = process.env.PAGES_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],

  // Tauri's CLI owns the terminal output; don't let Vite wipe it.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    // Spread rather than assign `undefined`: exactOptionalPropertyTypes is on.
    ...(host ? { hmr: { protocol: "ws", host, port: 1421 } } : {}),
    watch: {
      // Rust rebuilds are driven by cargo, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_ENV_*"],

  build: {
    target: buildTarget,
    // Vite 8 minifies with oxc by default; esbuild is no longer bundled.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
