import type { Doc } from "../lib/stores/document";

interface StatusBarProps {
  doc: Doc;
  dirty: boolean;
  line: number;
  col: number;
  words: number;
}

export function StatusBar({ doc, dirty, line, col, words }: StatusBarProps) {
  const state = dirty ? "Unsaved" : doc.path ? "Saved" : "New file";
  return (
    <footer className="statusbar">
      <span>Markdown</span>
      <span>{doc.bom ? "UTF-8 with BOM" : "UTF-8"}</span>
      <span>{doc.lineEnding === "\r\n" ? "CRLF" : "LF"}</span>
      <span className="spacer" />
      <span>
        Ln {line}, Col {col}
      </span>
      <span>
        {words.toLocaleString()} {words === 1 ? "word" : "words"}
      </span>
      <span className={dirty ? "unsaved" : undefined}>{state}</span>
    </footer>
  );
}
