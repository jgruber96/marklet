import { invoke, isTauri } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { baseName, intoDocuments } from "../paths";
import { isMacOS, isMobile } from "../platform";

/** A Markdown file, or a folder that holds some, as listed by the Rust side. */
export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

let documents: Promise<string | null> | null = null;

/** iOS: the app's Documents folder, which is the workspace and what the Files app shows. Null on desktop. */
export function documentsDir(): Promise<string | null> {
  documents ??= isMobile && isTauri() ? invoke<string>("mobile_workspace") : Promise.resolve(null);
  return documents;
}

/** A path saved in an earlier run (open tabs, recent files, recovery copies), as it is now: see intoDocuments. */
export async function currentPath(path: string): Promise<string> {
  const docs = await documentsDir();
  return docs ? intoDocuments(path, docs) : path;
}

export const listFolder = (root: string) => invoke<TreeNode[]>("list_folder", { root });
export const createFile = (path: string) => invoke<void>("create_file", { path });
export const renamePath = (from: string, to: string) => invoke<void>("rename_path", { from, to });
export const trashPath = (path: string) => invoke<void>("trash_path", { path });

/** Starts the folder watcher; changes arrive as `fs-change` events. Desktop only. */
export async function watchFolder(root: string | null): Promise<void> {
  if (!isTauri() || isMobile) return;
  if (root) await invoke("watch_folder", { root });
  else await invoke("unwatch_folder");
}

const trashName = isMacOS ? "Trash" : "Recycle Bin";

export async function confirmTrash(path: string, isDir: boolean, unsaved: boolean): Promise<boolean> {
  const what = isDir ? `the folder “${baseName(path)}” and everything in it` : `“${baseName(path)}”`;
  const note = unsaved ? " Its unsaved changes will be lost." : "";
  // iOS has no system trash (the file goes into Marklet's own data folder, out of sight).
  if (isMobile) return ask(`Delete ${what}?${note}`, { title: "Marklet", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" });
  return ask(`Move ${what} to the ${trashName}?${note}`, {
    title: "Marklet",
    kind: "warning",
    okLabel: `Move to ${trashName}`,
    cancelLabel: "Cancel",
  });
}
