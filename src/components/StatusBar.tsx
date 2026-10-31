import type { Doc } from "../lib/stores/document";

interface StatusBarProps {
  doc: Doc;
  dirty: boolean;
  autosave: boolean;
  line: number;
  col: number;
  /** Characters selected, 0 for a plain cursor. */
  selected: number;
  words: number;
}

export function StatusBar({ doc, dirty, autosave, line, col, selected, words }: StatusBarProps) {
  const state = dirty ? "Unsaved" : doc.path ? "Saved" : "New file";
  return (
    <footer className="statusbar">
      <span>Markdown</span>
      <span>{doc.bom ? "UTF-8 with BOM" : "UTF-8"}</span>
      <span>{doc.lineEnding === "\r\n" ? "CRLF" : "LF"}</span>
      <span className="spacer" />
      <span>
        Ln {line}, Col {col}
        {selected > 0 && ` (${selected.toLocaleString()} selected)`}
      </span>
      <span>
        {words.toLocaleString()} {words === 1 ? "word" : "words"}
      </span>
      <span className={dirty ? "unsaved" : undefined}>{state}</span>
      <span title="Settings › Autosave">{autosave ? "Autosave on" : "Autosave off"}</span>
    </footer>
  );
}
