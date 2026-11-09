/**
 * Native backend: Tauri IPC into the Rust media pipeline.
 *
 * Status: the transport is wired and proven (`rtc_backend_info` round-trips on
 * every target), but there is no media engine behind it yet. Spike B swaps the
 * Rust `Engine::Stub` for the LiveKit client crate; Spike C decides how remote
 * video frames reach this webview, which is what `videoTracks` will carry.
 *
 * Note what is NOT here: no `RTCPeerConnection` shim. The UI never sees one,
 * so the native side owes us domain methods, not a W3C API.
 */
import { invoke } from "@tauri-apps/api/core";

import { Emitter } from "./emitter";
import type {
  ConnectOptions,
  DeviceInfo,
  RtcCapabilities,
  RtcClient,
  RtcEvents,
  Unsubscribe,
} from "./types";

/** Mirrors `BackendInfo` in `src-tauri/src/rtc/mod.rs`. */
interface BackendInfo {
  engine: "stub" | "livekit-native";
  platform: string;
  arch: string;
  voiceReady: boolean;
  /** Present when the native stack is linked; describes what it reports. */
  engineDetail: string | null;
}

export class NativeRtcClient implements RtcClient {
  readonly backend = "native" as const;

  #emitter = new Emitter<RtcEvents>();
  #info: Promise<BackendInfo> | undefined;

  #backendInfo(): Promise<BackendInfo> {
    this.#info ??= invoke<BackendInfo>("rtc_backend_info");
    return this.#info;
  }

  async capabilities(): Promise<RtcCapabilities> {
    const info = await this.#backendInfo();
    if (!info.voiceReady) {
      const detail = info.engineDetail ? ` ${info.engineDetail}.` : "";
      return {
        voice: false,
        camera: false,
        screenShare: false,
        notes: `Native engine "${info.engine}" on ${info.platform}/${info.arch} — IPC is live, media pipeline pending (Spike B).${detail}`,
      };
    }
    return {
      voice: true,
      camera: true,
      screenShare: true,
      notes: `LiveKit native engine on ${info.platform}/${info.arch}.`,
    };
  }

  #unsupported(what: string): never {
    const error = {
      code: "unsupported" as const,
      message: `${what} needs the native media pipeline, which is not built yet.`,
    };
    this.#emitter.emit("error", error);
    throw new Error(error.message);
  }

  async connect(_options: ConnectOptions): Promise<void> {
    this.#unsupported("Joining a voice channel");
  }

  async disconnect(): Promise<void> {
    this.#emitter.emit("connectionState", "disconnected");
  }

  async setMicEnabled(_enabled: boolean): Promise<void> {
    this.#unsupported("The microphone");
  }

  async setCameraEnabled(_enabled: boolean): Promise<void> {
    this.#unsupported("The camera");
  }

  async setScreenShareEnabled(_enabled: boolean): Promise<void> {
    this.#unsupported("Screen sharing");
  }

  async listDevices(): Promise<DeviceInfo[]> {
    // Will be served by cpal's device enumeration, not navigator.mediaDevices.
    return [];
  }

  on<K extends keyof RtcEvents>(
    event: K,
    cb: (payload: RtcEvents[K]) => void,
  ): Unsubscribe {
    return this.#emitter.on(event, cb);
  }
}
