// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderInlineFragment, renderMarkdown } from "../src/lib/preview/render";

const render = (source: string) => renderMarkdown(source, null);

describe("preview rendering", () => {
  it("strips anything that could run code or restyle the app", () => {
    const html = render(
      ['<script>alert(1)</script>', '<img src="x" onerror="alert(1)">', "[click](javascript:alert(1))", '<p style="position:fixed">styled</p>', "<style>body{display:none}</style>", '<form action="https://example.com"><input name="q"></form>'].join("\n\n"),
    );
    expect(html).not.toMatch(/<script|onerror|href="javascript:|style=|<style|<form/i);
    expect(html).not.toContain("<a"); // the javascript: link is left as plain text
    expect(html).toContain("styled");
  });

  it("does not let a document fill in a trusted placeholder", () => {
    // Math and diagrams are put back after sanitizing, by a key that is random per render.
    const html = render('<span data-slot="forged-0"></span> and $x$');
    expect(html).toContain('data-slot="forged-0"');
  });

  it("renders $…$ as math but leaves prices and code alone", () => {
    const isMath = (html: string) => /katex|math-source/.test(html);
    expect(isMath(render("Euler: $e^{i\\pi} + 1 = 0$"))).toBe(true);
    expect(isMath(render("It costs $5 and then $10 more."))).toBe(false);
    expect(isMath(render("A price of $10, plus `$not math$`."))).toBe(false);
    expect(render("A price of $10, plus `$not math$`.")).toContain("<code>$not math$</code>");
    expect(isMath(render("$$\nx^2\n$$"))).toBe(true);
  });

  it("tags blocks with their source line for scroll sync", () => {
    const html = render("# Hello World\n\nA paragraph.\n\n- item");
    expect(html).toContain('<h1 id="hello-world" data-line="0"');
    expect(html).toMatch(/<p data-line="2">/);
    expect(html).toMatch(/<ul[^>]*data-line="4"/);
  });

  it("draws task items as named, read-only checkboxes", () => {
    const html = render("- [x] done\n- [ ] open");
    expect(html.match(/aria-label="Task"/g)).toHaveLength(2);
    expect(html.match(/disabled/g)).toHaveLength(2);
    expect(html.match(/checked/g)).toHaveLength(1);
  });

  it("gives code blocks a language label, a Copy button and keyboard access", () => {
    const html = render("```ts\nconst a = 1;\n```");
    expect(html).toContain('<span class="code-lang">TypeScript</span>');
    expect(html).toContain('class="code-copy"');
    expect(html).toContain('<pre tabindex="0">');
    expect(html).toContain("const a = 1;");
  });

  it("turns a mermaid block into a diagram slot, not code", () => {
    const html = render("```mermaid\ngraph LR\n  A --> B\n```");
    expect(html).toContain('class="mermaid-block"');
    expect(html).not.toContain("code-block");
  });

  it("renders one table cell's Markdown without a paragraph around it", () => {
    expect(renderInlineFragment("**b** and `c`", null)).toBe("<strong>b</strong> and <code>c</code>");
  });
});
