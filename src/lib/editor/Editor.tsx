import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, type StateEffect } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { editorTheme } from "./theme";
import { markdownHighlighting } from "./highlight";
import { editorCodeLanguages } from "../languages";
import { formatKeymap } from "./format";
import { pastedImages } from "./images";

export interface EditorHandle {
  /** A fresh state (own undo history) for a tab that isn't shown yet. */
  createState(text: string): EditorState;
  /** Shows a tab's state, then restores its scroll position if given. */
  showState(state: EditorState, scroll?: StateEffect<unknown>): void;
  focus(): void;
  readonly view: EditorView | null;
}

interface EditorProps {
  onDocChange(text: string): void;
  /** Cursor position, and how many characters are selected. */
  onCursor(line: number, col: number, selected: number): void;
  /** One or more images were pasted; the app saves them and inserts the Markdown. */
  onPasteImages(files: File[]): void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Latest callbacks, so the long-lived EditorView never calls stale closures.
  const callbacks = useRef(props);
  callbacks.current = props;

  const reportCursor = (state: EditorState) => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const selected = state.selection.ranges.reduce((n, r) => n + r.to - r.from, 0);
    callbacks.current.onCursor(line.number, head - line.from + 1, selected);
  };

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
        markdown({ base: markdownLanguage, codeLanguages: editorCodeLanguages }),
        markdownHighlighting,
        // Formatting first: Mod-i would otherwise select the parent syntax node.
        keymap.of([...formatKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
        editorTheme,
        EditorView.domEventHandlers({
          paste(event) {
            const images = pastedImages(event.clipboardData);
            if (!images.length) return false;
            event.preventDefault();
            callbacks.current.onPasteImages(images);
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onDocChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) reportCursor(update.state);
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
    createState,
    showState(state, scroll) {
      const v = view.current;
      if (!v) return;
      v.setState(state);
      if (scroll) v.dispatch({ effects: scroll });
      v.focus();
      reportCursor(state);
    },
    focus: () => view.current?.focus(),
    get view() {
      return view.current;
    },
  }));

  return <div ref={host} style={{ height: "100%" }} />;
});
