import type { MarkdownIt, StateBlock, StateInline } from "markdown-it";
import { embedsChanged, track } from "./embeds";
import { escapeHtml } from "./highlight";

/*
 * Math: `$…$` inline and `$$…$$` blocks, rendered with KaTeX. KaTeX and its
 * stylesheet load the first time a document uses math, so startup stays fast.
 */

type Katex = typeof import("katex").default;

let katex: Katex | null = null;
let starting: Promise<void> | null = null;

function load(): void {
  starting ??= track(
    Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
      ([mod]) => {
        katex = mod.default;
        embedsChanged();
      },
      (err) => console.error("Could not load math rendering", err),
    ),
  );
}

const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

/**
 * TeX → KaTeX HTML. KaTeX output relies on inline styles, so the caller must
 * insert it after sanitizing. Until KaTeX has loaded this returns the source
 * as code, and the preview re-renders when it is ready.
 */
export function mathHtml(tex: string, display: boolean): string {
  const source = display
    ? `<pre class="math-source"><code>${escapeHtml(tex.trim())}</code></pre>`
    : `<code class="math-source">${escapeHtml(tex)}</code>`;
  if (!katex) {
    load();
    return source;
  }
  const key = `${display ? "D" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    // throwOnError off: a typo renders in red in place instead of failing.
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false });
  } catch {
    html = source;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, html);
  return html;
}

/**
 * KaTeX's stylesheet for a standalone HTML export, with its fonts embedded as
 * data URIs (WOFF2 only) so the file needs nothing beside it.
 */
export async function katexStandaloneCss(): Promise<string> {
  const { default: css } = await import("katex/dist/katex.min.css?inline");
  const woff2 = /url\((["']?)([^)"']+\.woff2[^)"']*)\1\)/;
  const urls = new Set<string>();
  for (const [, sources] of css.matchAll(/src:([^;}]+)/g)) {
    const m = woff2.exec(sources);
    if (m && !m[2].startsWith("data:")) urls.add(m[2]);
  }
  const embedded = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        embedded.set(url, `data:font/woff2;base64,${btoa(binary)}`);
      } catch {
        // Leave this font out; the browser falls back to a system font.
      }
    }),
  );
  return css.replace(/src:([^;}]+)/g, (all, sources: string) => {
    const m = woff2.exec(sources);
    if (!m) return all;
    const data = m[2].startsWith("data:") ? m[2] : embedded.get(m[2]);
    return data ? `src:url(${data}) format("woff2")` : all;
  });
}

// ---- Markdown syntax ----

const isSpace = (code: number) => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const isDigit = (code: number) => code >= 0x30 && code <= 0x39;

/**
 * `$…$`. To leave prices alone ("$5 and $10"), the opening `$` must not be
 * followed by a space and the closing `$` must not follow a space or precede
 * a digit.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, posMax } = state;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;

  const literal = (text: string) => {
    if (!silent) state.pending += text;
    state.pos += text.length;
    return true;
  };
  if (start + 1 >= posMax || isSpace(src.charCodeAt(start + 1))) return literal("$");
  if (src.charCodeAt(start + 1) === 0x24) return literal("$$");

  // The closing `$`: the next one not escaped by an odd run of backslashes.
  let end = start + 1;
  for (;;) {
    end = src.indexOf("$", end);
    if (end === -1 || end >= posMax) return literal("$");
    let slashes = 0;
    while (src.charCodeAt(end - 1 - slashes) === 0x5c) slashes++;
    if (slashes % 2 === 0) break;
    end++;
  }
  if (isSpace(src.charCodeAt(end - 1)) || (end + 1 < posMax && isDigit(src.charCodeAt(end + 1)))) return literal("$");

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
}

/** `$$` … `$$`, on one line or opening and closing a block of lines. */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const { src } = state;
  const lineText = (line: number) => src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const first = lineText(startLine);
  if (!first.startsWith("$$")) return false;
  if (silent) return true;

  const parts: string[] = [];
  let line = startLine;
  const opening = first.slice(2);
  if (opening.trimEnd().endsWith("$$") && opening.trim().length > 2) {
    parts.push(opening.trimEnd().slice(0, -2)); // $$ x $$ on one line
  } else {
    if (opening.trim()) parts.push(opening);
    for (line = startLine + 1; line < endLine; line++) {
      // A line outdented from the block's container (list item, quote) ends it.
      if (state.sCount[line] < state.blkIndent && lineText(line).trim()) {
        line--;
        break;
      }
      const text = lineText(line);
      if (text.trimEnd().endsWith("$$")) {
        const before = text.trimEnd().slice(0, -2);
        if (before.trim()) parts.push(before);
        break;
      }
      parts.push(text);
    }
    if (line >= endLine) line = endLine - 1; // unclosed: runs to the end, like a code fence
  }

  state.line = line + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.markup = "$$";
  token.content = parts.join("\n");
  token.map = [startLine, state.line];
  return true;
}

/** Adds `math_inline` and `math_block` tokens; the renderer rules live in render.ts. */
export function mathSyntax(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
}
