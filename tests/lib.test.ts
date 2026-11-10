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
