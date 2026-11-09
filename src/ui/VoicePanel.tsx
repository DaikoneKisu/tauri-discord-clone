import { useEffect, useState } from "react";

import {
  getRtcClient,
  type ConnectionState,
  type Participant,
  type RtcCapabilities,
  type RtcClient,
} from "../rtc";

type Toggle = "mic" | "camera" | "screen";

const labels: Record<Toggle, { on: string; off: string; glyph: string }> = {
  mic: { on: "Silenciar micro", off: "Activar micro", glyph: "🎙" },
  camera: { on: "Apagar cámara", off: "Encender cámara", glyph: "📹" },
  screen: { on: "Dejar de compartir", off: "Compartir pantalla", glyph: "🖥" },
};

const stateLabels: Record<ConnectionState, string> = {
  disconnected: "Desconectado",
  connecting: "Conectando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
};

interface Props {
  /** Voice channel the user would join. */
  channel: string;
}

/**
 * Doubles as the cross-platform smoke test: it renders whatever the active
 * backend reports it can do, so running the same build on Windows, Linux,
 * Android or the browser immediately shows which pieces are live.
 */
export function VoicePanel({ channel }: Props) {
  const [client, setClient] = useState<RtcClient | null>(null);
  const [caps, setCaps] = useState<RtcCapabilities | null>(null);
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Record<Toggle, boolean>>({
    mic: false,
    camera: false,
    screen: false,
  });

  useEffect(() => {
    let alive = true;
    const off: Array<() => void> = [];

    void (async () => {
      try {
        const rtc = await getRtcClient();
        if (!alive) return;
        setClient(rtc);
        off.push(rtc.on("error", (e) => setError(e.message)));
        off.push(rtc.on("connectionState", setState));
        off.push(rtc.on("participants", setParticipants));

        const value = await rtc.capabilities();
        if (alive) setCaps(value);
      } catch (cause) {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();

    return () => {
      alive = false;
      for (const unsubscribe of off) unsubscribe();
    };
  }, []);

  const connected = state === "connected";

  const supported: Record<Toggle, boolean> = {
    mic: (caps?.voice ?? false) && connected,
    camera: (caps?.camera ?? false) && connected,
    screen: (caps?.screenShare ?? false) && connected,
  };

  async function toggleConnection() {
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      if (connected) {
        await client.disconnect();
        setActive({ mic: false, camera: false, screen: false });
      } else {
        await client.connect({
          channel,
          // Placeholder until there are accounts.
          displayName: `invitado-${Math.floor(Math.random() * 1000)}`,
        });
      }
    } catch {
      // The client emitted a structured error; the listener renders it.
    } finally {
      setBusy(false);
    }
  }

  async function toggle(kind: Toggle) {
    if (!client) return;
    const next = !active[kind];
    setError(null);
    try {
      if (kind === "mic") await client.setMicEnabled(next);
      if (kind === "camera") await client.setCameraEnabled(next);
      if (kind === "screen") await client.setScreenShareEnabled(next);
      setActive((prev) => ({ ...prev, [kind]: next }));
    } catch {
      // Same as above.
    }
  }

  return (
    <section className="voice" aria-label="Estado de voz">
      <div className="voice__status">
        <span
          className={`voice__dot voice__dot--${
            connected ? "live" : caps ? "idle" : "pending"
          }`}
        />
        <div className="voice__text">
          <p className="voice__backend">
            {stateLabels[state]} · <code>{client?.backend ?? "…"}</code>
          </p>
          <p className="voice__notes">{caps?.notes ?? "Consultando backend…"}</p>
        </div>
      </div>

      {participants.length > 0 && (
        <ul className="voice__participants">
          {participants.map((p) => (
            <li
              key={p.id}
              className={`voice__participant${p.speaking ? " is-speaking" : ""}`}
            >
              <span className="voice__participant-name">{p.name}</span>
              {!p.micEnabled && (
                <span className="voice__muted" title="Silenciado">
                  🔇
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`voice__join${connected ? " is-connected" : ""}`}
        onClick={() => void toggleConnection()}
        disabled={!caps?.voice || busy}
        title={
          caps?.voice
            ? connected
              ? "Salir del canal"
              : `Unirse a ${channel}`
            : "Este backend no puede conectarse todavía"
        }
      >
        {connected ? "Desconectar" : `Unirse a ${channel}`}
      </button>

      <div className="voice__controls">
        {(Object.keys(labels) as Toggle[]).map((kind) => {
          const label = labels[kind];
          const isActive = active[kind];
          return (
            <button
              key={kind}
              type="button"
              className={`voice__btn${isActive ? " is-active" : ""}`}
              disabled={!supported[kind]}
              onClick={() => void toggle(kind)}
              title={
                supported[kind]
                  ? isActive
                    ? label.on
                    : label.off
                  : connected
                    ? "No disponible en este backend"
                    : "Conéctate primero"
              }
              aria-pressed={isActive}
            >
              <span aria-hidden="true">{label.glyph}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="voice__error">{error}</p>}
    </section>
  );
}
