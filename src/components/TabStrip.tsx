import { useEffect, useRef } from "react";
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

export function TabStrip({ tabs, activeId, onSelect, onClose, onNew }: TabStripProps) {
  const strip = useRef<HTMLDivElement>(null);

  // Keep the front tab visible when there are more tabs than fit.
  useEffect(() => {
    strip.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  return (
    <div className="tabstrip">
      <div
        className="tabs"
        role="tablist"
        ref={strip}
        onWheel={(e) => {
          if (e.deltaY) strip.current!.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeId ? " active" : ""}`}
            role="tab"
            aria-selected={tab.id === activeId}
            title={tab.title}
            onMouseDown={(e) => {
              if (e.button === 0) onSelect(tab.id);
            }}
            onAuxClick={(e) => {
              // Middle-click closes, as in browsers and editors.
              if (e.button === 1) onClose(tab.id);
            }}
          >
            <span className="tab-name">{tab.name}</span>
            {tab.dirty && <span className="tab-dot" aria-label="Unsaved changes" />}
            <button
              className="tab-close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onClose(tab.id)}
              aria-label={`Close ${tab.name}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new" onClick={onNew} aria-label="New tab" title="New tab">
        <Plus size={16} />
      </button>
    </div>
  );
}
