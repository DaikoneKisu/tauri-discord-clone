import { channels, messages } from "./mockData";

interface Props {
  channelId: string;
  onToggleSidebar: () => void;
}

export function ChatPanel({ channelId, onToggleSidebar }: Props) {
  const channel = channels.find((c) => c.id === channelId);
  const isVoice = channel?.kind === "voice";

  return (
    <main className="chat">
      <header className="chat__header">
        <button
          type="button"
          className="chat__drawer-toggle"
          onClick={onToggleSidebar}
          aria-label="Mostrar canales"
        >
          ☰
        </button>
        <span className="chat__glyph" aria-hidden="true">
          {isVoice ? "🔊" : "#"}
        </span>
        <h1 className="chat__title">{channel?.name ?? "general"}</h1>
      </header>

      {isVoice ? (
        <div className="chat__empty">
          <p>
            Canal de voz <strong>{channel?.name}</strong>.
          </p>
          <p className="chat__empty-hint">
            Conéctate desde el panel inferior. El media no pasa por el webview
            en los targets nativos.
          </p>
        </div>
      ) : (
        <ol className="messages">
          {messages.map((message) => (
            <li key={message.id} className="message">
              <div className="message__avatar" aria-hidden="true">
                {message.initials}
              </div>
              <div className="message__body">
                <p className="message__meta">
                  <span className="message__author">{message.author}</span>
                  <time className="message__at">{message.at}</time>
                </p>
                <p className="message__text">{message.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          className="composer__input"
          placeholder={`Enviar mensaje a #${channel?.name ?? "general"}`}
          aria-label="Mensaje"
        />
      </form>
    </main>
  );
}
