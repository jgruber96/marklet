import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settingsStore } from "../stores/settings";

/** What reopens on the next launch: the folder, its expanded subfolders, and saved tabs. */
export interface Session {
  workspace: string | null;
  expanded: string[];
  files: string[];
  /** Index into `files` of the tab that was in front. */
  active: number;
}

const emptySession: Session = { workspace: null, expanded: [], files: [], active: 0 };

const sessionKey = () => `session.${isTauri() ? getCurrentWindow().label : "main"}`;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : []);

export async function loadSession(): Promise<Session> {
  if (!isTauri()) return emptySession;
  const v = await (await settingsStore()).get<Partial<Session>>(sessionKey());
  if (!v || typeof v !== "object") return emptySession;
  return {
    workspace: typeof v.workspace === "string" ? v.workspace : null,
    expanded: strings(v.expanded),
    files: strings(v.files),
    active: typeof v.active === "number" ? v.active : 0,
  };
}

export async function saveSession(session: Session): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set(sessionKey(), session);
}
