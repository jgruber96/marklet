import { EditorView } from "@codemirror/view";

/** Editor chrome drawn from the CSS tokens in styles/theme.css. */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    fontSize: "14px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
  },
  ".cm-content": {
    padding: "16px 0 40vh",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "0 24px 0 8px" },
  ".cm-gutters": {
    backgroundColor: "var(--bg)",
    color: "var(--muted)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 4px 0 16px", opacity: "0.7" },
  ".cm-activeLine": { backgroundColor: "var(--current-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--current-line)" },
  ".cm-activeLineGutter.cm-gutterElement": { color: "var(--text)", opacity: "1" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
});
