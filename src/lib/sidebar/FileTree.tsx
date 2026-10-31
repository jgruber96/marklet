import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { ChevronDown, ChevronRight, FilePlus, FileText } from "lucide-react";
import type { TreeNode } from "../stores/workspace";
import { baseName, samePath } from "../paths";

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

const revealLabel = navigator.userAgent.includes("Mac") ? "Reveal in Finder" : "Show in Explorer";
const INDENT = 14;

export function FileTree(props: FileTreeProps) {
  const { root, nodes, expanded, activePath } = props;
  const [editing, setEditing] = useState<Editing | null>(null);

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

  const showMenu = async (e: MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTauri()) return;
    const dir = node ? (node.isDir ? node.path : null) : root;
    const items = [
      ...(node && !node.isDir ? [{ text: "Open", action: () => props.onOpenFile(node.path) }] : []),
      ...(dir ? [{ text: "New File…", action: () => startNew(dir) }] : []),
      ...(node
        ? [
            { item: "Separator" as const },
            { text: "Rename…", action: () => setEditing({ kind: "rename", path: node.path }) },
            { text: "Delete", action: () => props.onDelete(node) },
          ]
        : []),
      { item: "Separator" as const },
      { text: revealLabel, action: () => props.onReveal(node?.path ?? root) },
    ];
    const menu = await Menu.new({ items });
    await menu.popup();
  };

  const onRowKey = (e: KeyboardEvent, node: TreeNode) => {
    if (e.key === "F2") setEditing({ kind: "rename", path: node.path });
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
            tabIndex={0}
            className={`tree-row${active ? " active" : ""}`}
            style={{ paddingLeft: 8 + depth * INDENT }}
            title={node.path}
            onClick={() => (node.isDir ? props.onToggle(node.path) : props.onOpenFile(node.path))}
            onContextMenu={(e) => showMenu(e, node)}
            onKeyDown={(e) => onRowKey(e, node)}
          >
            {node.isDir ? (
              open ? <ChevronDown size={14} className="tree-icon" /> : <ChevronRight size={14} className="tree-icon" />
            ) : (
              <FileText size={14} className="tree-icon" />
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
    <div className="tree" role="tree" aria-label="Files" onContextMenu={(e) => showMenu(e, null)}>
      <div className="tree-root" title={root}>
        <span className="tree-name">{baseName(root)}</span>
        <button className="icon-btn" onClick={() => startNew(root)} aria-label="New file" title="New file">
          <FilePlus size={14} />
        </button>
      </div>
      {newRow(root, 0)}
      {renderNodes(nodes, 0)}
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
      {isDir ? <ChevronRight size={14} className="tree-icon" /> : <FileText size={14} className="tree-icon" />}
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
