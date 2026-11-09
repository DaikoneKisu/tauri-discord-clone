/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** LiveKit Cloud development token server id. See .env.example. */
  readonly VITE_LIVEKIT_TOKEN_SERVER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    /** Injected by Tauri 2; absent in a plain browser. */
    isTauri?: boolean;
  }
}

export {};
