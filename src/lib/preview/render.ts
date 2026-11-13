import MarkdownIt, { type Token } from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { fenceTag, languageForTag } from "../languages";
import { escapeHtml, highlightCode } from "./highlight";
import { joinPath } from "../paths";
import { mathHtml, mathSyntax } from "./math";
import { beginDiagramPass, diagramHtml } from "./mermaid";

interface RenderEnv {
  /** Folder of the open file, for resolving relative image paths. */
  baseDir: string | null;
  /** Trusted HTML (math, diagrams) to put back after sanitizing; see `slot`. */
  slots: string[];
  slotKey: string;
  diagrams: number;
  /** A piece of a document drawn inside the editor (Rich view), not a whole preview pass. */
  fragment: boolean;
  [key: string | symbol]: unknown;
}

const md = new MarkdownIt({ html: true, linkify: true });
md.use(anchor, { tabIndex: false });
md.use(taskLists);
md.use(mathSyntax);

/**
 * KaTeX and Mermaid output needs the inline styles the sanitizer strips, and
 * both libraries sanitize their own output. So the Markdown pass leaves an
 * empty placeholder, and `renderMarkdown` swaps the real HTML in afterwards.
 * The key is random per render, so HTML typed into a document cannot name one.
 */
function slot(env: RenderEnv, tag: "span" | "div", html: string): string {
  env.slots.push(html);
  return `<${tag} data-slot="${env.slotKey}-${env.slots.length - 1}"></${tag}>`;
}

const lineAttr = (token: Token) => {
  const line = token.attrGet("data-line");
  return line !== null ? ` data-line="${line}"` : "";
};

md.renderer.rules.math_inline = (tokens, idx, _options, env) => slot(env as RenderEnv, "span", mathHtml(tokens[idx].content, false));
md.renderer.rules.math_block = (tokens, idx, _options, env) =>
  `<div class="math-block"${lineAttr(tokens[idx])}>${slot(env as RenderEnv, "div", mathHtml(tokens[idx].content, true))}</div>\n`;

// Tag every rendered block with its 0-based source line so the preview can be
// scrolled in step with the editor (see scrollSync.ts).
md.core.ruler.push("source_lines", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting >= 0 && token.type !== "inline" && token.type !== "html_block") {
      token.attrSet("data-line", String(token.map[0]));
    }
  }
});

// Fenced code: a header with the language label and a Copy button, then the
// Shiki-highlighted body, or plain escaped text for untagged or unknown
// languages (and while a grammar is still loading).
md.renderer.rules.fence = (tokens, idx, _options, rawEnv) => {
  const token = tokens[idx];
  const tag = fenceTag(token.info);
  const env = rawEnv as RenderEnv;
  if (tag === "mermaid") {
    return `<div class="mermaid-block"${lineAttr(token)}>${slot(env, "div", diagramHtml(token.content, env.fragment ? -1 : env.diagrams++))}</div>\n`;
  }
  const lang = languageForTag(tag);
  const body = highlightCode(token.content, tag) ?? escapeHtml(token.content.replace(/\n$/, ""));
  const label = escapeHtml(lang?.label ?? (tag || "Text"));
  return (
    `<div class="code-block"${lineAttr(token)}>` +
    `<div class="code-head"><span class="code-lang">${label}</span>` +
    `<button type="button" class="code-copy">Copy</button></div>` +
    `<pre tabindex="0"><code>${body}</code></pre></div>\n`
  );
};

const renderImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");
  if (typeof src === "string") token.attrSet("src", resolveLocalSrc(src, (env as RenderEnv | undefined)?.baseDir ?? null));
  return renderImage(tokens, idx, options, env, self);
};

const hasScheme = (s: string) => /^[a-z][a-z0-9+.-]*:/i.test(s) && !isWindowsAbsolute(s);
const isWindowsAbsolute = (s: string) => /^[a-z]:[\\/]/i.test(s) || s.startsWith("\\\\");

/** Maps a relative or absolute file path in an image to a URL the web view can load. */
export function resolveLocalSrc(src: string, baseDir: string | null): string {
  if (!isTauri() || hasScheme(src) || src.startsWith("#") || src.startsWith("//")) return src;
  let path: string;
  try {
    path = decodeURI(src);
  } catch {
    path = src;
  }
  if (!isWindowsAbsolute(path) && !path.startsWith("/")) {
    if (!baseDir) return src;
    path = joinPath(baseDir, path);
  }
  return convertFileSrc(path);
}

// DOMPurify's default URI allow-list plus `asset:`, which is how Tauri serves
// local images on macOS.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|asset|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * Markdown → sanitized HTML for the preview. `docKey` identifies the open
 * document (a diagram being edited keeps showing its previous drawing); null,
 * for exports, shows only finished output.
 */
export function renderMarkdown(source: string, baseDir: string | null, docKey: unknown = null): string {
  beginDiagramPass(docKey);
  return render(source, baseDir, false);
}

/** One block of a document (a table, a diagram, a formula) for the Rich view; leaves the preview's diagram pass alone. */
export function renderFragment(source: string, baseDir: string | null): string {
  return render(source, baseDir, true);
}

/** The inline Markdown of one table cell, for editing tables in the Rich view. */
export function renderInlineFragment(source: string, baseDir: string | null): string {
  return render(source, baseDir, true, true);
}

function render(source: string, baseDir: string | null, fragment: boolean, inline = false): string {
  const env: RenderEnv = { baseDir, slots: [], slotKey: crypto.randomUUID(), diagrams: 0, fragment };
  // Task boxes are read-only pictures of the source; give each a name for screen readers.
  const raw = (inline ? md.renderInline(source, env) : md.render(source, env)).replaceAll(
    'class="task-list-item-checkbox"',
    'class="task-list-item-checkbox" aria-label="Task"',
  );
  const html = DOMPurify.sanitize(raw, {
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ["style", "form"],
    FORBID_ATTR: ["style"],
  });
  if (!env.slots.length) return html;
  const placeholder = new RegExp(`<(span|div) data-slot="${env.slotKey}-(\\d+)"></\\1>`, "g");
  return html.replace(placeholder, (_all, _tag, i: string) => env.slots[Number(i)] ?? "");
}
