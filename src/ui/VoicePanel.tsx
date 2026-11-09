import { useEffect, useState } from "react";

import { getRtcClient, type RtcCapabilities, type RtcClient } from "../rtc";

type Toggle = "mic" | "camera" | "screen";

const labels: Record<Toggle, { on: string; off: string; glyph: string }> = {
  mic: { on: "Silenciar micro", off: "Activar micro", glyph: "🎙" },
  camera: { on: "Apagar cámara", off: "Encender cámara", glyph: "📹" },
  screen: { on: "Dejar de compartir", off: "Compartir pantalla", glyph: "🖥" },
};

/**
 * Doubles as the cross-platform smoke test: it renders whatever the active
 * backend reports it can do, so running the same build on Windows, Linux,
 * Android or the browser immediately shows which pieces are live.
 */
export function VoicePanel() {
  const [client, setClient] = useState<RtcClient | null>(null);
  const [caps, setCaps] = useState<RtcCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Record<Toggle, boolean>>({
    mic: false,
    camera: false,
    screen: false,
  });

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const rtc = await getRtcClient();
        if (!alive) return;
        setClient(rtc);
        unsubscribe = rtc.on("error", (rtcError) => setError(rtcError.message));

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
      unsubscribe?.();
    };
  }, []);

  const supported: Record<Toggle, boolean> = {
    mic: caps?.voice ?? false,
    camera: caps?.camera ?? false,
    screen: caps?.screenShare ?? false,
  };

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
      // The client already emitted a structured error; the listener shows it.
    }
  }

  return (
    <section className="voice" aria-label="Estado de voz">
      <div className="voice__status">
        <span className={`voice__dot voice__dot--${caps ? "idle" : "pending"}`} />
        <div className="voice__text">
          <p className="voice__backend">
            backend: <code>{client?.backend ?? "…"}</code>
          </p>
          <p className="voice__notes">{caps?.notes ?? "Consultando backend…"}</p>
        </div>
      </div>

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
                  : "No disponible en este backend"
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
