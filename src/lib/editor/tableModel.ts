/*
 * A Markdown (GFM) table as rows of cells, for editing it in place in the
 * Rich view. Cells hold raw Markdown; a literal pipe in a cell stays escaped
 * as `\|`.
 */

export type Align = "left" | "center" | "right" | null;

export interface TableModel {
  /** Row 0 is the header. Every row has one cell per column. */
  rows: string[][];
  aligns: Align[];
}

/** Splits one table line on its unescaped pipes; the outer pipes are optional. */
function splitRow(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  if (cells.length > 1 && cells[0].trim() === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

/** Reads a table; null if the text is not a well-formed one (it then stays as it is). */
export function parseTable(source: string): TableModel | null {
  const lines = source.split("\n");
  if (lines.length < 2 || !lines[0].includes("|")) return null;
  const header = splitRow(lines[0]);
  const marks = splitRow(lines[1]);
  if (marks.length !== header.length || !marks.every((m) => /^:?-+:?$/.test(m))) return null;
  const aligns = marks.map<Align>((m) => (m.startsWith(":") && m.endsWith(":") ? "center" : m.endsWith(":") ? "right" : m.startsWith(":") ? "left" : null));
  const rows = [header];
  for (const line of lines.slice(2)) {
    if (line.trim() === "") return null;
    const cells = splitRow(line);
    // Short rows are padded and long ones cut, as the preview renders them.
    rows.push(header.map((_, i) => cells[i] ?? ""));
  }
  return { rows, aligns };
}

/** What was typed into a cell, as it can be stored: one line, pipes escaped. */
export const cleanCell = (text: string) => text.replace(/\s*\n\s*/g, " ").trim().replace(/(?<!\\)\|/g, "\\|");

/** Writes the table back as Markdown, with the columns padded to line up. */
export function serializeTable({ rows, aligns }: TableModel): string {
  const widths = aligns.map((_, c) => Math.max(3, ...rows.map((r) => r[c].length)));
  const pad = (text: string, c: number) => {
    const space = widths[c] - text.length;
    if (aligns[c] === "right") return " ".repeat(space) + text;
    if (aligns[c] === "center") return " ".repeat(Math.floor(space / 2)) + text + " ".repeat(Math.ceil(space / 2));
    return text + " ".repeat(space);
  };
  const line = (cells: string[]) => `| ${cells.map(pad).join(" | ")} |`;
  const rule = aligns.map((a, c) => {
    const dashes = "-".repeat(widths[c] - (a === "center" ? 2 : a ? 1 : 0));
    return a === "center" ? `:${dashes}:` : a === "right" ? `${dashes}:` : a === "left" ? `:${dashes}` : dashes;
  });
  return [line(rows[0]), `| ${rule.join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

export function addRow(model: TableModel, after: number): void {
  model.rows.splice(after + 1, 0, model.aligns.map(() => ""));
}

export function addColumn(model: TableModel, after: number): void {
  model.rows.forEach((row) => row.splice(after + 1, 0, ""));
  model.aligns.splice(after + 1, 0, null);
}

/** Removes a body row; the header row and the last body row stay. */
export function removeRow(model: TableModel, row: number): boolean {
  if (row < 1 || model.rows.length <= 2) return false;
  model.rows.splice(row, 1);
  return true;
}

/** Removes a column; the last one stays. */
export function removeColumn(model: TableModel, column: number): boolean {
  if (model.aligns.length <= 1) return false;
  model.rows.forEach((row) => row.splice(column, 1));
  model.aligns.splice(column, 1);
  return true;
}
