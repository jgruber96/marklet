import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { baseName, dirOf, joinPath, withMarkdownExt } from "../paths";
import { isMobile } from "../platform";

export type LineEnding = "\n" | "\r\n";

/** The open file and the on-disk format it must be written back in. */
export interface Doc {
  path: string | null;
  lineEnding: LineEnding;
  bom: boolean;
  /** Text as last loaded or saved, with `\n` line endings; drives the unsaved dot. */
  savedText: string;
  /** Shown until the file is first saved. */
  untitledName: string;
}

export const untitledDoc = (untitledName = "Untitled.md"): Doc => ({
  path: null,
  lineEnding: "\n",
  bom: false,
  savedText: "",
  untitledName,
});

export const docName = (doc: Doc): string => (doc.path ? baseName(doc.path) : doc.untitledName);

const markdownFilter = [{ name: "Markdown", extensions: ["md", "markdown"] }];

export async function pickFileToOpen(): Promise<string | null> {
  const picked = await open({ multiple: false, directory: false, filters: markdownFilter });
  return typeof picked === "string" ? picked : null;
}

/**
 * Where a file goes on iOS, which has no save dialog: `name` in `dir`, or with " 2", " 3"… added
 * when that is taken. The user renames it afterwards if they like (press and hold it in the sidebar).
 */
export async function freePath(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const path = joinPath(dir, n === 1 ? name : `${stem} ${n}${ext}`);
    if ((await invoke<string>("path_kind", { path })) === "none") return path;
  }
}

/**
 * Save dialog; a new file starts out in `folder` (the workspace) when there is one. iOS has no
 * save dialog: a new note goes into Marklet's folder under its name, and Save As makes a copy beside it.
 */
export async function pickSavePath(doc: Doc, folder: string | null): Promise<string | null> {
  const name = docName(doc);
  if (isMobile) {
    const dir = dirOf(doc.path) ?? folder;
    return dir ? freePath(dir, withMarkdownExt(name)) : null;
  }
  return save({ defaultPath: !doc.path && folder ? joinPath(folder, name) : doc.path ?? name, filters: markdownFilter });
}

export async function readDoc(path: string): Promise<{ doc: Doc; text: string }> {
  const file = await invoke<{ text: string; lineEnding: LineEnding; bom: boolean }>("read_file", { path });
  return {
    doc: { path, lineEnding: file.lineEnding, bom: file.bom, savedText: file.text, untitledName: "" },
    text: file.text,
  };
}

export async function writeDoc(path: string, text: string, doc: Doc): Promise<void> {
  await invoke("write_file", { path, text, lineEnding: doc.lineEnding, bom: doc.bom });
}

export type UnsavedChoice = "save" | "discard" | "cancel";

export async function askToSave(doc: Doc): Promise<UnsavedChoice> {
  const result = await message(`Do you want to save the changes you made to ${docName(doc)}?`, {
    title: "Marklet",
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  if (result === "Save" || result === "Yes") return "save";
  if (result === "Don't Save" || result === "No") return "discard";
  return "cancel";
}

export async function showError(err: unknown): Promise<void> {
  await message(String(err), { title: "Marklet", kind: "error" });
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches ? matches.length : 0;
}
