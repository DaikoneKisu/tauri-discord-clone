/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Injected by Tauri 2; absent in a plain browser. */
    isTauri?: boolean;
  }
}

export {};
