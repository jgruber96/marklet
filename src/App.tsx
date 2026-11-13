import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorView } from "@codemirror/view";
import { ask } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { EditorState, StateEffect } from "@codemirror/state";
import { Editor, type EditorHandle } from "./lib/editor/Editor";
import { type FormatKind, formatCommands } from "./lib/editor/format";
import { importImages, isImagePath, saveImages } from "./lib/editor/images";
import type { SearchHit } from "./lib/sidebar/FolderSearch";
import { setSpellCheck } from "./lib/editor/spellcheck";
import { configureRich, setRich } from "./lib/editor/rich";
import { setFocusMode } from "./lib/editor/focus";
import { openSearchPanel } from "@codemirror/search";
import { checkForUpdate } from "./lib/update";
import { Sidebar } from "./lib/sidebar/Sidebar";
import {
  type Doc,
  askToSave,
  countWords,
  docName,
  pickFileToOpen,
  pickSavePath,
  readDoc,
  showError,
  untitledDoc,
  writeDoc,
} from "./lib/stores/document";
import {
  type ThemeSetting,
  applyTheme,
  type ViewMode,
  flushSettings,
  isThemeSetting,
  loadAutosave,
  loadSpellCheck,
  saveSpellCheck,
  loadTheme,
  isViewMode,
  ACCENTS,
  ACCENT_LABELS,
  DEFAULT_LOOK,
  type Look,
  applyLook,
  loadLook,
  saveLook,
  RECENT_LIMIT,
  ZOOM_STEPS,
  applyZoom,
  loadRecent,
  loadZoom,
  saveRecent,
  saveZoom,
  loadViewMode,
  saveAutosave,
  saveTheme,
  saveViewMode,
  setMenuChecked,
  syncThemeMenu,
  type AccentSetting,
  applyAccent,
  checkMenuGroup,
  isAccentSetting,
  loadAccent,
  saveAccent,
} from "./lib/stores/settings";
import { type ExportKind, buildHtml, pdfNeedsPath, pickExportPath, printPdf, writeHtml } from "./lib/export/export";
import {
  type TreeNode,
  confirmTrash,
  createFile,
  listFolder,
  pickFolder,
  renamePath,
  trashPath,
  watchFolder,
} from "./lib/stores/workspace";
import { loadSession, saveSession } from "./lib/tabs/session";
import { leftBehind, removeRecovery, writeRecovery } from "./lib/tabs/recovery";
import { baseName, dirOf, isInside, isMarkdownPath, joinPath, reroot, samePath, withMarkdownExt } from "./lib/paths";
import { Preview, type PreviewHandle } from "./lib/preview/Preview";
import { ScrollSync } from "./lib/preview/scrollSync";
import { Toolbar } from "./components/Toolbar";
import { TabStrip } from "./components/TabStrip";
import { StatusBar } from "./components/StatusBar";
import { Splitter } from "./components/Splitter";
import { SettingsDialog } from "./components/SettingsDialog";
import { PopupMenuHost, type MenuItem } from "./components/PopupMenu";

const isMac = navigator.userAgent.includes("Mac");

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Autosave runs after this long without typing (brief: 2 seconds). */
const AUTOSAVE_IDLE_MS = 2000;

interface Tab {
  id: number;
  doc: Doc;
  /** Editor state while the tab is in the background; the view owns the front tab's state. */
  state: EditorState;
  scroll?: StateEffect<unknown>;
  dirty: boolean;
  /** The file was deleted or moved away on disk; saving writes it back. */
  missing: boolean;
  /** Autosave failed for this tab; it waits for a manual save so errors don't repeat. */
  autosaveFailed?: boolean;
  /** The text in this tab's recovery copy, while it has one. */
  recovered?: string;
}

export default function App() {
  const editor = useRef<EditorHandle>(null);
  const panes = useRef<HTMLDivElement>(null);
  const preview = useRef<PreviewHandle>(null);
  const scrollSync = useRef<ScrollSync | null>(null);

  // Tabs are mutable records; `render` repaints after a change.
  const tabs = useRef<Tab[]>([]);
  const activeId = useRef(0);
  const nextId = useRef(1);
  const [, render] = useReducer((n: number) => n + 1, 0);

  const root = useRef<string | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const expanded = useRef(new Set<string>());

  const [words, setWords] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1, selected: 0 });
  const [autosave, setAutosaveState] = useState(true);
  const autosaveOn = useRef(true);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const scrollListeners = useRef(new Set<() => void>());
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [split, setSplit] = useState(0.5);
  const [viewMode, setViewModeState] = useState<ViewMode>("split");
  const [source, setSource] = useState("");
  const [zoom, setZoomState] = useState(1);
  const [searchFocus, setSearchFocus] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Focus mode: the window shows only the text, full screen (View › Focus Mode). */
  const [focus, setFocusState] = useState(false);
  const focusOn = useRef(false);
  const [look, setLookState] = useState<Look>(DEFAULT_LOOK);
  /** File › Open Recent, most recent first. */
  const recent = useRef<string[]>([]);

  const activeTab = (): Tab | undefined => tabs.current.find((t) => t.id === activeId.current);
  // The Rich view shows images in place and needs the open file's folder (reads refs, so it stays current).
  configureRich({
    baseDir: () => dirOf(activeTab()?.doc.path ?? null),
    openFile: (path) => void exclusive(() => actions.current.openFiles([path])),
  });
  const findTab = (path: string) => tabs.current.find((t) => t.doc.path && samePath(t.doc.path, path));

  const textOf = (tab: Tab): string => {
    const view = editor.current?.view;
    return tab.id === activeId.current && view ? view.state.doc.toString() : tab.state.doc.toString();
  };

  const updateDirty = (tab: Tab) => {
    tab.dirty = tab.missing || textOf(tab) !== tab.doc.savedText;
    scheduleRecovery();
    render();
  };

  // ---- Crash recovery: a copy of every unsaved tab, removed again on a save, discard or clean exit ----

  const recoveryTimer = useRef<number | undefined>(undefined);
  /** Set once the app is on its way out, so a late timer cannot write copies back. */
  const leaving = useRef(false);

  /** Brings the copies in line with the tabs: one per unsaved tab, none for the rest. */
  const syncRecovery = async () => {
    if (leaving.current) return;
    for (const tab of [...tabs.current]) {
      const text = textOf(tab);
      const unsaved = tab.missing || text !== tab.doc.savedText;
      try {
        if (unsaved && tab.recovered !== text) {
          const { path, untitledName, lineEnding, bom } = tab.doc;
          await writeRecovery(tab.id, { path, untitledName, text, lineEnding, bom });
          tab.recovered = text;
        } else if (!unsaved && tab.recovered !== undefined) {
          await removeRecovery(tab.id);
          tab.recovered = undefined;
        }
      } catch (err) {
        console.warn(err); // Recovery is a safety net; it never gets in the way of editing.
      }
    }
  };

  const scheduleRecovery = () => {
    clearTimeout(recoveryTimer.current);
    recoveryTimer.current = window.setTimeout(() => void syncRecovery(), 800);
  };

  /** Removes the copies of tabs that are going away (closed, or the app is quitting). */
  const forgetRecovery = async (list: Tab[]) => {
    for (const tab of list) {
      if (tab.recovered === undefined) continue;
      tab.recovered = undefined;
      await removeRecovery(tab.id).catch(console.warn);
    }
  };

  /** At startup: offers back whatever an unclean exit left behind. */
  const restoreLeftBehind = async () => {
    const { copies, clear } = await leftBehind();
    if (copies.length) {
      const what = copies.length === 1 ? "the unsaved document" : `${copies.length} unsaved documents`;
      const restore = await ask(`Marklet did not close properly last time. Restore ${what}?`, {
        title: "Marklet",
        kind: "warning",
        okLabel: "Restore",
        cancelLabel: "Discard",
      });
      if (restore) {
        for (const copy of copies) {
          let tab = copy.path ? findTab(copy.path) : undefined;
          if (tab) {
            replaceText(tab, copy.text);
          } else if (copy.path) {
            try {
              tab = addTab((await readDoc(copy.path)).doc, copy.text);
            } catch {
              // The file itself is gone: the text comes back as an unsaved tab that saves to the old place.
              tab = addTab({ path: copy.path, lineEnding: copy.lineEnding, bom: copy.bom, savedText: "", untitledName: "" }, copy.text);
              tab.missing = true;
            }
          } else {
            const taken = tabs.current.some((t) => !t.doc.path && !isPristine(t) && t.doc.untitledName === copy.untitledName);
            tab = addTab(untitledDoc(taken || !copy.untitledName ? nextUntitledName() : copy.untitledName), copy.text);
          }
          updateDirty(tab);
        }
        // Copied again under this run before the old files go.
        await syncRecovery();
      }
    }
    await clear();
  };

  const persistSession = () => {
    const files = tabs.current.filter((t) => t.doc.path);
    void saveSession({
      workspace: root.current,
      expanded: [...expanded.current],
      files: files.map((t) => t.doc.path!),
      active: Math.max(0, files.findIndex((t) => t.id === activeId.current)),
    });
  };

  // ---- Tabs ----

  /** Brings a tab to the front, parking the current one's editor state and scroll. */
  const show = (id: number) => {
    const view = editor.current?.view;
    const current = activeTab();
    if (current && view && current.id !== id) {
      current.state = view.state;
      current.scroll = view.scrollSnapshot();
    }
    activeId.current = id;
    const tab = activeTab();
    if (!tab) return;
    editor.current?.showState(tab.state, tab.scroll);
    const text = textOf(tab);
    setWords(countWords(text));
    setSource(text);
    scrollSync.current?.followEditor();
    render();
    persistSession();
  };

  const nextUntitledName = () => {
    const used = new Set(tabs.current.filter((t) => !t.doc.path).map((t) => t.doc.untitledName));
    for (let n = 1; ; n++) {
      const name = n === 1 ? "Untitled.md" : `Untitled-${n}.md`;
      if (!used.has(name)) return name;
    }
  };

  /** True for the empty Untitled tab the app starts with, which a newly opened file replaces. */
  const isPristine = (tab: Tab | undefined) => !!tab && !tab.doc.path && !tab.dirty && textOf(tab) === "";

  const addTab = (doc: Doc, text: string, { replacePristine = true, front = true } = {}): Tab => {
    const tab: Tab = { id: nextId.current++, doc, state: editor.current!.createState(text), dirty: false, missing: false };
    const current = activeTab();
    const at = current ? tabs.current.indexOf(current) : tabs.current.length - 1;
    if (replacePristine && isPristine(current)) tabs.current.splice(at, 1, tab);
    else tabs.current.splice(at + 1, 0, tab);
    if (front) show(tab.id);
    return tab;
  };

  const newTab = () => addTab(untitledDoc(nextUntitledName()), "", { replacePristine: false });

  const setRecent = (files: string[]) => {
    recent.current = files;
    void saveRecent(files).catch(console.warn);
  };

  /** Puts a file at the top of Open Recent. */
  const noteRecent = (path: string) => {
    if (recent.current[0] === path) return;
    setRecent([path, ...recent.current.filter((p) => !samePath(p, path))].slice(0, RECENT_LIMIT));
  };

  /** Opens a file in a tab (or shows its tab); false if it could not be read. */
  const openPath = async (path: string): Promise<boolean> => {
    const existing = findTab(path);
    if (existing) {
      show(existing.id);
      return true;
    }
    try {
      const { doc, text } = await readDoc(path);
      addTab(doc, text);
      noteRecent(path);
      return true;
    } catch (err) {
      await showError(err);
      return false;
    }
  };

  /** A result of the folder search: opens the file with the match selected. */
  const openHit = async (hit: SearchHit) => {
    if (!(await openPath(hit.path))) return;
    const view = editor.current?.view;
    if (!view) return;
    if (viewMode === "preview") setViewMode("split");
    const line = view.state.doc.line(Math.min(hit.line + 1, view.state.doc.lines));
    const from = Math.min(line.from + hit.column, line.to);
    view.dispatch({
      selection: { anchor: from, head: Math.min(from + hit.length, line.to) },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
  };

  /** An entry of File › Open Recent; one that no longer opens is dropped from the list. */
  const openRecent = async (index: number) => {
    const path = recent.current[index];
    if (path && !(await openPath(path))) setRecent(recent.current.filter((p) => p !== path));
  };

  /** Saves a tab; returns false if the save was cancelled or failed. */
  const saveTab = async (tab: Tab, askForPath = false): Promise<boolean> => {
    const path = (!askForPath && tab.doc.path) || (await pickSavePath(tab.doc, root.current));
    if (!path) return false;
    const text = textOf(tab);
    try {
      await writeDoc(path, text, tab.doc);
    } catch (err) {
      await showError(err);
      return false;
    }
    tab.doc = { ...tab.doc, path, savedText: text };
    noteRecent(path);
    tab.missing = false;
    tab.autosaveFailed = false;
    updateDirty(tab);
    persistSession();
    return true;
  };

  /** Resolves true when the tab may be dropped: saved, discarded, or clean. */
  const confirmDiscard = async (tab: Tab): Promise<boolean> => {
    updateDirty(tab);
    if (!tab.dirty) return true;
    if (tab.id !== activeId.current) show(tab.id);
    const choice = await askToSave(tab.doc);
    if (choice === "save") return saveTab(tab);
    return choice === "discard";
  };

  /** Removes tabs without asking; an empty strip gets a fresh Untitled tab. */
  const dropTabs = (ids: number[]) => {
    const wasActive = ids.includes(activeId.current);
    const index = tabs.current.findIndex((t) => t.id === activeId.current);
    void forgetRecovery(tabs.current.filter((t) => ids.includes(t.id)));
    tabs.current = tabs.current.filter((t) => !ids.includes(t.id));
    if (tabs.current.length === 0) addTab(untitledDoc(), "");
    else if (wasActive) show(tabs.current[Math.min(index, tabs.current.length - 1)].id);
    else render();
    persistSession();
  };

  const closeTab = async (id: number) => {
    const tab = tabs.current.find((t) => t.id === id);
    if (tab && (await confirmDiscard(tab))) dropTabs([id]);
  };

  const cycleTab = (step: number) => {
    const list = tabs.current;
    const i = list.findIndex((t) => t.id === activeId.current);
    if (list.length > 1) show(list[(i + step + list.length) % list.length].id);
  };

  /** Writes text into a tab as one edit, keeping its undo history. */
  const replaceText = (tab: Tab, text: string) => {
    const view = editor.current?.view;
    if (tab.id === activeId.current && view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    } else {
      tab.state = tab.state.update({ changes: { from: 0, to: tab.state.doc.length, insert: text } }).state;
    }
  };

  // ---- Autosave ----

  /** Restarts the idle timer; when it fires, every unsaved tab that has a file is saved. */
  const scheduleAutosave = () => {
    clearTimeout(autosaveTimer.current);
    if (!autosaveOn.current) return;
    autosaveTimer.current = window.setTimeout(() => void exclusive(autosaveAll, true), AUTOSAVE_IDLE_MS);
  };

  const autosaveAll = async () => {
    if (!autosaveOn.current) return;
    for (const tab of [...tabs.current]) {
      updateDirty(tab);
      // Untitled tabs need a name first, and a file deleted on disk stays deleted until saved by hand.
      if (!tab.dirty || !tab.doc.path || tab.missing || tab.autosaveFailed) continue;
      if (!(await saveTab(tab))) tab.autosaveFailed = true;
    }
  };

  const spellCheckOn = useRef(true);
  const setSpellCheckSetting = async (on: boolean) => {
    spellCheckOn.current = on;
    setSpellCheck(on, editor.current?.view ?? null);
    void setMenuChecked("spellcheck", on);
    await saveSpellCheck(on);
  };

  const setAutosave = async (on: boolean) => {
    autosaveOn.current = on;
    setAutosaveState(on);
    void setMenuChecked("autosave", on);
    await saveAutosave(on);
    if (on) scheduleAutosave();
    else clearTimeout(autosaveTimer.current);
  };

  // ---- Outline and formatting ----

  const jumpToLine = (line: number) => scrollSync.current?.jumpTo(line);
  const outlineTopLine = useCallback(() => scrollSync.current?.topLine() ?? null, []);
  const onOutlineScroll = useCallback((listener: () => void) => {
    scrollListeners.current.add(listener);
    return () => void scrollListeners.current.delete(listener);
  }, []);

  const format = (kind: FormatKind) => {
    const view = editor.current?.view;
    if (!view || viewMode === "preview") return;
    formatCommands[kind](view);
    view.focus();
  };

  // ---- Workspace ----

  const refreshTree = async () => {
    const dir = root.current;
    if (!dir) return setNodes([]);
    try {
      const list = await listFolder(dir);
      if (root.current === dir) setNodes(list);
    } catch {
      if (root.current === dir) setNodes([]);
    }
  };

  const setWorkspace = async (dir: string | null, open: string[] = []) => {
    root.current = dir;
    expanded.current = new Set(open);
    setNodes([]);
    render();
    persistSession();
    try {
      await watchFolder(dir);
    } catch (err) {
      console.warn(err); // The tree still works; it just won't follow outside changes.
    }
    await refreshTree();
  };

  const toggleFolder = (path: string) => {
    if (!expanded.current.delete(path)) expanded.current.add(path);
    render();
    persistSession();
  };

  const createInFolder = async (dir: string, name: string): Promise<boolean> => {
    const path = joinPath(dir, withMarkdownExt(name));
    try {
      await createFile(path);
    } catch (err) {
      await showError(err);
      return false;
    }
    // Expand every folder down to the new file (a typed name can include subfolders).
    for (let d = dirOf(path); d && root.current && !samePath(d, root.current) && isInside(d, root.current); d = dirOf(d)) {
      expanded.current.add(d);
    }
    await refreshTree();
    await openPath(path);
    return true;
  };

  const renameEntry = async (path: string, name: string): Promise<boolean> => {
    const parent = dirOf(path);
    if (!parent || /[\\/]/.test(name)) {
      await showError("A name can't contain / or \\.");
      return false;
    }
    const to = joinPath(parent, name);
    try {
      await renamePath(path, to);
    } catch (err) {
      await showError(err);
      return false;
    }
    // Open tabs and expanded folders follow the file or folder to its new name.
    for (const tab of tabs.current) {
      if (tab.doc.path && isInside(tab.doc.path, path)) tab.doc = { ...tab.doc, path: reroot(tab.doc.path, path, to) };
    }
    expanded.current = new Set([...expanded.current].map((p) => (isInside(p, path) ? reroot(p, path, to) : p)));
    render();
    persistSession();
    await refreshTree();
    return true;
  };

  const deleteEntry = async (node: TreeNode) => {
    const affected = tabs.current.filter((t) => t.doc.path && isInside(t.doc.path, node.path));
    affected.forEach(updateDirty);
    if (!(await confirmTrash(node.path, node.isDir, affected.some((t) => t.dirty)))) return;
    try {
      await trashPath(node.path);
    } catch (err) {
      return showError(err);
    }
    if (affected.length) dropTabs(affected.map((t) => t.id));
    await refreshTree();
  };

  /** A file in the workspace changed on disk: bring its tab up to date. */
  const reloadTab = async (tab: Tab) => {
    const path = tab.doc.path!;
    let disk: Awaited<ReturnType<typeof readDoc>>;
    try {
      disk = await readDoc(path);
    } catch {
      // Deleted or moved away: keep the text, and show it as unsaved.
      tab.missing = true;
      return updateDirty(tab);
    }
    tab.missing = false;
    const fresh = { ...disk.doc, untitledName: tab.doc.untitledName };
    if (disk.text === tab.doc.savedText || disk.text === textOf(tab)) {
      // Our own save, or nothing that differs from what's in the editor.
      tab.doc = fresh;
      return updateDirty(tab);
    }
    updateDirty(tab);
    if (tab.dirty) {
      if (tab.id !== activeId.current) show(tab.id);
      const reload = await ask(`${docName(tab.doc)} changed on disk. Reload it and lose your unsaved changes?`, {
        title: "Marklet",
        kind: "warning",
        okLabel: "Reload",
        cancelLabel: "Keep My Changes",
      });
      if (!reload) {
        // Saving will overwrite the disk version; don't ask again for this one.
        tab.doc = fresh;
        return updateDirty(tab);
      }
    }
    tab.doc = fresh;
    replaceText(tab, disk.text);
    updateDirty(tab);
  };

  const onFsChange = (paths: string[]) => {
    void refreshTree();
    for (const tab of tabs.current) {
      const path = tab.doc.path;
      if (path && paths.some((p) => isInside(path, p))) void exclusive(() => reloadTab(tab), true);
    }
  };

  // ---- Commands ----

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    void checkMenuGroup("view", mode);
    void saveViewMode(mode);
  };

  // Current appearance settings, for exports.
  const theme = useRef<ThemeSetting>("system");
  const accent = useRef<AccentSetting>("blue");

  const setTheme = async (value: ThemeSetting) => {
    theme.current = value;
    applyTheme(value);
    await saveTheme(value);
  };

  const setAccent = async (value: AccentSetting) => {
    accent.current = value;
    applyAccent(value);
    void checkMenuGroup("accent", value);
    await saveAccent(value);
  };

  // ---- Pasted images ----

  /** Saves pasted images beside the document and inserts their Markdown at the cursor. */
  const pasteImages = (files: File[]) => insertImages((dir) => saveImages(files, dir));

  /**
   * Adds pasted or dropped images to the front tab: `store` puts them in the
   * assets folder and returns their Markdown, which goes in at `at` (a place
   * in the window, for a drop) or at the cursor.
   */
  const insertImages = async (store: (docDir: string) => Promise<string>, at?: { x: number; y: number }) => {
    const tab = activeTab();
    if (!tab || !isTauri()) return;
    try {
      if (!tab.doc.path) {
        // The image path is relative to the file, so the file needs a place on disk first.
        const save = await ask("Images are saved in an assets folder next to the file. Save this file now?", {
          title: "Marklet",
          kind: "info",
          okLabel: "Save",
          cancelLabel: "Cancel",
        });
        if (!save || !(await saveTab(tab))) return;
      }
      const markdown = await store(dirOf(tab.doc.path)!);
      const view = editor.current?.view;
      if (!view || tab.id !== activeId.current) return;
      const pos = at ? view.posAtCoords(at) : null;
      if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      view.dispatch(view.state.replaceSelection(markdown), { scrollIntoView: true, userEvent: "input.paste" });
      view.focus();
    } catch (err) {
      await showError(err);
    }
  };

  /** Files dropped on the window: notes open, a folder becomes the workspace, images go into the note. */
  const dropped = async (paths: string[], at: { x: number; y: number }) => {
    const images: string[] = [];
    for (const path of paths) {
      if (isMarkdownPath(path)) await openPath(path);
      else if (isImagePath(path)) images.push(path);
      else if ((await invoke<string>("path_kind", { path })) === "dir") await setWorkspace(path);
    }
    if (images.length) await insertImages((dir) => importImages(images, dir), at);
  };

  const toggleFocus = () => {
    const on = !focusOn.current;
    focusOn.current = on;
    setFocusState(on);
    setFocusMode(on, editor.current?.view ?? null);
    if (isTauri()) void getCurrentWindow().setFullscreen(on).catch(console.warn);
    editor.current?.focus();
  };

  /** Puts the cursor in the sidebar's search box (not a file action: those hand focus back to the editor). */
  const findInFolder = () => {
    if (root.current) return setSearchFocus((n) => n + 1);
    // Nothing to search yet: pick a folder first, then the box is ready.
    void exclusive(async () => {
      const dir = await pickFolder();
      if (!dir) return;
      await setWorkspace(dir);
      setSearchFocus((n) => n + 1);
    }, true);
  };

  // ---- Zoom ----

  const lastZoom = useRef(0);
  /** One step larger (1) or smaller (-1), or back to 100% (0). */
  const stepZoom = (step: 1 | -1 | 0) => {
    // A shortcut arrives twice, from the menu accelerator and from the page; count it once.
    const now = performance.now();
    if (now - lastZoom.current < 80) return;
    lastZoom.current = now;
    setZoomState((current) => {
      const i = ZOOM_STEPS.indexOf(current);
      const next = step === 0 ? 1 : ZOOM_STEPS[clamp((i < 0 ? ZOOM_STEPS.indexOf(1) : i) + step, 0, ZOOM_STEPS.length - 1)];
      applyZoom(next);
      void saveZoom(next);
      editor.current?.view?.requestMeasure();
      return next;
    });
  };

  /** Settings › Text size. */
  const setZoom = (value: number) => {
    setZoomState(value);
    applyZoom(value);
    void saveZoom(value);
    editor.current?.view?.requestMeasure();
  };

  /** Settings › fonts and line width. */
  const setLook = (value: Look) => {
    setLookState(value);
    applyLook(value);
    void saveLook(value);
    // Fonts arrive a moment after they are named; measure again once they are in.
    editor.current?.view?.requestMeasure();
    void document.fonts.ready.then(() => editor.current?.view?.requestMeasure());
  };

  // ---- Export ----

  const exportAs = async (kind: ExportKind) => {
    const tab = activeTab();
    if (!tab) return;
    const name = docName(tab.doc);
    try {
      if (kind === "html") {
        const path = await pickExportPath("html", tab.doc.path, name);
        if (!path) return;
        await writeHtml(path, await buildHtml(textOf(tab), dirOf(tab.doc.path), name, theme.current, accent.current));
      } else {
        const path = pdfNeedsPath ? await pickExportPath("pdf", tab.doc.path, name) : null;
        if (pdfNeedsPath && !path) return;
        await printPdf(path, name);
      }
    } catch (err) {
      await showError(err);
    }
  };

  const withActive = (fn: (tab: Tab) => Promise<unknown>) => async () => {
    const tab = activeTab();
    if (tab) await fn(tab);
  };

  /** Commands shared by the File menu, the toolbar, the tab strip and shortcuts. */
  const commands: Record<string, () => Promise<unknown>> = {
    new: async () => newTab(),
    open: async () => {
      const path = await pickFileToOpen();
      if (path) await openPath(path);
    },
    "open-folder": async () => {
      const dir = await pickFolder();
      if (dir) await setWorkspace(dir);
    },
    "close-folder": () => setWorkspace(null),
    save: withActive((tab) => saveTab(tab)),
    "save-as": withActive((tab) => saveTab(tab, true)),
    "close-tab": async () => closeTab(activeId.current),
    "next-tab": async () => cycleTab(1),
    "prev-tab": async () => cycleTab(-1),
    "export-html": () => exportAs("html"),
    "export-pdf": () => exportAs("pdf"),
    "check-updates": () => checkForUpdate(true, readyToRestart),
    find: async () => {
      // The bar belongs to the editor, so bring the editor on screen first.
      if (viewMode === "preview") setViewMode("split");
      const view = editor.current?.view;
      if (view) openSearchPanel(view);
    },
  };

  /** Before an update restarts the app: every unsaved tab is saved or discarded, as on quit. */
  const readyToRestart = async () => {
    for (const tab of [...tabs.current]) {
      if (!(await confirmDiscard(tab))) return false;
    }
    await flushSettings();
    await leaveCleanly();
    return true;
  };

  /** The app is about to quit or restart with every tab saved or knowingly discarded: drop the recovery copies. */
  const leaveCleanly = async () => {
    leaving.current = true;
    clearTimeout(recoveryTimer.current);
    await forgetRecovery(tabs.current);
  };

  // Latest handlers for listeners registered once.
  const openFiles = async (paths: string[]) => {
    for (const path of paths) await openPath(path);
  };

  const handlers = { commands, onFsChange, setTheme, setAccent, setViewMode, setAutosave, setSpellCheckSetting, confirmDiscard, openFiles, readyToRestart, leaveCleanly, stepZoom, dropped, openRecent, setRecent, findInFolder, toggleFocus, menuChosen: (id: string) => menuChosen(id) };
  const actions = useRef(handlers);
  actions.current = handlers;

  // Serialize file actions so a second trigger can't open a second dialog. A
  // shortcut can arrive both as a keydown and as a menu accelerator, so the
  // same command repeated within a moment is dropped.
  const busy = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const last = useRef({ id: "", at: 0 });

  /** Runs a file action unless one is in progress; `wait` queues it behind instead. */
  const exclusive = async (fn: () => Promise<unknown>, wait = false) => {
    if (busy.current && !wait) return;
    const run = queue.current.then(async () => {
      busy.current = true;
      try {
        await fn();
      } finally {
        busy.current = false;
      }
    });
    queue.current = run.catch(() => {});
    await run;
    if (!wait) editor.current?.focus();
  };

  const run = (id: string) => {
    const action = actions.current.commands[id];
    const now = performance.now();
    if (!action || (last.current.id === id && now - last.current.at < 400)) return;
    last.current = { id, at: now };
    void exclusive(action);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Focus mode: F11, or Ctrl/Cmd+Shift+Enter (F11 belongs to the system on a Mac).
      if (!e.altKey && ((e.key === "F11" && !mod && !e.shiftKey) || (e.key === "Enter" && mod && e.shiftKey))) {
        e.preventDefault();
        return actions.current.toggleFocus();
      }
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const view = !e.shiftKey && ({ "1": "editor", "2": "split", "3": "preview", "4": "rich" } as Record<string, ViewMode>)[e.key];
      if (view) {
        e.preventDefault();
        return actions.current.setViewMode(view);
      }
      const zoomStep = ({ "=": 1, "+": 1, "-": -1, "0": 0 } as Record<string, 1 | -1 | 0>)[e.key];
      if (zoomStep !== undefined) {
        e.preventDefault();
        return actions.current.stepZoom(zoomStep);
      }
      if (key === "," && !e.shiftKey) {
        e.preventDefault();
        return setSettingsOpen((open) => !open);
      }
      if (key === "f" && e.shiftKey) {
        e.preventDefault();
        return actions.current.findInFolder();
      }
      let id: string | null;
      if (key === "tab" && e.ctrlKey) id = e.shiftKey ? "prev-tab" : "next-tab";
      else if (e.shiftKey) id = ({ s: "save-as", o: "open-folder", e: "export-html" } as Record<string, string>)[key] ?? null;
      else id = ({ n: "new", o: "open", s: "save", w: "close-tab", p: "export-pdf", f: "find", h: "find" } as Record<string, string>)[key] ?? null;
      if (!id) return;
      e.preventDefault();
      run(id);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /**
   * A menu item was chosen, by id: from the app menu drawn in the window
   * (Windows) or from the native menu bar (macOS, as a "menu" event).
   */
  const menuChosen = (id: string) => {
    const [group, value] = id.split(":");
    // Settings apply right away, even while a dialog holds the file-action lock.
    if (group === "theme" && isThemeSetting(value)) void setTheme(value);
    else if (group === "accent" && isAccentSetting(value)) void setAccent(value);
    else if (group === "view" && isViewMode(value)) setViewMode(value);
    else if (group === "recent" && value === "clear") setRecent([]);
    else if (group === "recent") void exclusive(() => openRecent(Number(value)));
    else if (id === "zoom-in" || id === "zoom-out" || id === "zoom-reset") stepZoom(id === "zoom-in" ? 1 : id === "zoom-out" ? -1 : 0);
    else if (id === "find-in-folder") findInFolder();
    else if (id === "settings") setSettingsOpen(true);
    else if (id === "focus") toggleFocus();
    else if (id === "autosave") void setAutosave(!autosaveOn.current);
    else if (id === "spellcheck") void setSpellCheckSetting(!spellCheckOn.current);
    else if (id === "quit") void getCurrentWindow().close(); // asks about unsaved tabs, like the window's own Close
    else run(id);
  };

  /** The app menu as drawn in the window: File, Edit, View and Settings. Built when it opens, so its ticks are current. */
  const appMenu = (): MenuItem[] => {
    const key = (keys: string) => (isMac ? keys.replace("Ctrl+", "⌘").replace("Shift+", "⇧") : keys);
    const item = (id: string, label: string, keys?: string, extra: Partial<Exclude<MenuItem, { separator: true }>> = {}): MenuItem => ({
      label,
      shortcut: keys && key(keys),
      action: () => menuChosen(id),
      ...extra,
    });
    const sep: MenuItem = { separator: true };
    const files = recent.current;
    return [
      {
        label: "File",
        submenu: [
          item("new", "New", "Ctrl+N"),
          item("open", "Open…", "Ctrl+O"),
          {
            label: "Open Recent",
            submenu: files.length
              ? [
                  // The file's name, with its folder at the right; the full path is the tooltip.
                  ...files.map((path, i) => item(`recent:${i}`, baseName(path), undefined, { title: path, shortcut: baseName(dirOf(path) ?? "") })),
                  sep,
                  item("recent:clear", "Clear Recent"),
                ]
              : [{ label: "No Recent Files", disabled: true }],
          },
          item("open-folder", "Open Folder…", "Ctrl+Shift+O"),
          item("close-folder", "Close Folder", undefined, { disabled: !root.current }),
          sep,
          item("save", "Save", "Ctrl+S"),
          item("save-as", "Save As…", "Ctrl+Shift+S"),
          sep,
          item("export-html", "Export as HTML…", "Ctrl+Shift+E"),
          item("export-pdf", "Export as PDF…", "Ctrl+P"),
          sep,
          item("close-tab", "Close Tab", "Ctrl+W"),
          sep,
          item("quit", "Exit"),
        ],
      },
      {
        label: "Edit",
        submenu: [item("find", "Find and Replace…", "Ctrl+F"), item("find-in-folder", "Find in Folder…", "Ctrl+Shift+F")],
      },
      {
        label: "View",
        submenu: [
          ...(
            [
              ["editor", "Editor Only", "Ctrl+1"],
              ["split", "Split", "Ctrl+2"],
              ["preview", "Preview Only", "Ctrl+3"],
              ["rich", "Rich", "Ctrl+4"],
            ] as const
          ).map(([mode, label, keys]) => item(`view:${mode}`, label, keys, { checked: viewMode === mode, radio: true })),
          sep,
          { ...item("focus", "Focus Mode"), shortcut: isMac ? "⌘⇧↩" : "F11", checked: focus },
          sep,
          item("zoom-in", "Zoom In", "Ctrl+="),
          item("zoom-out", "Zoom Out", "Ctrl+-"),
          item("zoom-reset", "Actual Size", "Ctrl+0"),
        ],
      },
      {
        label: "Settings",
        submenu: [
          item("settings", "Settings…", "Ctrl+,"),
          sep,
          {
            label: "Theme",
            submenu: (["system", "light", "dark"] as const).map((value) =>
              item(`theme:${value}`, value[0].toUpperCase() + value.slice(1), undefined, { checked: theme.current === value, radio: true }),
            ),
          },
          {
            label: "Accent Color",
            submenu: ACCENTS.map((value) => item(`accent:${value}`, ACCENT_LABELS[value], undefined, { checked: accent.current === value, radio: true })),
          },
          sep,
          item("autosave", "Autosave", undefined, { checked: autosave }),
          item("spellcheck", "Spell Check", undefined, { checked: spellCheckOn.current }),
          sep,
          item("check-updates", "Check for Updates…"),
        ],
      },
    ];
  };

  // Native menu items arrive as a "menu" event carrying the item id.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("menu", ({ payload: id }) => actions.current.menuChosen(id));
    const unwatch = listen<string[]>("fs-change", ({ payload }) => actions.current.onFsChange(payload));
    // Files double-clicked in Explorer or Finder while the app is running.
    const unopen = listen<string[]>("open-files", ({ payload }) => void exclusive(() => actions.current.openFiles(payload), true));
    // Files and folders dragged onto the window. Positions arrive in device pixels.
    const undrop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type !== "drop") return;
      const at = { x: payload.position.x / window.devicePixelRatio, y: payload.position.y / window.devicePixelRatio };
      void exclusive(() => actions.current.dropped(payload.paths, at), true);
    });
    return () => {
      void undrop.then((fn) => fn());
      void unlisten.then((fn) => fn());
      void unwatch.then((fn) => fn());
      void unopen.then((fn) => fn());
    };
  }, []);

  // Startup: settings, then the last session's folder and tabs.
  const started = useRef(false);
  useEffect(() => {
    void loadTheme().then((value) => {
      theme.current = value;
      applyTheme(value);
      void syncThemeMenu(value);
    });
    void loadAccent().then((value) => {
      accent.current = value;
      applyAccent(value);
      void checkMenuGroup("accent", value);
    });
    void loadViewMode().then((mode) => {
      setViewModeState(mode);
      void checkMenuGroup("view", mode);
    });
    void loadLook().then((value) => {
      setLookState(value);
      applyLook(value);
      void document.fonts.ready.then(() => editor.current?.view?.requestMeasure());
    });
    void loadZoom().then((value) => {
      applyZoom(value);
      setZoomState(value);
      editor.current?.view?.requestMeasure();
    });
    void loadRecent().then((files) => {
      // Refill the menu; anything opened in the meantime stays on top.
      setRecent([...recent.current, ...files.filter((f) => !recent.current.some((r) => samePath(r, f)))].slice(0, RECENT_LIMIT));
    });
    void loadSpellCheck().then((on) => {
      spellCheckOn.current = on;
      setSpellCheck(on, editor.current?.view ?? null);
      void setMenuChecked("spellcheck", on);
    });
    void loadAutosave().then((on) => {
      autosaveOn.current = on;
      setAutosaveState(on);
      void setMenuChecked("autosave", on);
    });
    if (started.current) return;
    started.current = true;
    void exclusive(async () => {
      const session = await loadSession();
      if (session.workspace) await setWorkspace(session.workspace, session.expanded);
      const opened: Tab[] = [];
      for (const path of session.files) {
        try {
          const { doc, text } = await readDoc(path);
          opened.push(addTab(doc, text, { front: false }));
        } catch {
          // Moved or deleted since last time: skip it.
        }
      }
      const front = session.files[session.active];
      if (opened.length === 0) addTab(untitledDoc(), "");
      else show((opened.find((t) => front && samePath(t.doc.path!, front)) ?? opened[opened.length - 1]).id);
      // A file the app was launched to open (double-click) comes to the front.
      if (isTauri()) await openFiles(await invoke<string[]>("take_launch_files"));
      await restoreLeftBehind();
    });
    // Look for a new version once the window has settled (installed builds only).
    if (!import.meta.env.DEV) {
      window.setTimeout(() => void exclusive(() => checkForUpdate(false, () => actions.current.readyToRestart()), true), 3000);
    }
  }, []);

  useEffect(() => {
    const view = editor.current?.view;
    const p = preview.current;
    if (!view || !p) return;
    const sync = new ScrollSync(view, p.pane, p.content, () => scrollListeners.current.forEach((fn) => fn()));
    scrollSync.current = sync;
    return () => {
      sync.destroy();
      scrollSync.current = null;
    };
  }, []);

  // Scroll sync only makes sense with both panes on screen.
  useEffect(() => {
    scrollSync.current?.setEnabled(viewMode === "split");
    setRich(viewMode === "rich", editor.current?.view ?? null);
  }, [viewMode]);

  // Closing the window asks about each unsaved tab in turn.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (busy.current) return event.preventDefault();
      busy.current = true;
      try {
        for (const tab of [...tabs.current]) {
          if (!(await actions.current.confirmDiscard(tab))) return event.preventDefault();
        }
        // Everything was saved or knowingly discarded: nothing to recover next time.
        await actions.current.leaveCleanly();
        await flushSettings();
      } finally {
        busy.current = false;
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const active = activeTab();
  const doc = active?.doc ?? untitledDoc();
  const dirty = active?.dirty ?? false;
  const name = docName(doc);
  useEffect(() => {
    if (isTauri()) void getCurrentWindow().setTitle(`${dirty ? "● " : ""}${name} — Marklet`);
  }, [name, dirty]);

  // In focus mode there is one column of text: Split shows its editor half only.
  const layout: ViewMode = focus && viewMode === "split" ? "editor" : viewMode;

  const resizeSplit = (clientX: number) => {
    const box = panes.current?.getBoundingClientRect();
    if (box && box.width > 0) setSplit(clamp((clientX - box.left) / box.width, 0.2, 0.8));
  };

  return (
    <div className={`app${focus ? " focus" : ""}`}>
      {focus && (
        <div className="focus-hint" role="status">
          Focus mode. Press {isMac ? "⌘⇧↩" : "F11"} to leave.
        </div>
      )}
      <Toolbar
        menu={appMenu}
        title={name}
        dirty={dirty}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onNew={() => run("new")}
        onOpen={() => run("open")}
        onOpenFolder={() => run("open-folder")}
        onFormat={format}
        onExport={(kind) => run(`export-${kind}`)}
      />
      <TabStrip
        tabs={tabs.current.map((t) => ({ id: t.id, name: docName(t.doc), title: t.doc.path ?? docName(t.doc), dirty: t.dirty }))}
        activeId={activeId.current}
        onSelect={(id) => id !== activeId.current && show(id)}
        onClose={(id) => void exclusive(() => closeTab(id))}
        onNew={() => run("new")}
      />

      <main className="body">
        <Sidebar
          width={sidebarWidth}
          root={root.current}
          nodes={nodes}
          expanded={expanded.current}
          activePath={doc.path}
          onOpenFile={(path) => void exclusive(() => openPath(path))}
          onOpenFolder={() => run("open-folder")}
          onToggle={toggleFolder}
          onCreate={(dir, fileName) => createInFolder(dir, fileName)}
          onRename={(path, newName) => renameEntry(path, newName)}
          onDelete={(node) => void exclusive(() => deleteEntry(node))}
          onReveal={(path) => void revealItemInDir(path)}
          onEscape={() => editor.current?.focus()}
          outline={{ source, topLine: outlineTopLine, onScroll: onOutlineScroll, onJump: jumpToLine }}
          searchFocus={searchFocus}
          onOpenHit={(hit) => void exclusive(() => openHit(hit))}
        />
        <Splitter label="Resize sidebar" onDrag={(x) => setSidebarWidth(clamp(x, SIDEBAR_MIN, SIDEBAR_MAX))} />

        <div className="panes" ref={panes}>
          <section
            className="pane pane-editor"
            style={{
              display: layout === "preview" ? "none" : undefined,
              flex: layout === "split" ? `0 0 ${split * 100}%` : "1 1 0",
            }}
          >
            <Editor
              ref={editor}
              onDocChange={(text) => {
                const tab = activeTab();
                if (tab) updateDirty(tab);
                setWords(countWords(text));
                setSource(text);
                scheduleAutosave();
              }}
              onCursor={(line, col, selected) => setCursor({ line, col, selected })}
              onPasteImages={(files) => void exclusive(() => pasteImages(files), true)}
            />
          </section>
          {layout === "split" && <Splitter label="Resize editor and preview" onDrag={resizeSplit} />}
          <Preview
            ref={preview}
            source={source}
            baseDir={dirOf(doc.path)}
            docId={activeId.current}
            hidden={layout === "editor" || layout === "rich"}
            onRendered={() => scrollSync.current?.afterRender()}
            onOpenFile={(path) => void exclusive(() => openPath(path))}
          />
        </div>
      </main>

      {settingsOpen && (
        <SettingsDialog
          values={{ theme: theme.current, accent: accent.current, look, zoom, autosave, spellCheck: spellCheckOn.current }}
          onTheme={(value) => {
            void setTheme(value);
            void syncThemeMenu(value);
            render();
          }}
          onAccent={(value) => {
            void setAccent(value);
            render();
          }}
          onLook={setLook}
          onZoom={setZoom}
          onAutosave={(on) => void setAutosave(on)}
          onSpellCheck={(on) => {
            void setSpellCheckSetting(on);
            render();
          }}
          onCheckUpdates={() => {
            setSettingsOpen(false);
            run("check-updates");
          }}
          onClose={() => {
            setSettingsOpen(false);
            editor.current?.focus();
          }}
        />
      )}

      <PopupMenuHost />

      <StatusBar doc={doc} dirty={dirty} autosave={autosave} {...cursor} words={words} zoom={zoom} />
    </div>
  );
}
