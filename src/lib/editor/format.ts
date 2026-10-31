import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange } from "@codemirror/state";
import type { Command, EditorView, KeyBinding } from "@codemirror/view";

/** Length of the run of `ch` ending at `pos` (backwards) or starting at `pos` (forwards). */
function run(state: EditorState, pos: number, ch: string, backwards: boolean): number {
  let n = 0;
  const doc = state.doc;
  while (backwards ? pos - n > 0 : pos + n < doc.length) {
    const c = backwards ? doc.sliceString(pos - n - 1, pos - n) : doc.sliceString(pos + n, pos + n + 1);
    if (c !== ch) break;
    n++;
  }
  return n;
}

/** Whether a run of marker characters of this length closes the marker (`*` inside `**` doesn't). */
function runMatches(marker: string, length: number): boolean {
  if (marker === "*") return length === 1 || length === 3;
  if (marker === "**") return length === 2 || length === 3;
  return length === marker.length;
}

/**
 * Wraps each selection in `marker`, or unwraps it when it is already wrapped
 * (markers just outside or just inside the selection). An empty selection
 * takes the word around the cursor, or else leaves the cursor between the markers.
 */
function toggleInline(marker: string): Command {
  const m = marker.length;
  const ch = marker[0];
  return (view) => {
    const { state } = view;
    view.dispatch(
      state.changeByRange((range) => {
        let { from, to } = range;
        if (range.empty) {
          const word = state.wordAt(from);
          if (word) ({ from, to } = word);
        }
        const text = state.sliceDoc(from, to);
        if (runMatches(marker, run(state, from, ch, true)) && runMatches(marker, run(state, to, ch, false))) {
          return {
            changes: [
              { from: from - m, to: from },
              { from: to, to: to + m },
            ],
            range: EditorSelection.range(from - m, to - m),
          };
        }
        const inner = text.length >= 2 * m && text.startsWith(marker) && text.endsWith(marker);
        if (inner && runMatches(marker, run(state, from, ch, false)) && runMatches(marker, run(state, to, ch, true))) {
          return {
            changes: { from, to, insert: text.slice(m, -m) },
            range: EditorSelection.range(from, to - 2 * m),
          };
        }
        return {
          changes: [
            { from, insert: marker },
            { from: to, insert: marker },
          ],
          range: EditorSelection.range(from + m, to + m),
        };
      }),
      { userEvent: "input.format", scrollIntoView: true },
    );
    return true;
  };
}

export const toggleBold = toggleInline("**");
export const toggleItalic = toggleInline("*");
export const toggleCode = toggleInline("`");

const URL_LIKE = /^(?:https?:\/\/|mailto:|www\.)\S+$/i;

/**
 * `[text](url)` around the selection with "url" selected to type over; a
 * selected URL becomes the target instead, with the cursor in the brackets.
 */
export const insertLink: Command = (view) => {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      let { from, to } = range;
      if (range.empty) {
        const word = state.wordAt(from);
        if (word) ({ from, to } = word);
      }
      const text = state.sliceDoc(from, to);
      if (URL_LIKE.test(text)) {
        return { changes: { from, to, insert: `[](${text})` }, range: EditorSelection.cursor(from + 1) };
      }
      const label = text || "text";
      const insert = `[${label}](url)`;
      const urlFrom = from + label.length + 3;
      return {
        changes: { from, to, insert },
        range: text ? EditorSelection.range(urlFrom, urlFrom + 3) : EditorSelection.range(from + 1, from + 1 + label.length),
      };
    }),
    { userEvent: "input.format", scrollIntoView: true },
  );
  return true;
};

/** Every line touched by the selection, once each. */
function selectedLines(state: EditorState) {
  const seen = new Set<number>();
  const lines = [];
  for (const range of state.selection.ranges as readonly SelectionRange[]) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
      // A selection that ends at the very start of a line doesn't include it.
      if (n === last && n > state.doc.lineAt(range.from).number && range.to === state.doc.line(n).from) continue;
      if (!seen.has(n)) {
        seen.add(n);
        lines.push(state.doc.line(n));
      }
    }
  }
  return lines;
}

function applyLineChanges(view: EditorView, changes: ChangeSpec[]) {
  const { state } = view;
  const set = state.changes(changes);
  // assoc 1: a cursor at the start of a line moves past the inserted prefix.
  view.dispatch({ changes: set, selection: state.selection.map(set, 1), userEvent: "input.format", scrollIntoView: true });
}

const HEADING = /^(#{1,6})[ \t]+|^(#{1,6})$/;

/** Cycles the selected lines through # → ## → ### → plain text. */
export const cycleHeading: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view.state)) {
    const match = HEADING.exec(line.text);
    const level = match ? (match[1] ?? match[2]).length : 0;
    const next = level >= 3 ? "" : "#".repeat(level + 1) + " ";
    changes.push({ from: line.from, to: line.from + (match?.[0].length ?? 0), insert: next });
  }
  applyLineChanges(view, changes);
  return true;
};

const BULLET = /^(\s*)[-*+][ \t]+/;

/** Adds `- ` to the selected lines, or removes the bullets when every line already has one. */
export const toggleBulletList: Command = (view) => {
  const all = selectedLines(view.state);
  const lines = all.length > 1 ? all.filter((l) => l.text.trim() !== "") : all;
  const remove = lines.length > 0 && lines.every((l) => BULLET.test(l.text));
  const changes: ChangeSpec[] = lines.map((line) => {
    const bullet = BULLET.exec(line.text);
    if (remove) return { from: line.from + bullet![1].length, to: line.from + bullet![0].length };
    if (bullet) return [];
    const indent = /^\s*/.exec(line.text)![0].length;
    return { from: line.from + indent, insert: "- " };
  });
  applyLineChanges(view, changes);
  return true;
};

export type FormatKind = "bold" | "italic" | "heading" | "link" | "code" | "bullet";

export const formatCommands: Record<FormatKind, Command> = {
  bold: toggleBold,
  italic: toggleItalic,
  heading: cycleHeading,
  link: insertLink,
  code: toggleCode,
  bullet: toggleBulletList,
};

export const formatKeymap: KeyBinding[] = [
  { key: "Mod-b", run: toggleBold, preventDefault: true },
  { key: "Mod-i", run: toggleItalic, preventDefault: true },
  { key: "Mod-k", run: insertLink, preventDefault: true },
];
