/**
 * The one RTC surface the UI is allowed to touch.
 *
 * This interface — not `RTCPeerConnection` — is the JS/Rust boundary. The web
 * build fulfils it with `livekit-client` on top of the browser's WebRTC; the
 * native builds fulfil it with Tauri IPC into a Rust pipeline, because the
 * webview cannot do the job on every target we ship:
 *
 *   - WebKitGTK (Linux) is built without ENABLE_WEB_RTC on Ubuntu, so
 *     `RTCPeerConnection` is undefined there.
 *   - WKWebView (macOS, iOS) has no `getDisplayMedia` at all, so screen
 *     sharing must be captured natively.
 *
 * Keeping the boundary at this level — rather than polyfilling browser APIs —
 * means we reimplement a handful of domain methods instead of a sprawling
 * W3C spec.
 */
import type { Unsubscribe } from "./emitter";

export type { Unsubscribe };

export type RtcBackend = "web" | "native";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type TrackKind = "camera" | "screen";

export interface Participant {
  /** Stable identity assigned by the signalling server. */
  id: string;
  name: string;
  isLocal: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  speaking: boolean;
}

/**
 * A video stream ready to be painted.
 *
 * `attach` is deliberately element-agnostic: the web backend hands the track
 * to a `<video>`, while the native backend will paint frames into a
 * `<canvas>` because the pixels arrive over IPC rather than as a MediaStream.
 * Spike C decides which transport backs this on each platform.
 */
export interface VideoTrackRef {
  participantId: string;
  kind: TrackKind;
  attach(element: HTMLElement): void;
  detach(): void;
}

export interface DeviceInfo {
  id: string;
  label: string;
  kind: "audioinput" | "audiooutput" | "videoinput";
}

/**
 * What this backend can actually do right now.
 *
 * The UI reads this instead of sniffing the platform, so a target that gains
 * (or loses) a capability needs no changes outside its own backend.
 */
export interface RtcCapabilities {
  voice: boolean;
  camera: boolean;
  screenShare: boolean;
  /** Human-readable reason shown when something above is false. */
  notes: string;
}

export interface ConnectOptions {
  /** LiveKit server URL, e.g. ws://127.0.0.1:7880 */
  url: string;
  /** Short-lived access token minted by our backend. */
  token: string;
}

export interface RtcError {
  code: "connect-failed" | "device-denied" | "unsupported" | "internal";
  message: string;
}

export interface RtcEvents extends Record<string, unknown> {
  connectionState: ConnectionState;
  participants: Participant[];
  videoTracks: VideoTrackRef[];
  error: RtcError;
}

export interface RtcClient {
  readonly backend: RtcBackend;

  capabilities(): Promise<RtcCapabilities>;

  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  setMicEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  setScreenShareEnabled(enabled: boolean): Promise<void>;

  listDevices(): Promise<DeviceInfo[]>;

  on<K extends keyof RtcEvents>(
    event: K,
    cb: (payload: RtcEvents[K]) => void,
  ): Unsubscribe;
}
