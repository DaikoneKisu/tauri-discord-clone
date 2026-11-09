/** Placeholder content so the shell has something to lay out. No network. */

export interface Guild {
  id: string;
  name: string;
  initials: string;
}

export interface Channel {
  id: string;
  name: string;
  kind: "text" | "voice";
  category: string;
}

export interface Message {
  id: string;
  author: string;
  initials: string;
  at: string;
  body: string;
}

export const guilds: Guild[] = [
  { id: "g1", name: "Harmony Dev", initials: "HD" },
  { id: "g2", name: "Rust ES", initials: "RS" },
  { id: "g3", name: "Tauri", initials: "TA" },
];

export const channels: Channel[] = [
  { id: "c1", name: "general", kind: "text", category: "Texto" },
  { id: "c2", name: "webrtc", kind: "text", category: "Texto" },
  { id: "c3", name: "builds", kind: "text", category: "Texto" },
  { id: "v1", name: "General", kind: "voice", category: "Voz" },
  { id: "v2", name: "Pair programming", kind: "voice", category: "Voz" },
];

export const messages: Message[] = [
  {
    id: "m1",
    author: "eduardo",
    initials: "ED",
    at: "hoy a las 14:02",
    body: "Scaffold levantado. Seis targets desde una sola UI.",
  },
  {
    id: "m2",
    author: "claude",
    initials: "CL",
    at: "hoy a las 14:03",
    body: "El panel de voz de abajo reporta lo que el backend puede hacer en esta plataforma. En web usa livekit-client; dentro de Tauri habla por IPC con Rust.",
  },
  {
    id: "m3",
    author: "eduardo",
    initials: "ED",
    at: "hoy a las 14:05",
    body: "Siguiente: Spike A, levantar livekit-server en docker y conectar dos pestañas.",
  },
];
