import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import {
  ACCENTS,
  ACCENT_LABELS,
  EDITOR_FONTS,
  TEXT_FONTS,
  TEXT_WIDTHS,
  ZOOM_STEPS,
  type AccentSetting,
  type Look,
  type ThemeSetting,
} from "../lib/stores/settings";

export interface SettingsValues {
  theme: ThemeSetting;
  accent: AccentSetting;
  look: Look;
  zoom: number;
  autosave: boolean;
  spellCheck: boolean;
}

interface SettingsDialogProps {
  values: SettingsValues;
  onTheme(theme: ThemeSetting): void;
  onAccent(accent: AccentSetting): void;
  onLook(look: Look): void;
  onZoom(zoom: number): void;
  onAutosave(on: boolean): void;
  onSpellCheck(on: boolean): void;
  onCheckUpdates(): void;
  onClose(): void;
}

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Settings, as a dialog over the window. Every change applies and saves at once; there is no OK button. */
export function SettingsDialog({ values, onClose, ...on }: SettingsDialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button, select, input")?.focus();
    if (isTauri()) void getVersion().then(setVersion, () => {});
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      return onClose();
    }
    if (e.key !== "Tab") return;
    // Keep Tab inside the dialog.
    const stops = [...(dialog.current?.querySelectorAll<HTMLElement>("button, select, input") ?? [])];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  const { look } = values;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={onKeyDown}>
        <header className="modal-head">
          <h1 id="settings-title">Settings</h1>
          <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <Group title="Appearance">
            <Row label="Theme">
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map(({ value, label }) => (
                  <button key={value} className={value === values.theme ? "active" : undefined} aria-pressed={value === values.theme} onClick={() => on.onTheme(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Accent">
              <div className="swatches" role="group" aria-label="Accent">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    className={`swatch${accent === values.accent ? " active" : ""}`}
                    data-accent={accent}
                    aria-label={ACCENT_LABELS[accent]}
                    aria-pressed={accent === values.accent}
                    title={ACCENT_LABELS[accent]}
                    onClick={() => on.onAccent(accent)}
                  />
                ))}
              </div>
            </Row>
          </Group>

          <Group title="Text">
            <Row label="Editor font" hint="The Markdown source">
              <Select value={look.editorFont} options={EDITOR_FONTS} onChange={(editorFont) => on.onLook({ ...look, editorFont })} label="Editor font" />
            </Row>
            <Row label="Reading font" hint="Preview and Rich view">
              <Select value={look.textFont} options={TEXT_FONTS} onChange={(textFont) => on.onLook({ ...look, textFont })} label="Reading font" />
            </Row>
            <Row label="Text size">
              <Select
                value={String(values.zoom)}
                options={ZOOM_STEPS.map((z) => ({ id: String(z), label: `${Math.round(z * 100)}%` }))}
                onChange={(z) => on.onZoom(Number(z))}
                label="Text size"
              />
            </Row>
            <Row label="Line width" hint="Preview and Rich view">
              <Select value={look.textWidth} options={TEXT_WIDTHS} onChange={(textWidth) => on.onLook({ ...look, textWidth })} label="Line width" />
            </Row>
          </Group>

          <Group title="Editing">
            <Row label="Autosave" hint="Saves 2 seconds after you stop typing">
              <Switch on={values.autosave} onChange={on.onAutosave} label="Autosave" />
            </Row>
            <Row label="Spell check" hint="Underlines misspellings in the editor">
              <Switch on={values.spellCheck} onChange={on.onSpellCheck} label="Spell check" />
            </Row>
          </Group>

          <Group title="About">
            <Row label={`Marklet${version ? ` ${version}` : ""}`} hint="Updates are checked at startup">
              <button className="btn" onClick={on.onCheckUpdates}>
                Check for Updates
              </button>
            </Row>
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

function Select<T extends string>(props: { value: T; options: readonly { id: T; label: string }[]; onChange(value: T): void; label: string }) {
  return (
    <select className="select" aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange(on: boolean): void; label: string }) {
  return <button className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}
