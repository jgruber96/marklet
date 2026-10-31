import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";

export type ThemeSetting = "system" | "light" | "dark";
export const isThemeSetting = (v: unknown): v is ThemeSetting => v === "system" || v === "light" || v === "dark";

// Mirror of the theme in localStorage so it can be applied before first paint;
// settings.json (tauri-plugin-store) stays the source of truth.
const THEME_CACHE_KEY = "nova-md:theme";

let store: Promise<Store> | null = null;
const settingsStore = () => (store ??= load("settings.json", { defaults: { theme: "system" }, autoSave: 200 }));

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

export type ViewMode = "editor" | "split" | "preview";
const isViewMode = (v: unknown): v is ViewMode => v === "editor" || v === "split" || v === "preview";

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
  if (isTauri()) await invoke("sync_theme_menu", { theme });
}
