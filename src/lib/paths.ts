/** Path helpers that work on both Windows (`C:\a\b`) and macOS (`/a/b`) paths. */

const sepOf = (path: string) => (path.includes("\\") ? "\\" : "/");

/** Joins a relative path onto a folder, resolving `.` and `..`. */
export function joinPath(dir: string, rel: string): string {
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "..") parts.length > 1 && parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join(sepOf(dir));
}

export function dirOf(path: string | null): string | null {
  if (!path) return null;
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : null;
}

export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export const isAbsolutePath = (path: string) => /^[a-z]:[\\/]/i.test(path) || /^[\\/]/.test(path);

/** Windows and macOS file systems are case-insensitive by default. */
const normalize = (path: string) => path.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();

export const samePath = (a: string, b: string) => normalize(a) === normalize(b);

/** True when `path` is `dir` itself or anything inside it. */
export function isInside(path: string, dir: string): boolean {
  const p = normalize(path);
  const d = normalize(dir);
  return p === d || p.startsWith(d + "/");
}

/** Re-roots `path` from under `from` to under `to` (after a folder rename). */
export const reroot = (path: string, from: string, to: string) => to + path.slice(from.replace(/[\\/]+$/, "").length);

/**
 * iOS keeps an app's files under a folder whose name can change between installs
 * (…/Application/<id>/Documents). Moves a saved path that pointed into an earlier
 * Documents folder into `documents`; any other path comes back unchanged.
 */
export function intoDocuments(path: string, documents: string): string {
  const marker = "/Documents/";
  const at = path.indexOf(marker);
  if (at < 0 || isInside(path, documents)) return path;
  return documents.replace(/\/+$/, "") + path.slice(at + marker.length - 1);
}

export const isMarkdownPath = (path: string) => /\.(md|markdown)$/i.test(path);

/** Adds `.md` when a typed file name has no extension at all. */
export const withMarkdownExt = (name: string) => (/\.[a-z0-9]{1,10}$/i.test(name) ? name : `${name}.md`);
