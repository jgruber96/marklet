import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/*
 * Spell check uses the web view's own checker (the Windows and macOS system
 * dictionaries, in the system languages): misspellings get the usual red
 * underline and the right-click menu offers corrections. CodeMirror turns it
 * off by default; this turns it on for prose and keeps it off for the parts
 * of a Markdown file that are not prose.
 */

let enabled = true;

/** Turns spell check on or off (Settings › Spell Check) for every tab. */
export function setSpellCheck(on: boolean, view: EditorView | null): void {
  enabled = on;
  view?.dispatch({}); // an empty update re-reads the attribute below
}

// Read on every update, so tabs in the background pick the setting up when shown.
const contentAttribute = EditorView.contentAttributes.of(() => ({ spellcheck: enabled ? "true" : "false" }));

/** Inline Markdown that is not prose: code, addresses and raw HTML tags. */
const SKIPPED = new Set(["InlineCode", "URL", "Autolink", "HTMLTag", "CodeInfo", "LinkLabel", "Entity"]);
/** Whole-line blocks; their lines are marked in highlight.ts (`cm-code-block`), plus raw HTML here. */
const SKIPPED_BLOCKS = new Set(["FencedCode", "CodeBlock", "HTMLBlock", "CommentBlock"]);

const unchecked = Decoration.mark({ attributes: { spellcheck: "false" } });

function uncheckedRanges(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (!SKIPPED.has(node.name) && !SKIPPED_BLOCKS.has(node.name)) return;
        if (node.to > node.from) builder.add(node.from, node.to, unchecked);
        return false;
      },
    });
  }
  return builder.finish();
}

const skipNonProse = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = uncheckedRanges(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = uncheckedRanges(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const spellCheck = [contentAttribute, skipNonProse];
