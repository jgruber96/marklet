import { invoke, isTauri } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { baseName } from "../paths";

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

export const listFolder = (root: string) => invoke<TreeNode[]>("list_folder", { root });
export const createFile = (path: string) => invoke<void>("create_file", { path });
export const renamePath = (from: string, to: string) => invoke<void>("rename_path", { from, to });
export const trashPath = (path: string) => invoke<void>("trash_path", { path });

/** Starts the folder watcher; changes arrive as `fs-change` events. */
export async function watchFolder(root: string | null): Promise<void> {
  if (!isTauri()) return;
  if (root) await invoke("watch_folder", { root });
  else await invoke("unwatch_folder");
}

const trashName = navigator.userAgent.includes("Mac") ? "Trash" : "Recycle Bin";

export async function confirmTrash(path: string, isDir: boolean, unsaved: boolean): Promise<boolean> {
  const what = isDir ? `the folder “${baseName(path)}” and everything in it` : `“${baseName(path)}”`;
  const note = unsaved ? " Its unsaved changes will be lost." : "";
  return ask(`Move ${what} to the ${trashName}?${note}`, {
    title: "Marklet",
    kind: "warning",
    okLabel: `Move to ${trashName}`,
    cancelLabel: "Cancel",
  });
}
