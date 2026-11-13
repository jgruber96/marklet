import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/*
 * Focus mode, the editor's part: everything but the paragraph being written
 * is dimmed, and the line with the cursor is kept near the middle of the
 * window while typing ("typewriter" scrolling). The window's part (hiding
 * the sidebar, tabs and bars) is in App.tsx and styles/app.css.
 */

let enabled = false;

/** Turns the dimming and typewriter scrolling on or off for every tab. */
export function setFocusMode(on: boolean, view: EditorView | null): void {
  if (enabled === on) return;
  enabled = on;
  if (!view) return;
  view.dispatch({}); // an empty update re-reads the flag below
  view.requestMeasure();
  if (on) centerCursor(view);
}

const lit = Decoration.line({ class: "cm-focus-lit" });

/** The paragraph (run of non-blank lines) around each cursor stays lit. */
function litLines(view: EditorView): DecorationSet {
  const { doc, selection } = view.state;
  const lines = new Set<number>();
  for (const range of selection.ranges) {
    let first = doc.lineAt(range.from).number;
    let last = doc.lineAt(range.to).number;
    while (first > 1 && doc.line(first - 1).text.trim() !== "" && doc.line(first).text.trim() !== "") first--;
    while (last < doc.lines && doc.line(last + 1).text.trim() !== "" && doc.line(last).text.trim() !== "") last++;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const n of [...lines].sort((a, b) => a - b)) builder.add(doc.line(n).from, doc.line(n).from, lit);
  return builder.finish();
}

function centerCursor(view: EditorView): void {
  // After the current update has finished: an update may not start another.
  requestAnimationFrame(() => {
    if (enabled) view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
  });
}

const dimming = ViewPlugin.fromClass(
  class {
    on = enabled;
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = enabled ? litLines(view) : Decoration.none;
    }
    update(update: ViewUpdate) {
      const switched = this.on !== enabled;
      this.on = enabled;
      if (!enabled) {
        if (switched) this.decorations = Decoration.none;
        return;
      }
      if (switched || update.docChanged || update.selectionSet) this.decorations = litLines(update.view);
      // Follow typing and keyboard movement; a click leaves the page where it is.
      const byPointer = update.transactions.some((tr) => tr.isUserEvent("select.pointer"));
      if ((update.docChanged || update.selectionSet) && !byPointer) centerCursor(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// Read on every update, so tabs in the background pick the mode up when shown.
const focusClass = EditorView.editorAttributes.of(() => ({ class: enabled ? "cm-focus" : "" }));

const focusTheme = EditorView.theme({
  "&.cm-focus .cm-line": { opacity: "0.3", transition: "opacity 0.2s" },
  "&.cm-focus .cm-line.cm-focus-lit": { opacity: "1" },
  // Room to bring the first and last lines to the middle.
  "&.cm-focus .cm-content": { paddingTop: "40vh", paddingBottom: "50vh" },
});

export const focusMode = [dimming, focusClass, focusTheme];
