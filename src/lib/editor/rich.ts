import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { renderFragment, resolveLocalSrc } from "../preview/render";
import { mathHtml } from "../preview/math";
import { onEmbedsChange } from "../preview/embeds";
import { fenceTag } from "../languages";
import { followLink } from "../links";

/*
 * Rich view: the same editor and the same plain Markdown text, drawn the way
 * it will read. Markdown symbols (#, **, backticks, link addresses, >) are
 * hidden until the cursor or selection reaches them, images are shown in
 * place, bullets and task boxes are drawn, and prose uses the preview's font.
 * Tables, diagrams and formulas are drawn as in the preview and turn back
 * into source when clicked. Ctrl/Cmd+click follows a link.
 * Nothing here changes the document except ticking a task box.
 *
 * Raw HTML, and tables, diagrams and display formulas nested inside a list or
 * a quote, stay as source in this view.
 */

let enabled = false;
let baseDir: () => string | null = () => null;
let openFile: (path: string) => void = () => {};

/** Where the open document lives (for its relative images and links), and how to open a linked note. */
export function configureRich(options: { baseDir(): string | null; openFile(path: string): void }): void {
  baseDir = options.baseDir;
  openFile = options.openFile;
}

/** Widgets whose content arrives late (KaTeX and Mermaid load on first use) redraw when it is ready. */
const redrawers = new WeakMap<HTMLElement, () => void>();
function drawWhenReady(dom: HTMLElement, view: EditorView, html: () => string): void {
  let shown: string | null = null;
  const draw = () => {
    const next = html();
    if (next === shown) return;
    shown = next;
    dom.innerHTML = next;
    view.requestMeasure();
  };
  draw();
  redrawers.set(dom, onEmbedsChange(draw));
}

/** `$…$` in running text; the same shape the preview accepts, so prices like $5 and $10 are left alone. */
const INLINE_MATH = /(?<![\\$])\$(?![\s$])((?:\\.|[^$\\\n`])+?)(?<!\s)\$(?![\d$])/g;
/** A paragraph that is one `$$…$$` display formula. */
const isDisplayMath = (text: string) => text.length > 4 && /^\$\$[\s\S]+\$\$\s*$/.test(text);

class MathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-rich-math";
    drawWhenReady(span, view, () => mathHtml(this.tex, false));
    return span;
  }
  destroy(dom: HTMLElement) {
    redrawers.get(dom)?.();
  }
  ignoreEvent() {
    return false;
  }
}

/** A table, diagram or display formula, drawn by the preview's renderer. */
class BlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dir: string | null,
  ) {
    super();
  }
  eq(other: BlockWidget) {
    return other.source === this.source && other.dir === this.dir;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("div");
    box.className = "cm-rich-block markdown-body";
    drawWhenReady(box, view, () => renderFragment(this.source, this.dir));
    box.addEventListener("load", () => view.requestMeasure(), true); // images in table cells
    box.addEventListener("click", (e) => {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;
      e.preventDefault(); // never let the web view itself navigate away from the app
      if (e.ctrlKey || e.metaKey) followLink(link.getAttribute("href") ?? "", this.dir, openFile);
    });
    return box;
  }
  destroy(dom: HTMLElement) {
    redrawers.get(dom)?.();
  }
  // A click puts the cursor on the block, which turns it back into source.
  ignoreEvent() {
    return false;
  }
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
  const insideCode = (pos: number) => {
    for (let n: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent as typeof n) {
      if (n.name === "InlineCode" || n.name === "URL" || n.name === "Autolink" || n.name === "HTMLTag") return true;
    }
    return false;
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
          case "Paragraph": {
            const text = doc.sliceString(from, to);
            if (isDisplayMath(text)) return false; // drawn as a block (below) when at the top level
            for (const m of text.matchAll(INLINE_MATH)) {
              const start = from + m.index;
              const end = start + m[0].length;
              if (touched(start, end) || insideCode(start)) continue;
              out.push(Decoration.replace({ widget: new MathWidget(m[1]) }).range(start, end));
            }
            return;
          }
          case "Table":
            // While being edited: source, in the fixed-width font so the columns line up.
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

/** Top-level tables, diagrams and display formulas, replaced whole unless the selection is in them. */
function blockDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  const dir = baseDir();
  syntaxTree(state).iterate({
    enter(ref) {
      if (ref.name === "Document") return true;
      let block = ref.name === "Table";
      if (ref.name === "FencedCode") {
        const info = ref.node.getChild("CodeInfo");
        block = !!info && fenceTag(doc.sliceString(info.from, info.to)) === "mermaid";
      } else if (ref.name === "Paragraph") {
        block = isDisplayMath(doc.sliceString(ref.from, ref.to));
      }
      if (block) {
        const from = doc.lineAt(ref.from).from;
        const to = doc.lineAt(ref.to).to;
        if (!state.selection.ranges.some((r) => r.from <= to && r.to >= from)) {
          out.push(Decoration.replace({ widget: new BlockWidget(doc.sliceString(from, to), dir), block: true }).range(from, to));
        }
      }
      return false;
    },
  });
  return Decoration.set(out, true);
}

// Block replacements must come from a state field (they change the vertical layout).
const richBlocks = StateField.define<{ on: boolean; decorations: DecorationSet }>({
  create: (state) => ({ on: enabled, decorations: enabled ? blockDecorations(state) : Decoration.none }),
  update(value, tr) {
    if (!enabled) return value.on ? { on: false, decorations: Decoration.none } : value;
    if (!value.on || tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return { on: true, decorations: blockDecorations(tr.state) };
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * Arrow up or down onto a drawn block puts the cursor on its edge, which
 * turns it into source; otherwise the keyboard would step over it.
 */
const intoBlock = (dir: 1 | -1) => (view: EditorView) => {
  const { state } = view;
  const cursor = state.selection.main;
  if (!enabled || !cursor.empty) return false;
  const line = state.doc.lineAt(cursor.head);
  // Still moving inside a wrapped line: not leaving it yet.
  const moved = view.moveVertically(cursor, dir > 0);
  if (moved.head !== cursor.head && moved.head >= line.from && moved.head <= line.to) return false;
  const next = dir > 0 ? line.to + 1 : line.from - 1;
  if (next < 0 || next > state.doc.length) return false;
  let edge = -1;
  state.field(richBlocks).decorations.between(next, next, (from, to) => {
    edge = dir > 0 ? from : to;
    return false;
  });
  if (edge < 0) return false;
  view.dispatch({ selection: { anchor: edge }, scrollIntoView: true, userEvent: "select" });
  return true;
};

const blockKeys = keymap.of([
  { key: "ArrowDown", run: intoBlock(1) },
  { key: "ArrowUp", run: intoBlock(-1) },
]);

/** The address of the link at `pos`, if any. */
function linkAt(state: EditorState, pos: number): string | null {
  for (const side of [1, -1] as const) {
    for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "URL") return state.doc.sliceString(n.from, n.to);
      if (n.name === "Link" || n.name === "Autolink") {
        const url = n.getChild("URL");
        return url ? state.doc.sliceString(url.from, url.to) : null;
      }
    }
  }
  return null;
}

const followLinks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!enabled || event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const href = pos === null ? null : linkAt(view.state, pos);
    if (!href || !followLink(href, baseDir(), openFile)) return false;
    event.preventDefault();
    return true;
  },
});

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
  "&.cm-rich .cm-scroller": { fontFamily: "var(--font-ui)", fontSize: "calc(15px * var(--zoom, 1))" },
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
  // The document title shines, as in the preview.
  "&.cm-rich .cm-rich-h1 span": { background: "var(--glow)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" },

  "&.cm-rich .cm-line.cm-rich-quote": {
    marginLeft: "32px",
    paddingLeft: "1em",
    borderLeft: "3px solid var(--glow-2)",
    color: "var(--muted)",
  },
  ".cm-rich-bullet": { color: "var(--marker)", fontWeight: "700" },
  ".cm-rich-task": { margin: "0 0.1em 0 0", verticalAlign: "-0.1em", accentColor: "var(--accent)", cursor: "pointer" },
  ".cm-rich-rule": { display: "inline-block", width: "100%", height: "2px", verticalAlign: "middle", borderRadius: "2px", background: "var(--glow)", opacity: "0.7" },
  ".cm-rich-image": { maxWidth: "100%", verticalAlign: "bottom", borderRadius: "4px" },
  // Overrides the preview pane's own page layout for .markdown-body.
  // (and the editor's pre-wrap, which would turn the HTML's line breaks into gaps).
  ".cm-rich-block": { maxWidth: "none", margin: "0", padding: "0.3em 32px", cursor: "text", whiteSpace: "normal" },
  ".cm-rich-math": { whiteSpace: "normal" },
  ".cm-rich-block > *": { margin: "0" },
});

export const richView = [richPlugin, richBlocks, blockKeys, followLinks, richClass, richTheme];
