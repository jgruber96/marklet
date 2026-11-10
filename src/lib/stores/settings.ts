import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";

export type ThemeSetting = "system" | "light" | "dark";
export const isThemeSetting = (v: unknown): v is ThemeSetting => v === "system" || v === "light" || v === "dark";

// Mirror of the theme in localStorage so it can be applied before first paint;
// settings.json (tauri-plugin-store) stays the source of truth.
const THEME_CACHE_KEY = "marklet:theme";
const ACCENT_CACHE_KEY = "marklet:accent";

let store: Promise<Store> | null = null;
export const settingsStore = () => (store ??= load("settings.json", { defaults: { theme: "system", accent: "blue", autosave: true, spellcheck: true }, autoSave: 200 }));

/** Applies the theme to the page and the native window chrome. */
export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Cache only; the store still has it.
  }
  if (isTauri()) void getCurrentWindow().setTheme(theme === "system" ? null : theme);
}

/** Synchronous best guess for first paint. */
export function cachedTheme(): ThemeSetting {
  try {
    const v = localStorage.getItem(THEME_CACHE_KEY);
    if (isThemeSetting(v)) return v;
  } catch {
    // Fall through to the default.
  }
  return "system";
}

export async function loadTheme(): Promise<ThemeSetting> {
  if (!isTauri()) return cachedTheme();
  const v = await (await settingsStore()).get("theme");
  return isThemeSetting(v) ? v : "system";
}

export async function saveTheme(theme: ThemeSetting): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set("theme", theme);
}

export type ViewMode = "editor" | "split" | "preview" | "rich";
export const isViewMode = (v: unknown): v is ViewMode => v === "editor" || v === "split" || v === "preview" || v === "rich";

// Remembered per window, keyed by window label.
const viewModeKey = () => `viewMode.${isTauri() ? getCurrentWindow().label : "main"}`;

export async function loadViewMode(): Promise<ViewMode> {
  if (!isTauri()) return "split";
  const v = await (await settingsStore()).get(viewModeKey());
  return isViewMode(v) ? v : "split";
}

export async function saveViewMode(mode: ViewMode): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set(viewModeKey(), mode);
}

/** Ticks the matching item in Settings › Theme. */
export async function syncThemeMenu(theme: ThemeSetting): Promise<void> {
  await checkMenuGroup("theme", theme);
}

/** Writes pending changes now instead of after the auto-save delay (used on quit). */
export async function flushSettings(): Promise<void> {
  if (isTauri()) await (await settingsStore()).save();
}

/** Save after 2 seconds without typing; on by default. */
export async function loadAutosave(): Promise<boolean> {
  if (!isTauri()) return true;
  return (await (await settingsStore()).get("autosave")) !== false;
}

export async function saveAutosave(on: boolean): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set("autosave", on);
}

/** Spell check in the editor; on by default. */
export async function loadSpellCheck(): Promise<boolean> {
  if (!isTauri()) return true;
  return (await (await settingsStore()).get("spellcheck")) !== false;
}

export async function saveSpellCheck(on: boolean): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set("spellcheck", on);
}

/** Ticks or unticks a native check menu item, such as Settings › Autosave. */
export async function setMenuChecked(id: string, checked: boolean): Promise<void> {
  if (isTauri()) await invoke("set_menu_checked", { id, checked });
}

/** Accent presets; the values live in theme.css. The default is stored as "blue" (the first version's default) and shown as Aurora. */
export const ACCENTS = ["blue", "purple", "green", "orange", "pink", "teal"] as const;
export type AccentSetting = (typeof ACCENTS)[number];
export const isAccentSetting = (v: unknown): v is AccentSetting => ACCENTS.includes(v as AccentSetting);

export function applyAccent(accent: AccentSetting): void {
  const root = document.documentElement;
  if (accent === "blue") delete root.dataset.accent;
  else root.dataset.accent = accent;
  try {
    localStorage.setItem(ACCENT_CACHE_KEY, accent);
  } catch {
    // Cache only; the store still has it.
  }
}

/** Synchronous best guess for first paint. */
export function cachedAccent(): AccentSetting {
  try {
    const v = localStorage.getItem(ACCENT_CACHE_KEY);
    if (isAccentSetting(v)) return v;
  } catch {
    // Fall through to the default.
  }
  return "blue";
}

export async function loadAccent(): Promise<AccentSetting> {
  if (!isTauri()) return cachedAccent();
  const v = await (await settingsStore()).get("accent");
  return isAccentSetting(v) ? v : "blue";
}

export async function saveAccent(accent: AccentSetting): Promise<void> {
  if (!isTauri()) return;
  await (await settingsStore()).set("accent", accent);
}

/** Ticks one item of a radio-style menu group such as `accent:*`. */
export async function checkMenuGroup(group: string, value: string): Promise<void> {
  if (isTauri()) await invoke("check_menu_group", { group, value });
}
