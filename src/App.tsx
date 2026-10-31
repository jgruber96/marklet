import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
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

  const isDirty = () => textRef.current !== docRef.current.savedText;

  const loadIntoEditor = (next: Doc, text: string) => {
    setDoc(next);
    textRef.current = text;
    editor.current?.setDoc(text);
    setDirty(false);
    setWords(countWords(text));
  };

  /** Saves the current document; returns false if the user cancelled the save dialog. */
  const save = async (): Promise<boolean> => {
    const current = docRef.current;
    const path = current.path ?? (await pickSavePath(current));
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

  // Latest handlers for listeners registered once.
  const actions = useRef({ save, newFile, openFile, confirmDiscard });
  actions.current = { save, newFile, openFile, confirmDiscard };

  // Serialize file actions so a second shortcut can't open a second dialog.
  const busy = useRef(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
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
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const action =
        key === "s" ? actions.current.save : key === "o" ? actions.current.openFile : key === "n" ? actions.current.newFile : null;
      if (!action) return;
      e.preventDefault();
      void run(action);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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
      <Toolbar onNew={() => run(newFile)} onOpen={() => run(openFile)} />
      <TabStrip name={name} dirty={dirty} onClose={() => run(newFile)} onNew={() => run(newFile)} />

      <main className="body">
        <Sidebar width={sidebarWidth} />
        <Splitter label="Resize sidebar" onDrag={(x) => setSidebarWidth(clamp(x, SIDEBAR_MIN, SIDEBAR_MAX))} />

        <div className="panes" ref={panes}>
          <section className="pane pane-editor" style={{ flex: `0 0 ${split * 100}%` }}>
            <Editor
              ref={editor}
              onDocChange={(text) => {
                textRef.current = text;
                setDirty(isDirty());
                setWords(countWords(text));
              }}
              onCursor={(line, col) => setCursor({ line, col })}
            />
          </section>
          <Splitter label="Resize editor and preview" onDrag={resizeSplit} />
          <section className="pane pane-preview">
            <div className="preview-placeholder">Live preview arrives in milestone 2.</div>
          </section>
        </div>
      </main>

      <StatusBar doc={doc} dirty={dirty} line={cursor.line} col={cursor.col} words={words} />
    </div>
  );
}
