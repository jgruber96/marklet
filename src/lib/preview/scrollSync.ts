import { EditorView } from "@codemirror/view";

interface Anchor {
  /** 0-based source line, possibly fractional. */
  line: number;
  /** Offset from the top of the preview's scrollable content, in px. */
  top: number;
}

type Side = "editor" | "preview";

/**
 * Keeps the editor and preview scrolled to the same place, in both directions.
 *
 * Rendered blocks carry `data-line` (their first source line). Positions between
 * two blocks are interpolated linearly, both from line → pixel and back. Only
 * the side the user last touched drives, so the programmatic scroll of the
 * other side never echoes back.
 */
export class ScrollSync {
  private driver: Side = "editor";
  private anchors: Anchor[] | null = null;
  private enabled = true;
  private frame = 0;
  private scrollFrame = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly view: EditorView,
    private readonly pane: HTMLElement,
    private readonly content: HTMLElement,
    /** Called once per frame while either side scrolls (the outline tracks the heading in view). */
    private readonly onScroll: () => void = () => {},
  ) {
    const editorEl = view.scrollDOM;
    this.on(editorEl, "scroll", () => {
      if (this.driver === "editor") this.schedule("editor");
      this.notifyScroll();
    });
    this.on(pane, "scroll", () => {
      if (this.driver === "preview") this.schedule("preview");
      this.notifyScroll();
    });
    for (const type of ["wheel", "pointerdown", "keydown", "touchstart"]) {
      this.on(view.dom, type, () => (this.driver = "editor"));
      this.on(pane, type, () => (this.driver = "preview"));
    }
    const resize = new ResizeObserver(() => this.invalidate());
    resize.observe(content);
    resize.observe(editorEl);
    this.cleanup.push(() => resize.disconnect());
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.scrollFrame);
    this.cleanup.forEach((fn) => fn());
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) this.afterRender();
  }

  /** Call after the preview HTML is replaced: re-measure and catch up with the editor. */
  afterRender() {
    this.anchors = null;
    if (this.driver === "editor") this.schedule("editor");
  }

  /** Makes the editor drive (e.g. after typing or a jump), then syncs. */
  followEditor() {
    this.driver = "editor";
    this.schedule("editor");
  }

  /**
   * Scrolls both panes so source line `line` (0-based) sits at the top, and
   * puts the cursor there. Works in every view mode; hidden panes are skipped.
   */
  jumpTo(line: number) {
    this.driver = "editor";
    const view = this.view;
    if (view.dom.offsetParent !== null) {
      const pos = view.state.doc.line(Math.min(view.state.doc.lines, line + 1)).from;
      // CodeMirror's own scroll re-measures lines it had only estimated (long
      // wrapped lines off screen), so the heading lands exactly at the top.
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 0 }) });
      view.focus();
    }
    if (this.pane.offsetParent !== null) {
      const target = [...this.content.querySelectorAll<HTMLElement>("[data-line]")].find(
        (el) => Number(el.dataset.line) >= line && el.offsetParent !== null,
      );
      if (target) {
        const top = target.getBoundingClientRect().top - this.content.getBoundingClientRect().top;
        this.pane.scrollTop = this.contentOffset() + top;
      }
    }
  }

  /** The source line (0-based, fractional) at the top of whichever pane is showing; the editor wins in split view. */
  topLine(): number {
    if (this.view.dom.offsetParent !== null) return this.editorTopLine();
    const y = this.pane.scrollTop - this.contentOffset();
    const anchors = this.getAnchors();
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1].top <= y) i++;
    const a = anchors[i];
    const b = anchors[i + 1] ?? a;
    const t = b.top > a.top ? (y - a.top) / (b.top - a.top) : 0;
    return a.line + Math.min(1, Math.max(0, t)) * (b.line - a.line);
  }

  private notifyScroll() {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => this.onScroll());
  }

  private invalidate() {
    this.anchors = null;
    this.schedule(this.driver);
  }

  private on(el: EventTarget, type: string, fn: () => void) {
    el.addEventListener(type, fn, { passive: true, capture: true });
    this.cleanup.push(() => el.removeEventListener(type, fn, { capture: true }));
  }

  private schedule(from: Side) {
    if (!this.enabled) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => (from === "editor" ? this.syncPreview() : this.syncEditor()));
  }

  // --- measuring -----------------------------------------------------------

  private getAnchors(): Anchor[] {
    if (this.anchors) return this.anchors;
    const base = this.content.getBoundingClientRect().top;
    const list: Anchor[] = [{ line: 0, top: 0 }];
    for (const el of this.content.querySelectorAll<HTMLElement>("[data-line]")) {
      const line = Number(el.dataset.line);
      const top = el.getBoundingClientRect().top - base;
      const last = list[list.length - 1];
      // Keep the list strictly increasing in both line and position; nested
      // blocks (a list and its first item) share a line, and hidden ones have no box.
      if (line > last.line && top > last.top && el.offsetParent !== null) list.push({ line, top });
    }
    const last = list[list.length - 1];
    const endLine = this.view.state.doc.lines;
    const endTop = this.content.scrollHeight;
    if (endLine > last.line && endTop > last.top) list.push({ line: endLine, top: endTop });
    return (this.anchors = list);
  }

  /** Where the editor's first line starts, in scrollDOM scroll coordinates. */
  private editorDocOffset(): number {
    const scroller = this.view.scrollDOM;
    return this.view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  }

  private editorTopLine(): number {
    const view = this.view;
    const y = view.scrollDOM.scrollTop - this.editorDocOffset();
    if (y <= 0) return 0;
    const block = view.lineBlockAtHeight(y);
    const line = view.state.doc.lineAt(block.from).number - 1;
    return line + Math.min(1, (y - block.top) / Math.max(1, block.height));
  }

  private scrollEditorToLine(line: number) {
    const view = this.view;
    const doc = view.state.doc;
    const whole = Math.min(doc.lines - 1, Math.max(0, Math.floor(line)));
    const block = view.lineBlockAt(doc.line(whole + 1).from);
    const y = block.top + (line - whole) * block.height;
    view.scrollDOM.scrollTop = y + this.editorDocOffset();
  }

  // --- syncing ---------------------------------------------------------------

  private syncPreview() {
    const scroller = this.view.scrollDOM;
    const max = this.pane.scrollHeight - this.pane.clientHeight;
    if (scroller.scrollTop <= 0) return void (this.pane.scrollTop = 0);
    if (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1) return void (this.pane.scrollTop = max);

    const line = this.editorTopLine();
    const anchors = this.getAnchors();
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1].line <= line) i++;
    const a = anchors[i];
    const b = anchors[i + 1] ?? a;
    const t = b.line > a.line ? (line - a.line) / (b.line - a.line) : 0;
    this.pane.scrollTop = this.contentOffset() + a.top + Math.min(1, t) * (b.top - a.top);
  }

  private syncEditor() {
    const pane = this.pane;
    const scroller = this.view.scrollDOM;
    if (pane.scrollTop <= 0) return void (scroller.scrollTop = 0);
    if (pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 1) {
      return void (scroller.scrollTop = scroller.scrollHeight);
    }

    const y = pane.scrollTop - this.contentOffset();
    const anchors = this.getAnchors();
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1].top <= y) i++;
    const a = anchors[i];
    const b = anchors[i + 1] ?? a;
    const t = b.top > a.top ? (y - a.top) / (b.top - a.top) : 0;
    this.scrollEditorToLine(a.line + Math.min(1, Math.max(0, t)) * (b.line - a.line));
  }

  /** Distance from the pane's scroll origin to the content's top (its padding). */
  private contentOffset(): number {
    return this.content.getBoundingClientRect().top - this.pane.getBoundingClientRect().top + this.pane.scrollTop;
  }
}
