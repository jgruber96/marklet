import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Editor, type EditorHandle } from "./lib/editor/Editor";
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
  isThemeSetting,
  loadTheme,
  loadViewMode,
  saveTheme,
  saveViewMode,
  syncThemeMenu,
} from "./lib/stores/settings";
import { Preview, type PreviewHandle } from "./lib/preview/Preview";
import { ScrollSync } from "./lib/preview/scrollSync";
import { dirOf } from "./lib/preview/render";
import { Toolbar } from "./components/Toolbar";
import { TabStrip } from "./components/TabStrip";
import { StatusBar } from "./components/StatusBar";
import { Splitter } from "./components/Splitter";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function App() {
  const editor = useRef<EditorHandle>(null);
  const panes = useRef<HTMLDivElement>(null);

  const [doc, setDocState] = useState<Doc>(untitledDoc);
  const docRef = useRef(doc);
  const setDoc = (d: Doc) => {
    docRef.current = d;
    setDocState(d);
  };
  const textRef = useRef("");

  const [dirty, setDirty] = useState(false);
  const [words, setWords] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [split, setSplit] = useState(0.5);
  const [viewMode, setViewModeState] = useState<ViewMode>("split");
  const [source, setSource] = useState("");

  const preview = useRef<PreviewHandle>(null);
  const scrollSync = useRef<ScrollSync | null>(null);

  const isDirty = () => textRef.current !== docRef.current.savedText;

  const loadIntoEditor = (next: Doc, text: string) => {
    setDoc(next);
    textRef.current = text;
    editor.current?.setDoc(text);
    setDirty(false);
    setWords(countWords(text));
    setSource(text);
    scrollSync.current?.followEditor();
  };

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    void saveViewMode(mode);
  };

  /** Saves the current document; returns false if the user cancelled the save dialog. */
  const save = async (askForPath = false): Promise<boolean> => {
    const current = docRef.current;
    const path = (!askForPath && current.path) || (await pickSavePath(current));
    if (!path) return false;
    const text = textRef.current;
    try {
      await writeDoc(path, text, current);
    } catch (err) {
      await showError(err);
      return false;
    }
    setDoc({ ...current, path, savedText: text });
    setDirty(textRef.current !== text);
    return true;
  };

  /** Resolves true when it is safe to drop the current document. */
  const confirmDiscard = async (): Promise<boolean> => {
    if (!isDirty()) return true;
    const choice = await askToSave(docRef.current);
    if (choice === "save") return save();
    return choice === "discard";
  };

  const newFile = async () => {
    if (await confirmDiscard()) loadIntoEditor(untitledDoc(), "");
  };

  const openFile = async () => {
    if (!(await confirmDiscard())) return;
    const path = await pickFileToOpen();
    if (!path) return;
    try {
      const { doc: next, text } = await readDoc(path);
      loadIntoEditor(next, text);
    } catch (err) {
      await showError(err);
    }
  };

  const setTheme = async (theme: ThemeSetting) => {
    applyTheme(theme);
    await saveTheme(theme);
  };

  /** Commands shared by the File menu, the toolbar, the tab strip and shortcuts. */
  const commands: Record<string, () => Promise<unknown>> = {
    new: newFile,
    open: openFile,
    save: () => save(),
    "save-as": () => save(true),
    "close-tab": newFile, // single tab until milestone 4: closing leaves an empty Untitled
  };

  // Latest handlers for listeners registered once.
  const actions = useRef({ commands, confirmDiscard, setTheme });
  actions.current = { commands, confirmDiscard, setTheme };

  // Serialize file actions so a second trigger can't open a second dialog. A
  // shortcut can arrive both as a keydown and as a menu accelerator, so the
  // same command repeated within a moment is dropped.
  const busy = useRef(false);
  const last = useRef({ id: "", at: 0 });
  const run = async (id: string) => {
    const action = actions.current.commands[id];
    const now = performance.now();
    if (!action || busy.current || (last.current.id === id && now - last.current.at < 400)) return;
    last.current = { id, at: now };
    busy.current = true;
    try {
      await action();
    } finally {
      busy.current = false;
      editor.current?.focus();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const id = e.shiftKey
        ? key === "s" ? "save-as" : null
        : ({ n: "new", o: "open", s: "save", w: "close-tab" } as Record<string, string>)[key] ?? null;
      if (!id) return;
      e.preventDefault();
      void run(id);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Native menu items arrive as a "menu" event carrying the item id.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("menu", ({ payload: id }) => {
      const theme = id.startsWith("theme:") ? id.slice("theme:".length) : null;
      if (isThemeSetting(theme)) void actions.current.setTheme(theme);
      else void run(id);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    void loadTheme().then((theme) => {
      applyTheme(theme);
      void syncThemeMenu(theme);
    });
    void loadViewMode().then(setViewModeState);
  }, []);

  useEffect(() => {
    const view = editor.current?.view;
    const p = preview.current;
    if (!view || !p) return;
    const sync = new ScrollSync(view, p.pane, p.content);
    scrollSync.current = sync;
    return () => {
      sync.destroy();
      scrollSync.current = null;
    };
  }, []);

  // Scroll sync only makes sense with both panes on screen.
  useEffect(() => {
    scrollSync.current?.setEnabled(viewMode === "split");
  }, [viewMode]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (busy.current || !(await actions.current.confirmDiscard())) event.preventDefault();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const name = docName(doc);
  useEffect(() => {
    if (isTauri()) void getCurrentWindow().setTitle(`${dirty ? "● " : ""}${name} — Nova MD`);
  }, [name, dirty]);

  const resizeSplit = (clientX: number) => {
    const box = panes.current?.getBoundingClientRect();
    if (box && box.width > 0) setSplit(clamp((clientX - box.left) / box.width, 0.2, 0.8));
  };

  return (
    <div className="app">
      <Toolbar viewMode={viewMode} onViewMode={setViewMode} onNew={() => run("new")} onOpen={() => run("open")} />
      <TabStrip name={name} dirty={dirty} onClose={() => run("close-tab")} onNew={() => run("new")} />

      <main className="body">
        <Sidebar width={sidebarWidth} />
        <Splitter label="Resize sidebar" onDrag={(x) => setSidebarWidth(clamp(x, SIDEBAR_MIN, SIDEBAR_MAX))} />

        <div className="panes" ref={panes}>
          <section
            className="pane pane-editor"
            style={{
              display: viewMode === "preview" ? "none" : undefined,
              flex: viewMode === "split" ? `0 0 ${split * 100}%` : "1 1 0",
            }}
          >
            <Editor
              ref={editor}
              onDocChange={(text) => {
                textRef.current = text;
                setDirty(isDirty());
                setWords(countWords(text));
                setSource(text);
              }}
              onCursor={(line, col) => setCursor({ line, col })}
            />
          </section>
          {viewMode === "split" && <Splitter label="Resize editor and preview" onDrag={resizeSplit} />}
          <Preview
            ref={preview}
            source={source}
            baseDir={dirOf(doc.path)}
            hidden={viewMode === "editor"}
            onRendered={() => scrollSync.current?.afterRender()}
          />
        </div>
      </main>

      <StatusBar doc={doc} dirty={dirty} line={cursor.line} col={cursor.col} words={words} />
    </div>
  );
}
