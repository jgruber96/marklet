import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/*
 * Small helps while typing Markdown:
 *  - brackets, double quotes and backticks close themselves, and typing one
 *    over a selection wraps it;
 *  - typing *, _ or ~ over a selection wraps it (emphasis, strikethrough);
 *  - pasting a web address over a selection makes it a link.
 * Lists, task items and quotes continuing on Enter (and ending on an empty
 * item) come from the Markdown language's own key bindings.
 */

// Not the apostrophe (contractions), and not * or _ on their own: an asterisk is as often a bullet.
const pairs = Prec.highest(EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "{", '"', "`"] } }]));

const WRAPPERS = new Set(["*", "_", "~"]);

/** Typing an emphasis mark with text selected puts the mark on both sides and keeps the selection. */
const wrapSelection = EditorView.inputHandler.of((view, _from, _to, text) => {
  const { state } = view;
  if (!WRAPPERS.has(text) || state.readOnly || state.selection.ranges.some((r) => r.empty)) return false;
  view.dispatch(
    state.changeByRange((range) => ({
      changes: [
        { from: range.from, insert: text },
        { from: range.to, insert: text },
      ],
      range: EditorSelection.range(range.anchor + text.length, range.head + text.length),
    })),
    { userEvent: "input.type", scrollIntoView: true },
  );
  return true;
});

const WEB_ADDRESS = /^https?:\/\/[^\s<>]+$/i;

/** Pasting a web address over selected text makes the text a link to it. */
const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const address = event.clipboardData?.getData("text/plain").trim() ?? "";
    const { state } = view;
    const { main } = state.selection;
    if (!WEB_ADDRESS.test(address) || state.selection.ranges.length !== 1 || main.empty) return false;
    const selected = state.sliceDoc(main.from, main.to);
    // Not across lines, and not when the selection is itself an address being replaced.
    if (selected.includes("\n") || WEB_ADDRESS.test(selected.trim())) return false;
    event.preventDefault();
    const link = `[${selected}](${address})`;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert: link },
      selection: { anchor: main.from + link.length },
      userEvent: "input.paste",
      scrollIntoView: true,
    });
    return true;
  },
});

export const smartEditing = [pairs, closeBrackets(), keymap.of(closeBracketsKeymap), wrapSelection, pasteLink];
