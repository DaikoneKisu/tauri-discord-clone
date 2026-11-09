import { channels, guilds } from "./mockData";
import { VoicePanel } from "./VoicePanel";

interface Props {
  guildId: string;
  selectedChannel: string;
  onSelectChannel: (id: string) => void;
}

const categories = ["Texto", "Voz"] as const;

export function ChannelSidebar({
  guildId,
  selectedChannel,
  onSelectChannel,
}: Props) {
  const guild = guilds.find((g) => g.id === guildId);

  // Joining is scoped to a voice channel. If the user is browsing a text
  // channel, offer the first voice one rather than nothing at all.
  const selected = channels.find((c) => c.id === selectedChannel);
  const voiceChannel =
    selected?.kind === "voice"
      ? selected.name
      : (channels.find((c) => c.kind === "voice")?.name ?? "General");

  return (
    <div className="sidebar">
      <header className="sidebar__header">{guild?.name ?? "Servidor"}</header>

      <div className="sidebar__scroll">
        {categories.map((category) => (
          <section key={category} className="category">
            <h2 className="category__title">{category}</h2>
            {channels
              .filter((c) => c.category === category)
              .map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={`channel${
                    channel.id === selectedChannel ? " is-active" : ""
                  }`}
                  onClick={() => onSelectChannel(channel.id)}
                >
                  <span className="channel__glyph" aria-hidden="true">
                    {channel.kind === "voice" ? "🔊" : "#"}
                  </span>
                  <span className="channel__name">{channel.name}</span>
                </button>
              ))}
          </section>
        ))}
      </div>

      <VoicePanel channel={voiceChannel} />
    </div>
  );
}
