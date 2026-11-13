import { describe, expect, it } from "vitest";
import { dirOf, isInside, isMarkdownPath, joinPath, reroot, samePath, withMarkdownExt } from "../src/lib/paths";
import { findHeadings } from "../src/lib/sidebar/headings";
import { countWords } from "../src/lib/stores/document";

describe("paths", () => {
  it("joins and resolves on Windows and macOS paths", () => {
    expect(joinPath("C:\\notes\\work", "..\\assets\\a.png")).toBe("C:\\notes\\assets\\a.png");
    expect(joinPath("/Users/me/notes", "./sub/b.md")).toBe("/Users/me/notes/sub/b.md");
  });
  it("finds the folder of a file", () => {
    expect(dirOf("C:\\notes\\a.md")).toBe("C:\\notes");
    expect(dirOf(null)).toBeNull();
  });
  it("compares paths without case or slash direction", () => {
    expect(samePath("C:\\Notes\\A.md", "c:/notes/a.md")).toBe(true);
    expect(isInside("C:\\notes\\sub\\a.md", "c:/notes")).toBe(true);
    expect(isInside("C:\\notes-old\\a.md", "C:\\notes")).toBe(false);
  });
  it("moves a path under a renamed folder", () => {
    expect(reroot("C:\\a\\old\\x.md", "C:\\a\\old", "C:\\a\\new")).toBe("C:\\a\\new\\x.md");
  });
  it("recognizes and completes Markdown names", () => {
    expect(isMarkdownPath("Read Me.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("a.txt")).toBe(false);
    expect(withMarkdownExt("ideas")).toBe("ideas.md");
    expect(withMarkdownExt("ideas.txt")).toBe("ideas.txt");
  });
});

describe("outline headings", () => {
  it("reads ATX and setext headings and skips code fences", () => {
    const source = ["# One", "", "```", "# not a heading", "```", "Two", "---", "### **Three** `x`"].join("\n");
    expect(findHeadings(source)).toEqual([
      { level: 1, text: "One", line: 0 },
      { level: 2, text: "Two", line: 5 },
      { level: 3, text: "Three x", line: 7 },
    ]);
  });
});

describe("word count", () => {
  it("counts words, not symbols", () => {
    expect(countWords("Hello, world! It's 2 words-ish — ok?")).toBe(6);
    expect(countWords("")).toBe(0);
  });
});

import { addColumn, addRow, cleanCell, parseTable, removeColumn, removeRow, serializeTable } from "../src/lib/editor/tableModel";

describe("tables edited in the Rich view", () => {
  const source = ["| Name | Qty |", "| :-- | --: |", "| **Tea** | 2 |", "| a \\| b | 10"].join("\n");

  it("reads rows, alignment and escaped pipes", () => {
    expect(parseTable(source)).toEqual({ rows: [["Name", "Qty"], ["**Tea**", "2"], ["a \\| b", "10"]], aligns: ["left", "right"] });
  });
  it("rejects text that is not a table", () => {
    expect(parseTable("| a | b |\n| nope |")).toBeNull();
    expect(parseTable("just text")).toBeNull();
  });
  it("writes aligned Markdown that reads back the same", () => {
    const model = parseTable(source)!;
    const text = serializeTable(model);
    expect(text).toBe(["| Name    | Qty |", "| :------ | --: |", "| **Tea** |   2 |", "| a \\| b  |  10 |"].join("\n"));
    expect(parseTable(text)).toEqual(model);
  });
  it("adds and removes rows and columns, keeping the header and one of each", () => {
    const model = parseTable("| a |\n| - |\n| 1 |")!;
    addRow(model, 1);
    addColumn(model, 0);
    expect(serializeTable(model)).toBe("| a   |     |\n| --- | --- |\n| 1   |     |\n|     |     |");
    expect(removeRow(model, 0)).toBe(false);
    expect(removeRow(model, 2)).toBe(true);
    expect(removeRow(model, 1)).toBe(false);
    expect(removeColumn(model, 1)).toBe(true);
    expect(removeColumn(model, 0)).toBe(false);
  });
  it("keeps a typed cell on one line with its pipes escaped", () => {
    expect(cleanCell("  a | b\n c \\| d ")).toBe("a \\| b c \\| d");
  });
});

import { fuzzyFilter, fuzzyMatch } from "../src/lib/fuzzy";

describe("fuzzy matching for the command palette", () => {
  it("matches letters in order, ignoring case and spaces", () => {
    expect(fuzzyMatch("rdm", "Roadmap.md")?.positions).toEqual([0, 3, 4]);
    expect(fuzzyMatch("zoom in", "View: Zoom In")).not.toBeNull();
    expect(fuzzyMatch("xyz", "Roadmap.md")).toBeNull();
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
  });
  it("marks a plain substring as one run", () => {
    expect(fuzzyMatch("dark", "Theme: Dark")?.positions).toEqual([7, 8, 9, 10]);
  });
  it("ranks whole-word and early matches first, and keeps order on ties", () => {
    const names = ["Meeting notes.md", "Notes.md", "Keynote outline.md", "Ideas.md"];
    expect(fuzzyFilter("notes", names, (n) => n).map((r) => r.item)).toEqual(["Notes.md", "Meeting notes.md"]);
    expect(fuzzyFilter("note", names, (n) => n).map((r) => r.item)).toEqual(["Notes.md", "Meeting notes.md", "Keynote outline.md"]);
    expect(fuzzyFilter("", names, (n) => n).map((r) => r.item)).toEqual(names);
  });
});
