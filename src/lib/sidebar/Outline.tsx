import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { findHeadings } from "./headings";
import { moveFocus, syncTabStop } from "./roving";

export interface OutlineProps {
  source: string;
  /** Source line at the top of the visible pane, or null before the panes exist. */
  topLine(): number | null;
  /** Registers a scroll listener; returns the unsubscribe function. */
  onScroll(listener: () => void): () => void;
  onJump(line: number): void;
}

const INDENT = 12;

export function Outline({ source, topLine, onScroll, onJump }: OutlineProps) {
  const deferred = useDeferredValue(source);
  const headings = useMemo(() => findHeadings(deferred), [deferred]);
  const minLevel = Math.min(...headings.map((h) => h.level));
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);

  // The heading in view: the last one at or above the top of the pane.
  useEffect(() => {
    const update = () => {
      const top = topLine();
      if (top === null) return;
      let index = -1;
      for (let i = 0; i < headings.length && headings[i].line <= top + 0.5; i++) index = i;
      setActive(index);
    };
    update();
    return onScroll(update);
  }, [headings, topLine, onScroll]);

  useEffect(() => {
    list.current?.querySelector(".outline-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // One tab stop for the outline: the heading in view; arrows move between headings.
  useEffect(() => syncTabStop(list.current, ".outline-item", ".outline-item.active"));

  if (headings.length === 0) return <div className="side-empty">Headings in the current file appear here.</div>;

  return (
    <div className="outline" ref={list} role="list">
      {headings.map((h, i) => (
        <button
          key={`${h.line}:${h.text}`}
          role="listitem"
          className={`outline-item${i === active ? " active" : ""}`}
          style={{ paddingLeft: 14 + (h.level - minLevel) * INDENT }}
          title={h.text}
          tabIndex={-1}
          onClick={() => onJump(h.line)}
          onKeyDown={(e) => moveFocus(e, list.current, ".outline-item")}
        >
          {h.text || <span className="outline-blank">(empty heading)</span>}
        </button>
      ))}
    </div>
  );
}
