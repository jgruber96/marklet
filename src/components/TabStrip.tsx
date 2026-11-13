import { useEffect, useRef, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

export interface TabInfo {
  id: number;
  name: string;
  title: string;
  dirty: boolean;
}

interface TabStripProps {
  tabs: TabInfo[];
  activeId: number;
  onSelect(id: number): void;
  onClose(id: number): void;
  onNew(): void;
}

/**
 * The open files. One tab is in the Tab order (the front one); Left and Right
 * move between tabs, Enter or Space brings one to the front, Delete closes it.
 * The close buttons are for the mouse (the keyboard has Delete and Ctrl/Cmd+W).
 */
export function TabStrip({ tabs, activeId, onSelect, onClose, onNew }: TabStripProps) {
  const strip = useRef<HTMLDivElement>(null);

  // Keep the front tab visible when there are more tabs than fit.
  useEffect(() => {
    strip.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, id: number) => {
    const all = [...(strip.current?.querySelectorAll<HTMLButtonElement>(".tab-main") ?? [])];
    const i = all.indexOf(e.currentTarget);
    const target =
      e.key === "ArrowRight" ? all[i + 1] : e.key === "ArrowLeft" ? all[i - 1] : e.key === "Home" ? all[0] : e.key === "End" ? all[all.length - 1] : undefined;
    if (e.key === "Delete") onClose(id);
    else if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    target?.focus();
  };

  return (
    <nav className="tabstrip" aria-label="Open files">
      <div
        className="tabs"
        role="tablist"
        aria-label="Open files"
        ref={strip}
        onWheel={(e) => {
          if (e.deltaY) strip.current!.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`tab${active ? " active" : ""}`}
              role="presentation"
              title={tab.title}
              onMouseDown={(e) => {
                if (e.button === 0) onSelect(tab.id);
              }}
              onAuxClick={(e) => {
                // Middle-click closes, as in browsers and editors.
                if (e.button === 1) onClose(tab.id);
              }}
            >
              <button
                className="tab-main"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                // A mouse press has already selected it (above); this is for Enter and Space.
                onClick={(e) => e.detail === 0 && onSelect(tab.id)}
                onKeyDown={(e) => onTabKey(e, tab.id)}
              >
                <span className="tab-name">{tab.name}</span>
                {tab.dirty && <span className="tab-dot" role="img" aria-label="Unsaved changes" />}
              </button>
              <button
                className="tab-close"
                // For the mouse only: hidden from the keyboard and screen readers, which close with Delete.
                tabIndex={-1}
                aria-hidden
                title="Close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onClose(tab.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="tab-new" onClick={onNew} aria-label="New tab" title="New tab">
        <Plus size={16} />
      </button>
    </nav>
  );
}
