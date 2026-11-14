import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { showMenu as popUp, type MenuItem } from "../../components/PopupMenu";
import { ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderOpen } from "lucide-react";
import type { TreeNode } from "../stores/workspace";
import { baseName, samePath } from "../paths";
import { focusRow, moveFocus, syncTabStop } from "./roving";
import { isDesktop, isMacOS } from "../platform";

export interface FileTreeActions {
  onOpenFile(path: string): void;
  onOpenFolder(): void;
  onToggle(path: string): void;
  /** Each resolves true when it worked, so the inline name box can close. */
  onCreate(dir: string, name: string): Promise<boolean>;
  onRename(path: string, name: string): Promise<boolean>;
  onDelete(node: TreeNode): void;
  onReveal(path: string): void;
}

interface FileTreeProps extends FileTreeActions {
  root: string | null;
  nodes: TreeNode[];
  expanded: Set<string>;
  activePath: string | null;
}

/** An inline name box: a new file in `dir`, or a rename of `path`. */
type Editing = { kind: "new"; dir: string } | { kind: "rename"; path: string };

const revealLabel = isMacOS ? "Reveal in Finder" : "Show in Explorer";
const INDENT = 14;
const ROW = '.tree-row[role="treeitem"]';

export function FileTree(props: FileTreeProps) {
  const { root, nodes, expanded, activePath } = props;
  const [editing, setEditing] = useState<Editing | null>(null);
  const tree = useRef<HTMLDivElement>(null);

  // One tab stop for the whole tree: the open file's row, else the first row.
  useEffect(() => syncTabStop(tree.current, ROW, `${ROW}.active`));

  if (!root) {
    return (
      <div className="side-empty">
        <p>Open a folder to browse its Markdown files.</p>
        <button className="link-btn" onClick={props.onOpenFolder}>
          Open Folder…
        </button>
      </div>
    );
  }

  const startNew = (dir: string) => {
    if (dir !== root && !expanded.has(dir)) props.onToggle(dir);
    setEditing({ kind: "new", dir });
  };

  const showMenu = (e: MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = node ? (node.isDir ? node.path : null) : root;
    const items: MenuItem[] = [
      ...(node && !node.isDir ? [{ label: "Open", action: () => props.onOpenFile(node.path) }] : []),
      ...(dir ? [{ label: "New File…", action: () => startNew(dir) }] : []),
      ...(node
        ? [
            { separator: true as const },
            { label: "Rename…", shortcut: "F2", action: () => setEditing({ kind: "rename", path: node.path }) },
            { label: "Delete", shortcut: "Del", action: () => props.onDelete(node) },
          ]
        : []),
      // iOS has no Finder or Explorer to show the file in.
      ...(isDesktop ? [{ separator: true as const }, { label: revealLabel, action: () => props.onReveal(node?.path ?? root) }] : []),
    ];
    // The keyboard's menu key reports no pointer position: open at the row instead.
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const keyboard = e.clientX === 0 && e.clientY === 0;
    popUp(items, keyboard ? { x: box.left + 24, y: box.bottom } : { x: e.clientX, y: e.clientY }, { keyboard });
  };

  const onRowKey = (e: KeyboardEvent, node: TreeNode) => {
    if (moveFocus(e, tree.current, ROW)) return;
    const row = e.currentTarget as HTMLElement;
    const open = node.isDir && expanded.has(node.path);
    if (e.key === "ArrowRight" && node.isDir) {
      const rows = [...tree.current!.querySelectorAll<HTMLElement>(ROW)];
      const next = rows[rows.indexOf(row) + 1];
      if (!open) props.onToggle(node.path);
      else if (next) focusRow(rows, next); // into the folder's first entry
    } else if (e.key === "ArrowLeft") {
      if (open) props.onToggle(node.path);
      else {
        // To the folder that contains this row.
        const parentRow = row.parentElement?.parentElement?.closest('[role="group"]')?.firstElementChild;
        if (parentRow instanceof HTMLElement) focusRow([...tree.current!.querySelectorAll<HTMLElement>(ROW)], parentRow);
      }
    } else if (e.key === "F2") setEditing({ kind: "rename", path: node.path });
    else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) props.onDelete(node);
    else if (e.key === "Enter") node.isDir ? props.onToggle(node.path) : props.onOpenFile(node.path);
    else return;
    e.preventDefault();
  };

  const newRow = (dir: string, depth: number) =>
    editing?.kind === "new" && editing.dir === dir ? (
      <NameInput
        key="__new"
        depth={depth}
        initial="Untitled.md"
        onCancel={() => setEditing(null)}
        onCommit={async (name) => (await props.onCreate(dir, name)) && setEditing(null)}
      />
    ) : null;

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((node) => {
      if (editing?.kind === "rename" && editing.path === node.path) {
        return (
          <NameInput
            key={node.path}
            depth={depth}
            initial={node.name}
            isDir={node.isDir}
            onCancel={() => setEditing(null)}
            onCommit={async (name) =>
              name === node.name ? setEditing(null) : (await props.onRename(node.path, name)) && setEditing(null)
            }
          />
        );
      }
      const open = node.isDir && expanded.has(node.path);
      const active = !node.isDir && activePath !== null && samePath(node.path, activePath);
      return (
        <div key={node.path} role="group">
          <div
            role="treeitem"
            aria-expanded={node.isDir ? open : undefined}
            aria-selected={active}
            tabIndex={-1}
            className={`tree-row${active ? " active" : ""}`}
            style={{ paddingLeft: 8 + depth * INDENT }}
            title={node.path}
            onClick={() => (node.isDir ? props.onToggle(node.path) : props.onOpenFile(node.path))}
            onContextMenu={(e) => showMenu(e, node)}
            onKeyDown={(e) => onRowKey(e, node)}
          >
            {node.isDir ? (
              <>
                {open ? <ChevronDown size={14} className="tree-icon" /> : <ChevronRight size={14} className="tree-icon" />}
                {open ? <FolderOpen size={14} className="tree-icon folder" /> : <Folder size={14} className="tree-icon folder" />}
              </>
            ) : (
              <FileText size={14} className="tree-icon file" />
            )}
            <span className="tree-name">{node.name}</span>
          </div>
          {open && (
            <>
              {newRow(node.path, depth + 1)}
              {renderNodes(node.children ?? [], depth + 1)}
            </>
          )}
        </div>
      );
    });

  return (
    <div className="tree" ref={tree} onContextMenu={(e) => showMenu(e, null)}>
      <div className="tree-root" title={root}>
        <span className="tree-name">{baseName(root)}</span>
        <button className="icon-btn" onClick={() => startNew(root)} aria-label="New file" title="New file">
          <FilePlus size={14} />
        </button>
      </div>
      <div role="tree" aria-label={`Files in ${baseName(root)}`}>
        {newRow(root, 0)}
        {renderNodes(nodes, 0)}
      </div>
      {nodes.length === 0 && editing === null && <div className="side-empty">No Markdown files in this folder yet.</div>}
    </div>
  );
}

interface NameInputProps {
  depth: number;
  initial: string;
  isDir?: boolean;
  onCommit(name: string): Promise<unknown>;
  onCancel(): void;
}

/** Inline file-name box; Enter or leaving it commits, Escape cancels. */
function NameInput({ depth, initial, isDir, onCommit, onCancel }: NameInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = input.current!;
    el.focus();
    // Select the name without its extension, as file managers do.
    const dot = isDir ? -1 : initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, []);

  const commit = async () => {
    const name = input.current!.value.trim();
    if (done.current) return;
    if (!name) return onCancel();
    done.current = true;
    await onCommit(name);
    // Still mounted means it failed: let the user fix the name.
    done.current = false;
  };

  return (
    <div className="tree-row editing" style={{ paddingLeft: 8 + depth * INDENT }}>
      {isDir ? <Folder size={14} className="tree-icon folder" /> : <FileText size={14} className="tree-icon file" />}
      <input
        ref={input}
        className="tree-input"
        defaultValue={initial}
        spellCheck={false}
        aria-label="File name"
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          else if (e.key === "Escape") {
            done.current = true;
            onCancel();
          }
          e.stopPropagation();
        }}
        onBlur={() => void commit()}
      />
    </div>
  );
}
