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

interface ToolbarProps {
  onNew(): void;
  onOpen(): void;
}

const mod = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl+";
const later = (milestone: number) => `Coming in milestone ${milestone}`;

const formatting = [
  { icon: Bold, label: "Bold" },
  { icon: Italic, label: "Italic" },
  { icon: Heading, label: "Heading" },
  { icon: Link, label: "Link" },
  { icon: Code, label: "Inline code" },
  { icon: List, label: "Bulleted list" },
];

export function Toolbar({ onNew, onOpen }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="tb-btn" onClick={onNew} title={`New (${mod}N)`}>
        <SquarePen size={16} /> New
      </button>
      <button className="tb-btn" onClick={onOpen} title={`Open file (${mod}O)`}>
        <FileText size={16} /> Open
      </button>
      <button className="tb-btn" disabled title={later(4)}>
        <FolderOpen size={16} /> Open Folder
      </button>

      <div className="tb-sep" />

      {formatting.map(({ icon: Icon, label }) => (
        <button key={label} className="tb-btn icon" disabled aria-label={label} title={`${label} — ${later(5)}`}>
          <Icon size={16} />
        </button>
      ))}

      <div className="tb-spacer" />

      <div className="segmented" role="group" aria-label="View mode" title={later(2)}>
        <button disabled>Editor</button>
        <button className="active" disabled>
          Split
        </button>
        <button disabled>Preview</button>
      </div>

      <button className="tb-btn" disabled title={later(6)}>
        <Download size={16} /> Export <ChevronDown size={14} />
      </button>
    </div>
  );
}
