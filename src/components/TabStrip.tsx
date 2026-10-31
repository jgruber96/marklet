import { Plus, X } from "lucide-react";

interface TabStripProps {
  name: string;
  dirty: boolean;
  onClose(): void;
  onNew(): void;
}

/** One tab for now; multiple tabs and session restore arrive in milestone 4. */
export function TabStrip({ name, dirty, onClose, onNew }: TabStripProps) {
  return (
    <div className="tabstrip" role="tablist">
      <div className="tab active" role="tab" aria-selected="true" title={name}>
        <span className="tab-name">{name}</span>
        {dirty && <span className="tab-dot" aria-label="Unsaved changes" />}
        <button className="tab-close" onClick={onClose} aria-label={`Close ${name}`}>
          <X size={14} />
        </button>
      </div>
      <button className="tab-new" onClick={onNew} aria-label="New tab" title="New tab">
        <Plus size={16} />
      </button>
    </div>
  );
}
