import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

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

function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "..") parts.length > 1 && parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join(sep);
}

export function dirOf(path: string | null): string | null {
  if (!path) return null;
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : null;
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
