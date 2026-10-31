import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { fenceTag, languageForTag } from "../languages";
import { escapeHtml, highlightCode } from "./highlight";
import { joinPath } from "../paths";

interface RenderEnv {
  /** Folder of the open file, for resolving relative image paths. */
  baseDir: string | null;
  [key: string | symbol]: unknown;
}

const md = new MarkdownIt({ html: true, linkify: true });
md.use(anchor, { tabIndex: false });
md.use(taskLists);

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
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const tag = fenceTag(token.info);
  const lang = languageForTag(tag);
  const body = highlightCode(token.content, tag) ?? escapeHtml(token.content.replace(/\n$/, ""));
  const label = escapeHtml(lang?.label ?? (tag || "Text"));
  const line = token.attrGet("data-line");
  return (
    `<div class="code-block"${line !== null ? ` data-line="${line}"` : ""}>` +
    `<div class="code-head"><span class="code-lang">${label}</span>` +
    `<button type="button" class="code-copy">Copy</button></div>` +
    `<pre><code>${body}</code></pre></div>\n`
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
function resolveLocalSrc(src: string, baseDir: string | null): string {
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

/** Markdown → sanitized HTML for the preview. */
export function renderMarkdown(source: string, baseDir: string | null): string {
  const env: RenderEnv = { baseDir };
  return DOMPurify.sanitize(md.render(source, env), {
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ["style", "form"],
    FORBID_ATTR: ["style"],
  });
}
