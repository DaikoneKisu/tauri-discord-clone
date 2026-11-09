import { useState } from "react";

import { ChannelSidebar } from "./ui/ChannelSidebar";
import { ChatPanel } from "./ui/ChatPanel";
import { GuildRail } from "./ui/GuildRail";

export function App() {
  const [guildId, setGuildId] = useState("g1");
  const [channelId, setChannelId] = useState("c1");
  // Only meaningful on narrow viewports, where the rail and sidebar collapse
  // into a drawer. Desktop ignores it via CSS.
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={`app${drawerOpen ? " is-drawer-open" : ""}`}>
      <div className="app__nav">
        <GuildRail selected={guildId} onSelect={setGuildId} />
        <ChannelSidebar
          guildId={guildId}
          selectedChannel={channelId}
          onSelectChannel={(id) => {
            setChannelId(id);
            setDrawerOpen(false);
          }}
        />
      </div>

      <button
        type="button"
        className="app__scrim"
        aria-label="Cerrar canales"
        onClick={() => setDrawerOpen(false)}
      />

      <ChatPanel
        channelId={channelId}
        onToggleSidebar={() => setDrawerOpen((open) => !open)}
      />
    </div>
  );
}
