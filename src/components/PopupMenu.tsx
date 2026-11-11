import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight } from "lucide-react";

/*
 * Marklet's own popup menus (the app menu, Export, the file tree's right-click
 * menu), drawn in the app's look in place of the system's. `showMenu` opens
 * one from anywhere; `<PopupMenuHost />` (mounted once in App) draws it.
 *
 * Mouse: hover opens a submenu, click chooses, click elsewhere closes.
 * Keys: Up / Down move, Right or Enter opens a submenu, Left closes it,
 * Enter or Space chooses, Home / End jump, Esc closes.
 */

export type MenuItem =
  | { separator: true }
  | {
      label: string;
      /** Dimmed text at the right: a shortcut such as "Ctrl+S" (handled elsewhere), or a short note. */
      shortcut?: string;
      /** A tick; `radio` draws it as one choice of a group. */
      checked?: boolean;
      radio?: boolean;
      disabled?: boolean;
      action?(): void;
      submenu?: MenuItem[];
      /** Shown as a tooltip, for labels that may be cut short (file paths). */
      title?: string;
    };

interface OpenMenu {
  items: MenuItem[];
  x: number;
  y: number;
  /** Where the keyboard focus goes back to when the menu closes. */
  returnTo: HTMLElement | null;
  /** Opened from the keyboard: start with the first item highlighted. */
  keyboard: boolean;
}

let open: (menu: OpenMenu | null) => void = () => {};

/** Opens a menu with its top-left corner at (x, y), in window coordinates. */
export function showMenu(items: MenuItem[], at: { x: number; y: number }, options: { keyboard?: boolean } = {}): void {
  open({ items, ...at, returnTo: document.activeElement instanceof HTMLElement ? document.activeElement : null, keyboard: !!options.keyboard });
}

export function PopupMenuHost() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  useEffect(() => {
    open = setMenu;
    return () => {
      open = () => {};
    };
  }, []);

  if (!menu) return null;
  const close = (refocus = true) => {
    setMenu(null);
    if (refocus) menu.returnTo?.focus();
  };
  return (
    <div
      className="menu-layer"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) close();
      }}
    >
      <Panel
        items={menu.items}
        at={{ x: menu.x, y: menu.y }}
        first={menu.keyboard}
        onClose={() => close()}
        onChoose={(item) => {
          // The action decides where focus goes next (a dialog, the editor).
          close(false);
          item.action?.();
        }}
      />
    </div>
  );
}

type Entry = Exclude<MenuItem, { separator: true }>;
const isEntry = (item: MenuItem): item is Entry => !("separator" in item);
const usable = (item: MenuItem) => isEntry(item) && !item.disabled;

interface PanelProps {
  items: MenuItem[];
  /** Root: the corner to open at. Submenu: the parent item's box, to open beside. */
  at: { x: number; y: number } | DOMRect;
  /** Highlight the first item at once (opened from the keyboard). */
  first: boolean;
  onClose(): void;
  onChoose(item: Entry): void;
  /** Submenus: Left arrow or Esc closes just this panel. */
  onBack?(): void;
}

function Panel({ items, at, first, onClose, onChoose, onBack }: PanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => (first ? items.findIndex(usable) : -1));
  /** The open submenu: the item's index, its box, and whether it was opened from the keyboard. */
  const [sub, setSub] = useState<{ index: number; box: DOMRect; keyboard: boolean } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  // Keep the panel inside the window: a root menu shifts, a submenu flips to the other side.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 6;
    let left: number;
    let top: number;
    if (at instanceof DOMRect) {
      left = at.right - 2;
      if (left + width > innerWidth - margin) left = at.left - width + 2;
      top = at.top - 5;
    } else {
      left = at.x;
      top = at.y;
    }
    setPlace({
      left: Math.max(margin, Math.min(left, innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, innerHeight - height - margin)),
    });
  }, []);

  // Take the keyboard once the panel is placed and visible (a hidden element cannot be focused).
  useEffect(() => {
    if (place) panel.current?.focus();
  }, [place !== null]);

  const move = (step: 1 | -1, from = active) => {
    for (let i = 1; i <= items.length; i++) {
      const next = (from + step * i + items.length * i) % items.length;
      if (usable(items[next])) return setActive(next);
    }
  };

  const openSub = (index: number, keyboard: boolean) => {
    const row = panel.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (row) setSub({ index, box: row.getBoundingClientRect(), keyboard });
  };

  const choose = (index: number, keyboard: boolean) => {
    const item = items[index];
    if (!item || !usable(item) || !isEntry(item)) return;
    if (item.submenu) openSub(index, keyboard);
    else onChoose(item);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Keys belong to the deepest open panel; they never reach the editor.
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const item = items[active];
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1, active < 0 ? 0 : active);
    else if (e.key === "Home") move(1, -1);
    else if (e.key === "End") move(-1, 0);
    else if (e.key === "ArrowRight" && item && isEntry(item) && item.submenu && usable(item)) openSub(active, true);
    else if (e.key === "ArrowLeft" && onBack) onBack();
    else if (e.key === "Enter" || e.key === " ") choose(active, true);
    else if (e.key === "Escape") (onBack ?? onClose)();
    else if (e.key === "Tab") onClose();
    else if (e.key.length === 1) {
      // Typing a letter jumps to the next item that starts with it.
      const letter = e.key.toLowerCase();
      for (let i = 1; i <= items.length; i++) {
        const next = (Math.max(active, 0) + i) % items.length;
        const candidate = items[next];
        if (usable(candidate) && isEntry(candidate) && candidate.label.toLowerCase().startsWith(letter)) {
          setActive(next);
          break;
        }
      }
    } else return;
    e.preventDefault();
  };

  const opened = sub ? items[sub.index] : null;

  return (
    <>
      <div
        ref={panel}
        className="menu"
        role="menu"
        tabIndex={-1}
        style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
        onKeyDown={onKeyDown}
        onMouseLeave={() => !sub && setActive(-1)}
      >
        {items.map((item, i) => {
          if (!isEntry(item)) return <div key={i} className="menu-sep" role="separator" />;
          const checkable = item.checked !== undefined;
          return (
            <div
              key={i}
              data-index={i}
              className={`menu-item${i === active || i === sub?.index ? " active" : ""}${item.disabled ? " disabled" : ""}`}
              role={checkable ? (item.radio ? "menuitemradio" : "menuitemcheckbox") : "menuitem"}
              aria-checked={checkable ? item.checked : undefined}
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.submenu ? "menu" : undefined}
              aria-expanded={item.submenu ? i === sub?.index : undefined}
              title={item.title}
              onMouseEnter={() => {
                if (item.disabled) return setActive(-1);
                setActive(i);
                if (item.submenu) openSub(i, false);
                else setSub(null);
              }}
              onClick={() => choose(i, false)}
            >
              <span className="menu-mark" aria-hidden>
                {item.checked && (item.radio ? <span className="menu-dot" /> : <Check size={14} />)}
              </span>
              <span className="menu-label">{item.label}</span>
              {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
              {item.submenu && <ChevronRight size={14} className="menu-more" aria-hidden />}
            </div>
          );
        })}
      </div>
      {sub && opened && isEntry(opened) && opened.submenu && (
        <Panel
          key={sub.index}
          items={opened.submenu}
          at={sub.box}
          first={sub.keyboard}
          onClose={onClose}
          onChoose={onChoose}
          onBack={() => {
            setSub(null);
            setActive(sub.index);
            panel.current?.focus();
          }}
        />
      )}
    </>
  );
}
