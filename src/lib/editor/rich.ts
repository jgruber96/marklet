import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { resolveLocalSrc } from "../preview/render";

/*
 * Rich view: the same editor and the same plain Markdown text, drawn the way
 * it will read. Markdown symbols (#, **, backticks, link addresses, >) are
 * hidden until the cursor or selection reaches them, images are shown in
 * place, bullets and task boxes are drawn, and prose uses the preview's font.
 * Nothing here changes the document except ticking a task box.
 *
 * Tables, math, diagrams and raw HTML stay as source in this view.
 */

let enabled = false;
let baseDir: () => string | null = () => null;

/** Where the open document lives, for showing its relative images. */
export function configureRich(options: { baseDir(): string | null }): void {
  baseDir = options.baseDir;
}

/** Turns the Rich view on or off for every tab. */
export function setRich(on: boolean, view: EditorView | null): void {
  if (enabled === on) return;
  enabled = on;
  if (!view) return;
  view.dispatch({}); // an empty update re-reads the flag below
  view.requestMeasure(); // fonts and line heights changed
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const img = document.createElement("img");
    img.className = "cm-rich-image";
    img.alt = this.alt;
    img.title = this.alt;
    img.onload = img.onerror = () => view.requestMeasure();
    img.src = this.src;
    return img;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-rich-bullet";
    span.textContent = "•";
    return span;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-rich-rule";
    return span;
  }
}

class TaskWidget extends WidgetType {
  /** `pos` is the character between the brackets of `[ ]`. */
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-rich-task";
    box.checked = this.checked;
    box.setAttribute("aria-label", "Task done");
    // Tick without moving the cursor onto the line (which would show the source).
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos, to: this.pos + 1, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const inlineCode = Decoration.mark({ class: "cm-rich-code" });
const quoteLine = Decoration.line({ class: "cm-rich-quote" });
const monoLine = Decoration.line({ class: "cm-rich-mono" });
const headingLine = [1, 2, 3, 4, 5, 6].map((n) => Decoration.line({ class: `cm-rich-heading cm-rich-h${n}` }));

const INLINE_MARKS: Record<string, string> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  Strikethrough: "StrikethroughMark",
  InlineCode: "CodeMark",
};

function richDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const selection = state.selection.ranges;
  const out: Range<Decoration>[] = [];

  /** True when the cursor or a selection reaches into from..to. */
  const touched = (from: number, to: number) => selection.some((r) => r.from <= to && r.to >= from);
  const lineTouched = (pos: number) => {
    const line = doc.lineAt(pos);
    return touched(line.from, line.to);
  };
  const hide = (from: number, to: number) => {
    if (to > from) out.push(hidden.range(from, to));
  };
  /** The end of the spaces that follow `pos` on its line. */
  const afterSpaces = (pos: number) => {
    const rest = doc.sliceString(pos, doc.lineAt(pos).to);
    return pos + (rest.length - rest.trimStart().length);
  };
  const eachLine = (from: number, to: number, deco: Decoration) => {
    for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) {
      out.push(deco.range(doc.line(n).from));
    }
  };

  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(ref) {
        const { name, from, to } = ref;

        const atx = /^ATXHeading([1-6])$/.exec(name);
        if (atx) {
          out.push(headingLine[Number(atx[1]) - 1].range(doc.lineAt(from).from));
          if (!lineTouched(from)) {
            ref.node.getChildren("HeaderMark").forEach((mark, i) => {
              if (i === 0) hide(mark.from, afterSpaces(mark.to));
              else hide(mark.from, mark.to); // closing #s
            });
          }
          return;
        }
        const setext = /^SetextHeading([12])$/.exec(name);
        if (setext) {
          out.push(headingLine[Number(setext[1]) - 1].range(doc.lineAt(from).from));
          return;
        }

        const markName = INLINE_MARKS[name];
        if (markName) {
          if (name === "InlineCode") out.push(inlineCode.range(from, to));
          if (!touched(from, to)) ref.node.getChildren(markName).forEach((mark) => hide(mark.from, mark.to));
          return name !== "InlineCode";
        }

        switch (name) {
          case "Link": {
            // [text](address "title") or [text][ref]: keep only the text.
            const marks = ref.node.getChildren("LinkMark");
            if (marks.length >= 2 && !touched(from, to)) {
              hide(marks[0].from, marks[0].to);
              hide(marks[1].from, to);
            }
            return;
          }
          case "Image": {
            const url = ref.node.getChild("URL");
            if (url && !touched(from, to)) {
              const marks = ref.node.getChildren("LinkMark");
              const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : "";
              const src = resolveLocalSrc(doc.sliceString(url.from, url.to), baseDir());
              out.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(from, to));
            }
            return false;
          }
          case "Blockquote":
            eachLine(Math.max(from, visible.from), Math.min(to, visible.to), quoteLine);
            return;
          case "QuoteMark":
            if (!lineTouched(from)) hide(from, doc.sliceString(to, to + 1) === " " ? to + 1 : to);
            return;
          case "ListMark": {
            const item = ref.node.parent;
            const marker = item?.getChild("Task")?.getChild("TaskMarker");
            if (marker && doc.lineAt(marker.from).number === doc.lineAt(from).number) {
              if (!touched(from, marker.to)) {
                const checked = doc.sliceString(marker.from + 1, marker.from + 2).toLowerCase() === "x";
                out.push(Decoration.replace({ widget: new TaskWidget(checked, marker.from + 1) }).range(from, marker.to));
              }
            } else if (item?.parent?.name === "BulletList" && !touched(from, to)) {
              out.push(bullet.range(from, to));
            }
            return;
          }
          case "HorizontalRule":
            if (!lineTouched(from)) out.push(rule.range(from, to));
            return;
          case "Escape":
            if (!touched(from, to)) hide(from, from + 1);
            return;
          case "Table":
            // Source, in the fixed-width font so the columns line up.
            eachLine(Math.max(from, visible.from), Math.min(to, visible.to), monoLine);
            return false;
          case "FencedCode":
          case "CodeBlock":
          case "HTMLBlock":
          case "CommentBlock":
            return false;
        }
      },
    });
  }
  return Decoration.set(out, true);
}

const richPlugin = ViewPlugin.fromClass(
  class {
    on = enabled;
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = enabled ? richDecorations(view) : Decoration.none;
    }
    update(update: ViewUpdate) {
      const switched = this.on !== enabled;
      this.on = enabled;
      if (!enabled) {
        if (switched) this.decorations = Decoration.none;
      } else if (
        switched ||
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = richDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Read on every update, so tabs in the background pick the view up when shown.
const richClass = EditorView.editorAttributes.of(() => ({ class: enabled ? "cm-rich" : "" }));

const mono = { fontFamily: "var(--font-mono)", fontSize: "0.86em" };

/** Typography that follows the preview (styles/preview.css). */
const richTheme = EditorView.theme({
  "&.cm-rich .cm-gutters": { display: "none" },
  "&.cm-rich .cm-scroller": { fontFamily: "var(--font-ui)", fontSize: "15px" },
  "&.cm-rich .cm-content": { maxWidth: "820px", margin: "0 auto", padding: "24px 0 40vh" },
  "&.cm-rich .cm-line": { padding: "0 32px" },
  "&.cm-rich .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-rich .cm-code-block, &.cm-rich .cm-rich-mono": mono,
  "&.cm-rich .cm-code-block.cm-activeLine": { backgroundColor: "var(--code-bg)" },
  "&.cm-rich .cm-rich-code": { ...mono, padding: "0.15em 0", borderRadius: "4px", backgroundColor: "var(--code-bg)" },

  "&.cm-rich .cm-line.cm-rich-heading": { fontWeight: "600", lineHeight: "1.25", paddingTop: "0.5em", paddingBottom: "0.2em" },
  // The source view sizes heading text itself; here the line sets the size.
  "&.cm-rich .cm-rich-heading span": { fontSize: "inherit" },
  "&.cm-rich .cm-rich-h1": { fontSize: "2em" },
  "&.cm-rich .cm-rich-h2": { fontSize: "1.5em" },
  "&.cm-rich .cm-rich-h3": { fontSize: "1.25em" },
  "&.cm-rich .cm-rich-h4": { fontSize: "1em" },
  "&.cm-rich .cm-rich-h5": { fontSize: "0.875em" },
  "&.cm-rich .cm-rich-h6": { fontSize: "0.85em", color: "var(--muted)" },

  "&.cm-rich .cm-line.cm-rich-quote": {
    marginLeft: "32px",
    paddingLeft: "1em",
    borderLeft: "3px solid var(--border)",
    color: "var(--muted)",
  },
  ".cm-rich-bullet": { color: "var(--muted)" },
  ".cm-rich-task": { margin: "0 0.1em 0 0", verticalAlign: "-0.1em", accentColor: "var(--accent)", cursor: "pointer" },
  ".cm-rich-rule": { display: "inline-block", width: "100%", height: "2px", verticalAlign: "middle", backgroundColor: "var(--border)" },
  ".cm-rich-image": { maxWidth: "100%", verticalAlign: "bottom", borderRadius: "4px" },
});

export const richView = [richPlugin, richClass, richTheme];
