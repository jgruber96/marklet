import { invoke, isTauri } from "@tauri-apps/api/core";
import type { LineEnding } from "../stores/document";

/*
 * Recovery copies: while a tab has unsaved changes, its text is kept in a
 * small file in the app's data folder (see src-tauri/src/recovery.rs). A
 * normal save, discard or quit removes the copy; copies still there at the
 * next launch mean the app did not close properly, and are offered back.
 */

export interface RecoveryCopy {
  /** The file the tab belongs to, or null for a note that was never saved. */
  path: string | null;
  untitledName: string;
  text: string;
  lineEnding: LineEnding;
  bom: boolean;
}

/** Copies are named `<run>-<tab>`; anything from another run was left behind by an unclean exit. */
const run = Date.now().toString(36);
const nameOf = (tabId: number) => `${run}-${tabId}`;

export async function writeRecovery(tabId: number, copy: RecoveryCopy): Promise<void> {
  if (isTauri()) await invoke("recovery_write", { name: nameOf(tabId), data: JSON.stringify(copy) });
}

export async function removeRecovery(tabId: number): Promise<void> {
  if (isTauri()) await invoke("recovery_remove", { name: nameOf(tabId) });
}

export interface LeftBehind {
  copies: RecoveryCopy[];
  /** Removes the left-behind files, once they have been restored (and copied again) or declined. */
  clear(): Promise<void>;
}

const isCopy = (v: unknown): v is RecoveryCopy => {
  const c = v as Partial<RecoveryCopy> | null;
  return (
    !!c &&
    typeof c === "object" &&
    (c.path === null || typeof c.path === "string") &&
    typeof c.untitledName === "string" &&
    typeof c.text === "string" &&
    (c.lineEnding === "\n" || c.lineEnding === "\r\n") &&
    typeof c.bom === "boolean"
  );
};

/** Copies left by an earlier run that did not close properly. */
export async function leftBehind(): Promise<LeftBehind> {
  if (!isTauri()) return { copies: [], clear: async () => {} };
  const files = (await invoke<[string, string][]>("recovery_list")).filter(([name]) => !name.startsWith(`${run}-`));
  const copies: RecoveryCopy[] = [];
  for (const [, data] of files) {
    try {
      const copy: unknown = JSON.parse(data);
      if (isCopy(copy)) copies.push(copy);
    } catch {
      // A damaged copy is dropped with the rest.
    }
  }
  return {
    copies,
    clear: async () => {
      for (const [name] of files) await invoke("recovery_remove", { name }).catch(() => {});
    },
  };
}
