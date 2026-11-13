// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { followLink } from "../src/lib/links";

describe("following links", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens web and mail links outside the app", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const openFile = vi.fn();
    expect(followLink("https://example.com/a", "C:\\notes", openFile)).toBe(true);
    expect(followLink("mailto:someone@example.com", null, openFile)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    expect(openFile).not.toHaveBeenCalled();
  });

  it("opens a linked note in a tab, relative to the current file", () => {
    const openFile = vi.fn();
    expect(followLink("sub/Other%20Note.md#section", "C:\\notes", openFile)).toBe(true);
    expect(openFile).toHaveBeenCalledWith("C:\\notes\\sub\\Other Note.md");
    expect(followLink("/Users/me/abs.md", null, openFile)).toBe(true);
    expect(openFile).toHaveBeenLastCalledWith("/Users/me/abs.md");
  });

  it("leaves everything else alone", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const openFile = vi.fn();
    for (const href of ["#heading", "ftp://example.com/x", "javascript:alert(1)", "file:///C:/secret.md", "report.pdf", "relative.md"]) {
      // "relative.md" has no folder to resolve against here.
      expect(followLink(href, null, openFile), href).toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});
