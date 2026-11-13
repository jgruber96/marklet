import {
  Bold,
  ChevronDown,
  Code,
  Download,
  FileText,
  FolderOpen,
  Heading,
  Italic,
  Link,
  List,
  Menu as MenuIcon,
  SquarePen,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { showMenu, type MenuItem } from "./PopupMenu";
import appIcon from "../assets/icon.svg";
import { appleKeys, isDesktop, isMacOS } from "../lib/platform";
import type { ViewMode } from "../lib/stores/settings";
import type { ExportKind } from "../lib/export/export";
import type { FormatKind } from "../lib/editor/format";

interface ToolbarProps {
  /** The app menu (File, Edit, View, Settings), built when it is opened. */
  menu(): MenuItem[];
  /** The open file's name and whether it has unsaved changes, for the title in the bar. */
  title: string;
  dirty: boolean;
  viewMode: ViewMode;
  onViewMode(mode: ViewMode): void;
  onNew(): void;
  onOpen(): void;
  onOpenFolder(): void;
  onFormat(kind: FormatKind): void;
  onExport(kind: ExportKind): void;
}

const viewModes: { mode: ViewMode; label: string }[] = [
  { mode: "editor", label: "Editor" },
  { mode: "split", label: "Split" },
  { mode: "preview", label: "Preview" },
  { mode: "rich", label: "Rich" },
];

const mod = appleKeys ? "⌘" : "Ctrl+";

/**
 * On Windows the app draws its own title bar: the window has no native frame,
 * and this toolbar is the top of the window. It carries the icon, the menu
 * button, the title and the window buttons, and its empty areas drag the
 * window. macOS keeps its own title bar and menu bar; iOS has no window frame.
 */
const ownTitleBar = isTauri() && isDesktop && !isMacOS;
/** Marks an empty area of the bar as a handle for moving the window. */
const drag = ownTitleBar ? { "data-tauri-drag-region": true } : {};

function WindowButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    const update = () => void win.isMaximized().then(setMaximized, () => {});
    update();
    const unlisten = win.onResized(update);
    return () => void unlisten.then((fn) => fn());
  }, []);
  const win = getCurrentWindow();
  const line = { fill: "none", stroke: "currentColor" };
  return (
    <div className="win-buttons">
      <button tabIndex={-1} aria-label="Minimize" title="Minimize" onClick={() => void win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" {...line} />
        </svg>
      </button>
      <button tabIndex={-1} aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} onClick={() => void win.toggleMaximize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" {...line} /> : <rect x=".5" y=".5" width="9" height="9" rx="1.5" {...line} />}
        </svg>
      </button>
      <button tabIndex={-1} className="close" aria-label="Close" title="Close" onClick={() => void win.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0l10 10M10 0L0 10" {...line} />
        </svg>
      </button>
    </div>
  );
}

const formatting: { kind: FormatKind; icon: typeof Bold; label: string; key?: string }[] = [
  { kind: "bold", icon: Bold, label: "Bold", key: "B" },
  { kind: "italic", icon: Italic, label: "Italic", key: "I" },
  { kind: "heading", icon: Heading, label: "Heading (cycles #, ##, ###)" },
  { kind: "link", icon: Link, label: "Link", key: "K" },
  { kind: "code", icon: Code, label: "Inline code" },
  { kind: "bullet", icon: List, label: "Bulleted list" },
];

export function Toolbar({ menu, title, dirty, viewMode, onViewMode, onNew, onOpen, onOpenFolder, onFormat, onExport }: ToolbarProps) {
  /** Opens a menu under a toolbar button; `keyboard` when it was opened with a key rather than the mouse. */
  const dropDown = (button: HTMLElement, items: MenuItem[], keyboard: boolean, align: "left" | "right" = "left") => {
    const box = button.getBoundingClientRect();
    // Right-aligned menus are pushed back inside the window by the menu itself.
    showMenu(items, { x: align === "left" ? box.left : box.right - 180, y: box.bottom + 4 }, { keyboard });
  };

  const showExportMenu = (button: HTMLElement, keyboard: boolean) =>
    dropDown(
      button,
      [
        { label: "Export as HTML…", shortcut: `${mod}Shift+E`, action: () => onExport("html") },
        { label: "Export as PDF…", shortcut: `${mod}P`, action: () => onExport("pdf") },
      ],
      keyboard,
      "right",
    );

  /** File, Edit, View and Settings, under the menu button. */
  const latestMenu = useRef(menu);
  latestMenu.current = menu;
  const showAppMenu = (button: HTMLElement, keyboard: boolean) => dropDown(button, latestMenu.current(), keyboard);

  // F10 opens the menu, as it does for a menu bar.
  useEffect(() => {
    if (!ownTitleBar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F10" || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const button = document.querySelector<HTMLElement>(".toolbar .menu-button");
      if (!button) return;
      e.preventDefault();
      showAppMenu(button, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={`toolbar${ownTitleBar ? " titlebar" : ""}`} {...drag}>
      {ownTitleBar && (
        <>
          <img className="app-icon" src={appIcon} alt="" draggable={false} {...drag} />
          <button className="tb-btn icon menu-button" aria-label="Menu" aria-haspopup="menu" title="Menu: File, Edit, View, Settings (F10)" onClick={(e) => showAppMenu(e.currentTarget, e.detail === 0)}>
            <MenuIcon size={16} />
          </button>
          <div className="tb-sep" />
        </>
      )}
      <button className="tb-btn icon pop-pink" onClick={onNew} aria-label="New" title={`New (${mod}N)`}>
        <SquarePen size={16} />
      </button>
      <button className="tb-btn icon pop-cyan" onClick={onOpen} aria-label="Open file" title={`Open file (${mod}O)`}>
        <FileText size={16} />
      </button>
      <button className="tb-btn icon pop-amber" onClick={onOpenFolder} aria-label="Open folder" title={`Open folder (${mod}Shift+O)`}>
        <FolderOpen size={16} />
      </button>

      <div className="tb-sep" />

      {formatting.map(({ kind, icon: Icon, label, key }) => (
        <button
          key={kind}
          className="tb-btn icon"
          disabled={viewMode === "preview"}
          aria-label={label}
          title={key ? `${label} (${mod}${key})` : label}
          // Keep focus (and the selection) in the editor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(kind)}
        >
          <Icon size={16} />
        </button>
      ))}

      {ownTitleBar ? (
        <div className="tb-title" {...drag}>
          <span className="tb-title-name" {...drag}>
            {title}
          </span>
          {dirty && <span className="tab-dot" aria-label="Unsaved changes" {...drag} />}
        </div>
      ) : (
        <div className="tb-spacer" />
      )}

      <div className="segmented" role="group" aria-label="View mode">
        {viewModes.map(({ mode, label }) => (
          <button
            key={mode}
            className={mode === viewMode ? "active" : undefined}
            aria-pressed={mode === viewMode}
            onClick={() => onViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        className="tb-btn"
        aria-haspopup="menu"
        aria-label="Export"
        title={`Export as HTML (${mod}Shift+E) or PDF (${mod}P)`}
        onClick={(e) => showExportMenu(e.currentTarget, e.detail === 0)}
      >
        <Download size={16} />
        <ChevronDown size={14} />
      </button>

      {ownTitleBar && <WindowButtons />}
    </header>
  );
}
