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
  SquarePen,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import type { ViewMode } from "../lib/stores/settings";
import type { ExportKind } from "../lib/export/export";
import type { FormatKind } from "../lib/editor/format";

interface ToolbarProps {
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

const mod = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl+";

const formatting: { kind: FormatKind; icon: typeof Bold; label: string; key?: string }[] = [
  { kind: "bold", icon: Bold, label: "Bold", key: "B" },
  { kind: "italic", icon: Italic, label: "Italic", key: "I" },
  { kind: "heading", icon: Heading, label: "Heading (cycles #, ##, ###)" },
  { kind: "link", icon: Link, label: "Link", key: "K" },
  { kind: "code", icon: Code, label: "Inline code" },
  { kind: "bullet", icon: List, label: "Bulleted list" },
];

export function Toolbar({ viewMode, onViewMode, onNew, onOpen, onOpenFolder, onFormat, onExport }: ToolbarProps) {
  // A native dropdown under the button, so it looks and keys like the menu bar.
  const showExportMenu = async (button: HTMLElement) => {
    if (!isTauri()) return onExport("html");
    const box = button.getBoundingClientRect();
    const menu = await Menu.new({
      items: [
        { text: "HTML…", action: () => onExport("html") },
        { text: "PDF…", action: () => onExport("pdf") },
      ],
    });
    await menu.popup(new LogicalPosition(box.left, box.bottom + 2));
  };

  return (
    <div className="toolbar">
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

      <div className="tb-spacer" />

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
        onClick={(e) => void showExportMenu(e.currentTarget)}
      >
        <Download size={16} />
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
