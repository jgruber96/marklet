import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";

export type LineEnding = "\n" | "\r\n";

/** The open file and the on-disk format it must be written back in. */
export interface Doc {
  path: string | null;
  lineEnding: LineEnding;
  bom: boolean;
  /** Text as last loaded or saved, with `\n` line endings; drives the unsaved dot. */
  savedText: string;
}

export const untitledDoc = (): Doc => ({ path: null, lineEnding: "\n", bom: false, savedText: "" });

export function docName(doc: Doc): string {
  if (!doc.path) return "Untitled.md";
  return doc.path.split(/[\\/]/).pop() ?? doc.path;
}

const markdownFilter = [{ name: "Markdown", extensions: ["md", "markdown"] }];

export async function pickFileToOpen(): Promise<string | null> {
  const picked = await open({ multiple: false, directory: false, filters: markdownFilter });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(doc: Doc): Promise<string | null> {
  return save({ defaultPath: docName(doc), filters: markdownFilter });
}

export async function readDoc(path: string): Promise<{ doc: Doc; text: string }> {
  const file = await invoke<{ text: string; lineEnding: LineEnding; bom: boolean }>("read_file", { path });
  return { doc: { path, lineEnding: file.lineEnding, bom: file.bom, savedText: file.text }, text: file.text };
}

export async function writeDoc(path: string, text: string, doc: Doc): Promise<void> {
  await invoke("write_file", { path, text, lineEnding: doc.lineEnding, bom: doc.bom });
}

export type UnsavedChoice = "save" | "discard" | "cancel";

export async function askToSave(doc: Doc): Promise<UnsavedChoice> {
  const result = await message(`Do you want to save the changes you made to ${docName(doc)}?`, {
    title: "Nova MD",
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  if (result === "Save" || result === "Yes") return "save";
  if (result === "Don't Save" || result === "No") return "discard";
  return "cancel";
}

export async function showError(err: unknown): Promise<void> {
  await message(String(err), { title: "Nova MD", kind: "error" });
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches ? matches.length : 0;
}
