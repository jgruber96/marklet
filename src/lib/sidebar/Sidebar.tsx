import { FileTree, type FileTreeActions } from "./FileTree";
import { Outline, type OutlineProps } from "./Outline";
import { FolderSearch, type SearchHit } from "./FolderSearch";
import type { TreeNode } from "../stores/workspace";

interface SidebarProps extends FileTreeActions {
  width: number;
  root: string | null;
  nodes: TreeNode[];
  expanded: Set<string>;
  activePath: string | null;
  outline: OutlineProps;
  /** Bumped to put the cursor in the folder search box. */
  searchFocus: number;
  onOpenHit(hit: SearchHit): void;
  /** Escape in the sidebar goes back to the editor. */
  onEscape(): void;
}

/** Files above Outline. */
export function Sidebar({ width, outline, onEscape, searchFocus, onOpenHit, ...tree }: SidebarProps) {
  return (
    <aside
      className="sidebar"
      style={{ width }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onEscape();
      }}
    >
      <section className="side-section side-files">
        <h2>Files</h2>
        <FolderSearch root={tree.root} focusRequest={searchFocus} onOpenHit={onOpenHit}>
          <FileTree {...tree} />
        </FolderSearch>
      </section>
      <section className="side-section">
        <h2>Outline</h2>
        <Outline {...outline} />
      </section>
    </aside>
  );
}
