import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { editorTheme } from "./theme";

export interface EditorHandle {
  /** Replaces the document and resets undo history (used when opening a file). */
  setDoc(text: string): void;
  getDoc(): string;
  focus(): void;
  readonly view: EditorView | null;
}

interface EditorProps {
  onDocChange(text: string): void;
  onCursor(line: number, col: number): void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Latest callbacks, so the long-lived EditorView never calls stale closures.
  const callbacks = useRef(props);
  callbacks.current = props;

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onDocChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            callbacks.current.onCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    });

  useEffect(() => {
    const v = new EditorView({ parent: host.current!, state: createState("") });
    view.current = v;
    v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setDoc(text) {
      const v = view.current;
      if (!v) return;
      v.setState(createState(text));
      v.focus();
      callbacks.current.onCursor(1, 1);
    },
    getDoc: () => view.current?.state.doc.toString() ?? "",
    focus: () => view.current?.focus(),
    get view() {
      return view.current;
    },
  }));

  return <div ref={host} style={{ height: "100%" }} />;
});
