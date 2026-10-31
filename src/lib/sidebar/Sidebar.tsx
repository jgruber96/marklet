import { FileTree, type FileTreeActions } from "./FileTree";
import { Outline, type OutlineProps } from "./Outline";
import type { TreeNode } from "../stores/workspace";

interface SidebarProps extends FileTreeActions {
  width: number;
  root: string | null;
  nodes: TreeNode[];
  expanded: Set<string>;
  activePath: string | null;
  outline: OutlineProps;
}

/** Files above Outline. */
export function Sidebar({ width, outline, ...tree }: SidebarProps) {
  return (
    <aside className="sidebar" style={{ width }}>
      <section className="side-section side-files">
        <h2>Files</h2>
        <FileTree {...tree} />
      </section>
      <section className="side-section">
        <h2>Outline</h2>
        <Outline {...outline} />
      </section>
    </aside>
  );
}
