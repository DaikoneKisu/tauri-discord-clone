/**
 * Browser backend: `livekit-client` over the webview's own WebRTC stack.
 *
 * Used for the `web` target, and usable as a comparison baseline on Windows
 * and Android where the webview is Chromium. It is NOT viable as the only
 * backend — see the note in `types.ts`.
 */
import {
  ConnectionState as LKConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant as LKParticipant,
  type TrackPublication,
} from "livekit-client";

import { Emitter } from "./emitter";
import type {
  ConnectOptions,
  ConnectionState,
  DeviceInfo,
  Participant,
  RtcCapabilities,
  RtcClient,
  RtcEvents,
  TrackKind,
  Unsubscribe,
  VideoTrackRef,
} from "./types";

function mapState(state: LKConnectionState): ConnectionState {
  switch (state) {
    case LKConnectionState.Connected:
      return "connected";
    case LKConnectionState.Connecting:
      return "connecting";
    case LKConnectionState.Reconnecting:
    case LKConnectionState.SignalReconnecting:
      return "reconnecting";
    case LKConnectionState.Disconnected:
      return "disconnected";
  }
}

function mapParticipant(p: LKParticipant, isLocal: boolean): Participant {
  return {
    id: p.identity,
    name: p.name || p.identity,
    isLocal,
    micEnabled: p.isMicrophoneEnabled,
    cameraEnabled: p.isCameraEnabled,
    screenShareEnabled: p.isScreenShareEnabled,
    speaking: p.isSpeaking,
  };
}

function toTrackRef(
  participantId: string,
  kind: TrackKind,
  publication: TrackPublication | undefined,
): VideoTrackRef | undefined {
  const track = publication?.track;
  if (!track) return undefined;
  return {
    participantId,
    kind,
    attach(element) {
      if (element instanceof HTMLMediaElement) track.attach(element);
    },
    detach() {
      track.detach();
    },
  };
}

export class WebRtcClient implements RtcClient {
  readonly backend = "web" as const;

  #room = new Room({ adaptiveStream: true, dynacast: true });
  #emitter = new Emitter<RtcEvents>();

  constructor() {
    this.#wireRoomEvents();
  }

  #wireRoomEvents(): void {
    const resync = () => this.#publishSnapshot();

    this.#room
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        this.#emitter.emit("connectionState", mapState(state));
        resync();
      })
      .on(RoomEvent.ParticipantConnected, resync)
      .on(RoomEvent.ParticipantDisconnected, resync)
      .on(RoomEvent.ActiveSpeakersChanged, resync)
      .on(RoomEvent.TrackSubscribed, resync)
      .on(RoomEvent.TrackUnsubscribed, resync)
      .on(RoomEvent.TrackMuted, resync)
      .on(RoomEvent.TrackUnmuted, resync)
      .on(RoomEvent.LocalTrackPublished, resync)
      .on(RoomEvent.LocalTrackUnpublished, resync)
      .on(RoomEvent.Disconnected, resync);
  }

  /**
   * Recomputes the whole roster on any change rather than patching it
   * incrementally. Rooms are small enough that the simplicity wins.
   */
  #publishSnapshot(): void {
    const everyone: Array<[LKParticipant, boolean]> = [
      [this.#room.localParticipant, true],
      ...[...this.#room.remoteParticipants.values()].map(
        (p) => [p, false] as [LKParticipant, boolean],
      ),
    ];

    this.#emitter.emit(
      "participants",
      everyone.map(([p, isLocal]) => mapParticipant(p, isLocal)),
    );

    const tracks: VideoTrackRef[] = [];
    for (const [p] of everyone) {
      const camera = toTrackRef(
        p.identity,
        "camera",
        p.getTrackPublication(Track.Source.Camera),
      );
      if (camera) tracks.push(camera);

      const screen = toTrackRef(
        p.identity,
        "screen",
        p.getTrackPublication(Track.Source.ScreenShare),
      );
      if (screen) tracks.push(screen);
    }
    this.#emitter.emit("videoTracks", tracks);
  }

  async capabilities(): Promise<RtcCapabilities> {
    const hasPeerConnection = typeof RTCPeerConnection !== "undefined";
    const hasGetDisplayMedia =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function";

    return {
      voice: hasPeerConnection,
      camera: hasPeerConnection,
      screenShare: hasPeerConnection && hasGetDisplayMedia,
      notes: hasPeerConnection
        ? hasGetDisplayMedia
          ? "Browser WebRTC."
          : "Browser WebRTC; this engine has no getDisplayMedia, so screen sharing is off."
        : "This webview has no RTCPeerConnection. Expected on WebKitGTK — the native backend covers it.",
    };
  }

  async connect({ url, token }: ConnectOptions): Promise<void> {
    try {
      await this.#room.connect(url, token);
      this.#publishSnapshot();
    } catch (cause) {
      this.#emitter.emit("error", {
        code: "connect-failed",
        message: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }

  async disconnect(): Promise<void> {
    await this.#room.disconnect();
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    await this.#withDeviceErrors(() =>
      this.#room.localParticipant.setMicrophoneEnabled(enabled),
    );
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.#withDeviceErrors(() =>
      this.#room.localParticipant.setCameraEnabled(enabled),
    );
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    await this.#withDeviceErrors(() =>
      this.#room.localParticipant.setScreenShareEnabled(enabled),
    );
  }

  async #withDeviceErrors(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (cause) {
      this.#emitter.emit("error", {
        code: "device-denied",
        message: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }

  async listDevices(): Promise<DeviceInfo[]> {
    const devices = await Room.getLocalDevices();
    return devices
      .filter((d): d is MediaDeviceInfo => d.kind !== undefined)
      .map((d) => ({
        id: d.deviceId,
        label: d.label || d.deviceId,
        kind: d.kind as DeviceInfo["kind"],
      }));
  }

  on<K extends keyof RtcEvents>(
    event: K,
    cb: (payload: RtcEvents[K]) => void,
  ): Unsubscribe {
    return this.#emitter.on(event, cb);
  }
}
