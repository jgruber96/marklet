import { EditorView, WidgetType } from "@codemirror/view";
import { renderInlineFragment } from "../preview/render";
import { followLink } from "../links";
import { addColumn, addRow, cleanCell, parseTable, removeColumn, removeRow, serializeTable, type TableModel } from "./tableModel";

/*
 * A table in the Rich view, edited in place: click a cell and type. The cell
 * shows its Markdown while it has the cursor and its rendered form otherwise.
 * Every keystroke is written back to the document as Markdown (so saving,
 * autosave and the unsaved mark behave as usual), with the columns kept
 * aligned in the source.
 *
 * Keys in a cell: Tab / Shift+Tab to the next / previous cell (Tab in the
 * last cell adds a row), Enter and the up / down arrows move between rows
 * (leaving the table at its ends), Esc returns to the text.
 */

interface Options {
  dir: string | null;
  openFile(path: string): void;
}

interface Controller {
  model: TableModel;
  /** The table's Markdown as it is in the document, and so the length of the range the widget replaces. */
  source: string;
  /** The cell that last had the cursor: [row, column]. */
  last: [number, number];
  draw(): void;
}

const controllers = new WeakMap<HTMLElement, Controller>();

export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly options: Options,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return other.source === this.source && other.options.dir === this.options.dir;
  }

  /** True when `source` is a table this widget can edit. */
  static accepts(source: string): boolean {
    return parseTable(source) !== null;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("div");
    box.className = "cm-rich-block cm-rich-table markdown-body";
    box.tabIndex = -1;
    const { dir, openFile } = this.options;

    const cellAt = (row: number, column: number) => box.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`);
    const where = (cell: Element): [number, number] => (cell.getAttribute("data-cell") ?? "0:0").split(":").map(Number) as [number, number];
    const html = (text: string) => renderInlineFragment(text, dir);

    const control: Controller = {
      model: parseTable(this.source)!,
      source: this.source,
      last: [0, 0],
      draw() {
        const { rows, aligns } = control.model;
        const table = document.createElement("table");
        const head = table.createTHead();
        const body = table.createTBody();
        rows.forEach((cells, r) => {
          const tr = (r === 0 ? head : body).insertRow();
          cells.forEach((text, c) => {
            const cell = document.createElement(r === 0 ? "th" : "td");
            cell.setAttribute("data-cell", `${r}:${c}`);
            cell.contentEditable = "plaintext-only";
            cell.spellcheck = true;
            if (aligns[c]) cell.style.textAlign = aligns[c];
            cell.innerHTML = html(text);
            tr.append(cell);
          });
        });
        box.querySelector("table")?.remove();
        box.append(table);
      },
    };
    controllers.set(box, control);

    /** Writes the table back into the document, if it changed. */
    const commit = () => {
      const text = serializeTable(control.model);
      if (text === control.source) return;
      const from = view.posAtDOM(box);
      const to = from + control.source.length;
      control.source = text;
      view.dispatch({ changes: { from, to, insert: text }, userEvent: "input.type" });
    };

    const focusCell = (row: number, column: number) => {
      const cell = cellAt(row, column);
      if (!cell) return false;
      cell.focus();
      return true;
    };

    /** Leaves the table for the line before (-1) or after (1) it. */
    const leave = (side: -1 | 1) => {
      const from = view.posAtDOM(box);
      const edge = side < 0 ? from - 1 : from + control.source.length + 1;
      const pos = Math.max(0, Math.min(view.state.doc.length, edge));
      (document.activeElement as HTMLElement | null)?.blur();
      // At the very start or end of the document there is no other line: the table opens as source instead.
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    };

    // --- Tools: shown while the pointer or the cursor is in the table.
    const tools = document.createElement("div");
    tools.className = "cm-rich-table-tools";
    const tool = (label: string, title: string, run: () => void) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.tabIndex = -1;
      // Keep the cursor in its cell.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", run);
      tools.append(button);
    };
    const change = (edit: () => boolean | void, focus?: () => [number, number]) => {
      if (edit() === false) return;
      const [row, column] = focus ? focus() : control.last;
      // Park the focus on the table while its cells are rebuilt; left to itself it would
      // fall back to the editor, which would take that as a click on the table.
      box.focus();
      control.draw();
      commit();
      focusCell(Math.min(row, control.model.rows.length - 1), Math.min(column, control.model.aligns.length - 1));
    };
    tool("+ Row", "Add a row below", () => change(() => addRow(control.model, control.last[0]), () => [control.last[0] + 1, control.last[1]]));
    tool("+ Column", "Add a column to the right", () => change(() => addColumn(control.model, control.last[1]), () => [control.last[0], control.last[1] + 1]));
    tool("− Row", "Remove this row", () => change(() => removeRow(control.model, control.last[0])));
    tool("− Column", "Remove this column", () => change(() => removeColumn(control.model, control.last[1])));
    tool("Markdown", "Edit the table as Markdown", () => {
      (document.activeElement as HTMLElement | null)?.blur();
      view.dispatch({ selection: { anchor: view.posAtDOM(box) } });
      view.focus();
    });
    box.append(tools);
    control.draw();

    // --- Cells.
    box.addEventListener("focusin", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
      if (!cell) return;
      const [row, column] = where(cell);
      control.last = [row, column];
      // Show the cell's Markdown while it is being edited, cursor at its end.
      cell.textContent = control.model.rows[row][column];
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    box.addEventListener("focusout", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
      if (!cell?.isConnected) return;
      const [row, column] = where(cell);
      cell.innerHTML = html(control.model.rows[row]?.[column] ?? "");
    });

    // Typing, pasting, cutting and dropping in a cell stay in the cell.
    for (const type of ["beforeinput", "paste", "cut", "copy", "drop", "compositionstart", "compositionend", "keyup", "keypress"]) {
      box.addEventListener(type, (e) => e.stopPropagation());
    }

    box.addEventListener("input", (e) => {
      e.stopPropagation();
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
      if (!cell) return;
      const [row, column] = where(cell);
      control.model.rows[row][column] = cleanCell(cell.textContent ?? "");
      commit();
    });

    box.addEventListener("keydown", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
      if (!cell) return;
      // Keys typed in a cell are the cell's alone; the editor around it must never act on them.
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        // Select All means this cell. Left to the web view it selects the whole document,
        // and the next keystroke would replace it.
        if (e.key.toLowerCase() === "a" && !e.altKey) {
          e.preventDefault();
          getSelection()?.selectAllChildren(cell);
        }
        return;
      }
      if (e.altKey) return;
      const [row, column] = where(cell);
      const rows = control.model.rows.length;
      const columns = control.model.aligns.length;
      const done = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Tab") {
        done();
        const next = row * columns + column + (e.shiftKey ? -1 : 1);
        if (next < 0) return leave(-1);
        if (next >= rows * columns) return change(() => addRow(control.model, rows - 1), () => [rows, 0]);
        focusCell(Math.floor(next / columns), next % columns);
      } else if (e.key === "Enter" || e.key === "ArrowDown") {
        done();
        if (!focusCell(row + 1, column)) leave(1);
      } else if (e.key === "ArrowUp") {
        done();
        if (!focusCell(row - 1, column)) leave(-1);
      } else if (e.key === "Escape") {
        done();
        cell.blur();
        view.focus();
      }
    });

    // A link in a cell: Ctrl/Cmd+click follows it, a plain click edits the cell. Never let the web view navigate.
    box.addEventListener("click", (e) => {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) followLink(link.getAttribute("href") ?? "", dir, openFile);
    });
    box.addEventListener("load", () => view.requestMeasure(), true); // images in cells
    return box;
  }

  /** Keeps the table's DOM (and the cursor in its cell) when the document changes under it. */
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const control = controllers.get(dom);
    if (!control) return false;
    if (control.source !== this.source) {
      // Changed from outside the table (undo, find and replace): show the new content.
      const model = parseTable(this.source);
      if (!model) return false;
      control.model = model;
      control.source = this.source;
      control.draw();
      view.requestMeasure();
    }
    return true;
  }

  // Everything inside is handled here, not by the editor.
  ignoreEvent() {
    return true;
  }
}

export const tableTheme = EditorView.theme({
  ".cm-rich-table": { position: "relative", outline: "none" },
  ".cm-rich-table [data-cell]": { minWidth: "3em", outline: "none", cursor: "text" },
  ".cm-rich-table [data-cell]:empty::before": { content: '"\\200b"' },
  ".cm-rich-table [data-cell]:focus": {
    boxShadow: "inset 0 0 0 2px var(--accent)",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
  },
  ".cm-rich-table-tools": {
    display: "flex",
    gap: "4px",
    height: "0",
    overflow: "visible",
    opacity: "0",
    pointerEvents: "none",
    transform: "translateY(-20px)",
    transition: "opacity 0.12s",
    fontFamily: "var(--font-ui)",
  },
  ".cm-rich-table:hover .cm-rich-table-tools, .cm-rich-table:focus-within .cm-rich-table-tools": { opacity: "1", pointerEvents: "auto" },
  ".cm-rich-table-tools button": {
    height: "20px",
    padding: "0 7px",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    backgroundColor: "var(--bar)",
    color: "var(--muted)",
    font: "11px var(--font-ui)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  ".cm-rich-table-tools button:hover": { color: "var(--text)", borderColor: "var(--accent)" },
});
