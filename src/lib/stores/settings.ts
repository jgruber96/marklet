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

/** Text size steps for the editor and preview (View › Zoom In / Zoom Out). */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** The editor and preview sizes are multiplied by --zoom (lib/editor/theme.ts, styles/preview.css). */
export function applyZoom(zoom: number): void {
  document.documentElement.style.setProperty("--zoom", String(zoom));
}

export async function loadZoom(): Promise<number> {
  if (!isTauri()) return 1;
  const v = await (await settingsStore()).get("zoom");
  return typeof v === "number" && ZOOM_STEPS.includes(v) ? v : 1;
}

export async function saveZoom(zoom: number): Promise<void> {
  if (isTauri()) await (await settingsStore()).set("zoom", zoom);
}

/** How many files File › Open Recent remembers. */
export const RECENT_LIMIT = 10;

export async function loadRecent(): Promise<string[]> {
  if (!isTauri()) return [];
  const v = await (await settingsStore()).get("recent");
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string").slice(0, RECENT_LIMIT) : [];
}

/** Stores the list and refills the Open Recent menu. */
export async function saveRecent(files: string[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_recent_menu", { files });
  await (await settingsStore()).set("recent", files);
}

export const ACCENT_LABELS: Record<AccentSetting, string> = {
  blue: "Aurora",
  purple: "Purple",
  green: "Green",
  orange: "Orange",
  pink: "Pink",
  teal: "Teal",
};

/*
 * Fonts and line width (Settings › Text). Each choice is a CSS value set on
 * <html>, over the defaults in theme.css. Only the bundled fonts are certain
 * to exist; the others name fonts that ship with Windows or macOS and fall
 * back along their stack.
 */
export const EDITOR_FONTS = [
  { id: "jetbrains", label: "JetBrains Mono", css: '"JetBrains Mono", ui-monospace, "Cascadia Mono", Menlo, monospace' },
  { id: "cascadia", label: "Cascadia Mono", css: '"Cascadia Mono", "Cascadia Code", Consolas, Menlo, monospace' },
  { id: "consolas", label: "Consolas", css: 'Consolas, Menlo, "Courier New", monospace' },
  { id: "system", label: "System monospace", css: "ui-monospace, Menlo, Consolas, monospace" },
] as const;

export const TEXT_FONTS = [
  { id: "inter", label: "Inter", css: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: "system", label: "System", css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: "serif", label: "Serif (Georgia)", css: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
] as const;

export const TEXT_WIDTHS = [
  { id: "narrow", label: "Narrow", css: "680px" },
  { id: "medium", label: "Medium", css: "820px" },
  { id: "wide", label: "Wide", css: "1040px" },
  { id: "full", label: "Full width", css: "none" },
] as const;

export interface Look {
  editorFont: (typeof EDITOR_FONTS)[number]["id"];
  textFont: (typeof TEXT_FONTS)[number]["id"];
  textWidth: (typeof TEXT_WIDTHS)[number]["id"];
}

export const DEFAULT_LOOK: Look = { editorFont: "jetbrains", textFont: "inter", textWidth: "medium" };

const cssOf = <T extends { id: string; css: string }>(list: readonly T[], id: string) => (list.find((o) => o.id === id) ?? list[0]).css;

export function applyLook(look: Look): void {
  const style = document.documentElement.style;
  style.setProperty("--font-mono", cssOf(EDITOR_FONTS, look.editorFont));
  style.setProperty("--font-text", cssOf(TEXT_FONTS, look.textFont));
  style.setProperty("--text-width", cssOf(TEXT_WIDTHS, look.textWidth));
}

export async function loadLook(): Promise<Look> {
  if (!isTauri()) return DEFAULT_LOOK;
  const v = ((await (await settingsStore()).get("look")) ?? {}) as Partial<Record<keyof Look, unknown>>;
  const pick = <T extends { id: string }>(list: readonly T[], id: unknown, fallback: T["id"]) => (list.some((o) => o.id === id) ? (id as T["id"]) : fallback);
  return {
    editorFont: pick(EDITOR_FONTS, v.editorFont, DEFAULT_LOOK.editorFont),
    textFont: pick(TEXT_FONTS, v.textFont, DEFAULT_LOOK.textFont),
    textWidth: pick(TEXT_WIDTHS, v.textWidth, DEFAULT_LOOK.textWidth),
  };
}

export async function saveLook(look: Look): Promise<void> {
  if (isTauri()) await (await settingsStore()).set("look", look);
}
