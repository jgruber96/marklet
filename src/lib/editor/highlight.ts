import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

/*
 * Token colors come from the --tok-* palette in styles/theme.css, the same
 * variables the preview's Shiki theme uses (lib/preview/highlight.ts). Keep
 * the two mappings in step: keywords and tags → keyword; strings → string;
 * functions and types → function; numbers, constants, keys and attributes →
 * number; comments → comment.
 */
const style = HighlightStyle.define([
  // Markdown
  { tag: t.heading1, fontWeight: "700", fontSize: "1.3em", color: "var(--h1)" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.15em", color: "var(--h2)" },
  { tag: t.heading3, fontWeight: "700", color: "var(--h3)" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--link)" },
  { tag: t.url, color: "var(--muted)", textDecoration: "underline" },
  { tag: t.monospace, color: "var(--code-text)", backgroundColor: "var(--code-bg)", borderRadius: "3px" },
  { tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "var(--muted)" },
  // Syntax characters: #, **, _, [](), backticks, fences, >, list markers.
  { tag: [t.processingInstruction, t.labelName], color: "var(--marker)", opacity: "0.9" },

  // Code inside fenced blocks
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.tagName],
    color: "var(--tok-keyword)",
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.docString], color: "var(--tok-string)" },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.className,
      t.typeName,
      t.macroName,
    ],
    color: "var(--tok-function)",
  },
  {
    tag: [
      t.number,
      t.integer,
      t.float,
      t.bool,
      t.null,
      t.atom,
      t.self,
      t.constant(t.variableName),
      t.standard(t.variableName),
      t.propertyName,
      t.definition(t.propertyName),
      t.attributeName,
      t.escape,
    ],
    color: "var(--tok-number)",
  },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta], color: "var(--tok-comment)" },
  { tag: t.invalid, color: "var(--text)" },
]);

const codeLine = Decoration.line({ class: "cm-code-block" });
const codeFirst = Decoration.line({ class: "cm-code-block cm-code-first" });
const codeLast = Decoration.line({ class: "cm-code-block cm-code-last" });
const codeOnly = Decoration.line({ class: "cm-code-block cm-code-first cm-code-last" });

/** Tints every line of fenced and indented code blocks. */
function codeBlockLines(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "FencedCode" && node.name !== "CodeBlock") return;
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        const start = Math.max(first, doc.lineAt(from).number);
        const end = Math.min(last, doc.lineAt(to).number);
        for (let n = start; n <= end; n++) {
          const deco = first === last ? codeOnly : n === first ? codeFirst : n === last ? codeLast : codeLine;
          builder.add(doc.line(n).from, doc.line(n).from, deco);
        }
        return false;
      },
    });
  }
  return builder.finish();
}

const codeBlockBackground = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = codeBlockLines(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = codeBlockLines(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const markdownHighlighting = [syntaxHighlighting(style), codeBlockBackground];
