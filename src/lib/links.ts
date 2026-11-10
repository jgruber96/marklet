import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isAbsolutePath, isMarkdownPath, joinPath } from "./paths";

/**
 * Follows a link from a document: web and mail addresses open in the system
 * browser or mail app, and a link to another Markdown file is handed to
 * `openFile` (its #fragment is ignored for now). Anything else is left alone.
 * Returns whether the link went somewhere.
 */
export function followLink(href: string, baseDir: string | null, openFile: (path: string) => void): boolean {
  if (/^(https?|mailto):/i.test(href)) {
    if (isTauri()) void openUrl(href);
    else window.open(href, "_blank", "noopener");
    return true;
  }
  if (href.startsWith("#") || (/^[a-z][a-z0-9+.-]*:/i.test(href) && !isAbsolutePath(href))) return false;
  let path = href.split("#")[0];
  try {
    path = decodeURI(path);
  } catch {
    // Use as-is.
  }
  if (!isMarkdownPath(path)) return false;
  if (!isAbsolutePath(path)) {
    if (!baseDir) return false;
    path = joinPath(baseDir, path);
  }
  openFile(path);
  return true;
}
