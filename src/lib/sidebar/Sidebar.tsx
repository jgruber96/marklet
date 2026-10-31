import { FileTree, type FileTreeActions } from "./FileTree";
import type { TreeNode } from "../stores/workspace";

interface SidebarProps extends FileTreeActions {
  width: number;
  root: string | null;
  nodes: TreeNode[];
  expanded: Set<string>;
  activePath: string | null;
}

/** Files above Outline. The outline lands in milestone 5. */
export function Sidebar({ width, ...tree }: SidebarProps) {
  return (
    <aside className="sidebar" style={{ width }}>
      <section className="side-section side-files">
        <h2>Files</h2>
        <FileTree {...tree} />
      </section>
      <section className="side-section">
        <h2>Outline</h2>
        <div className="side-empty">Headings in the current file appear here.</div>
      </section>
    </aside>
  );
}
