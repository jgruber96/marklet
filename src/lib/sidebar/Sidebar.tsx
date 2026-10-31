/** Files above Outline. The file tree lands in milestone 4, the outline in milestone 5. */
export function Sidebar({ width }: { width: number }) {
  return (
    <aside className="sidebar" style={{ width }}>
      <section className="side-section">
        <h2>Files</h2>
        <div className="side-empty">Open a folder to browse its Markdown files.</div>
      </section>
      <section className="side-section">
        <h2>Outline</h2>
        <div className="side-empty">Headings in the current file appear here.</div>
      </section>
    </aside>
  );
}
