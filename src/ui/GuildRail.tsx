import { guilds } from "./mockData";

interface Props {
  selected: string;
  onSelect: (id: string) => void;
}

export function GuildRail({ selected, onSelect }: Props) {
  return (
    <nav className="guild-rail" aria-label="Servidores">
      {guilds.map((guild) => (
        <button
          key={guild.id}
          type="button"
          className={`guild${guild.id === selected ? " is-active" : ""}`}
          onClick={() => onSelect(guild.id)}
          title={guild.name}
          aria-current={guild.id === selected}
        >
          {guild.initials}
        </button>
      ))}
      <button type="button" className="guild guild--add" title="Añadir servidor">
        +
      </button>
    </nav>
  );
}
