import type { RtcClient } from "./types";

export * from "./types";

/**
 * Tauri 2 defines `window.isTauri`, which is the one signal that distinguishes
 * a webview-hosted build from the plain web build at runtime. Both bundles are
 * identical otherwise — the web target is just `vite build` with no Rust.
 */
function isTauri(): boolean {
  return typeof window !== "undefined" && window.isTauri === true;
}

let pending: Promise<RtcClient> | undefined;

/**
 * The process-wide RTC client, picked once for the host we're running on.
 *
 * The backends are imported dynamically so each target ships only its own:
 * native builds never download `livekit-client` (~200 kB gzipped), and the web
 * build never loads the Tauri API, which would throw outside a webview.
 */
export function getRtcClient(): Promise<RtcClient> {
  pending ??= isTauri()
    ? import("./native").then((m) => new m.NativeRtcClient())
    : import("./web").then((m) => new m.WebRtcClient());
  return pending;
}
