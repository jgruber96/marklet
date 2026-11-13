import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, FileText, Search } from "lucide-react";
import { fuzzyFilter } from "../lib/fuzzy";

/*
 * The command palette: one box that finds a note by name, or (after ">") any
 * command. Ctrl/Cmd+T opens it for notes, Ctrl/Cmd+Shift+P for commands.
 * Up / Down move, Enter chooses, Esc closes.
 */

export interface PaletteItem {
  id: string;
  label: string;
  /** Dimmed text after the label: a command's menu, a note's folder. */
  detail?: string;
  /** Right-aligned: a command's shortcut. */
  hint?: string;
  checked?: boolean;
  run(): void;
}

interface CommandPaletteProps {
  /** What the box starts with: "" for notes, ">" for commands. */
  initial: string;
  notes: PaletteItem[];
  commands: PaletteItem[];
  onClose(): void;
}

export function CommandPalette({ initial, notes, commands, onClose }: CommandPaletteProps) {
  const [text, setText] = useState(initial);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const forCommands = text.startsWith(">");
  const query = forCommands ? text.slice(1).trim() : text.trim();
  const results = useMemo(
    () => fuzzyFilter(query, forCommands ? commands : notes, (item) => (item.detail && forCommands ? `${item.detail}: ${item.label}` : item.label)),
    [query, forCommands, commands, notes],
  );

  useEffect(() => {
    input.current?.focus();
    // Leave the cursor after the ">", ready to type.
    input.current?.setSelectionRange(initial.length, initial.length);
  }, []);
  useEffect(() => setActive(0), [text]);
  useEffect(() => {
    list.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const choose = (index: number) => {
    const picked = results[index]?.item;
    if (!picked) return;
    onClose();
    picked.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // The palette owns the keyboard while it is open.
    e.stopPropagation();
    const last = results.length - 1;
    if (e.key === "ArrowDown") setActive((i) => (i >= last ? 0 : i + 1));
    else if (e.key === "ArrowUp") setActive((i) => (i <= 0 ? last : i - 1));
    else if (e.key === "PageDown") setActive((i) => Math.min(last, i + 8));
    else if (e.key === "PageUp") setActive((i) => Math.max(0, i - 8));
    else if (e.key === "Enter") choose(active);
    else if (e.key === "Escape") onClose();
    else if (e.key === "Tab") {
      // Tab stays in the box.
    } else return;
    e.preventDefault();
  };

  const empty = forCommands ? "No matching command." : notes.length === 0 ? "No notes yet. Open a folder to find its notes here." : "No matching note.";

  return (
    <div className="palette-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={forCommands ? "Command palette" : "Go to note"} onKeyDown={onKeyDown}>
        <div className="palette-box">
          <Search size={15} aria-hidden />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-option-${active}` : undefined}
            aria-label={forCommands ? "Command" : "Note name, or > for commands"}
            placeholder="Go to a note, or type > for commands"
            spellCheck={false}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={list}>
          {results.map(({ item, match }, i) => (
            <div
              key={item.id}
              id={`palette-option-${i}`}
              role="option"
              aria-selected={i === active}
              className={`palette-item${i === active ? " active" : ""}`}
              onMouseMove={() => i !== active && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="palette-mark" aria-hidden>
                {forCommands ? item.checked && <Check size={14} /> : <FileText size={14} />}
              </span>
              <span className="palette-label">
                {forCommands && item.detail && <span className="palette-group">{item.detail}: </span>}
                {highlight(item.label, forCommands && item.detail ? match.positions.map((p) => p - item.detail!.length - 2) : match.positions)}
              </span>
              {!forCommands && item.detail && <span className="palette-detail">{item.detail}</span>}
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </div>
          ))}
          {results.length === 0 && <div className="palette-empty">{empty}</div>}
        </div>
        <div className="palette-foot" aria-hidden>
          <span>↑↓ to move</span>
          <span>Enter to choose</span>
          <span>{forCommands ? "Delete > to find notes" : "> for commands"}</span>
        </div>
      </div>
    </div>
  );
}

/** The label with its matched characters marked. */
function highlight(label: string, positions: number[]): ReactNode {
  const marked = new Set(positions.filter((p) => p >= 0 && p < label.length));
  if (marked.size === 0) return label;
  const parts: ReactNode[] = [];
  for (let i = 0; i < label.length; ) {
    const on = marked.has(i);
    let j = i;
    while (j < label.length && marked.has(j) === on) j++;
    parts.push(on ? <mark key={i}>{label.slice(i, j)}</mark> : label.slice(i, j));
    i = j;
  }
  return parts;
}
