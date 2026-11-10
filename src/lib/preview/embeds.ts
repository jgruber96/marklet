/*
 * Shared plumbing for preview content that renders asynchronously (math and
 * diagrams): the libraries load on first use and diagrams render off the
 * typing path, so the Markdown pass shows a stand-in and the preview renders
 * again when the real output is ready.
 */

const listeners = new Set<() => void>();
const pending = new Set<Promise<unknown>>();

/** Called when math or a diagram finishes rendering, so the preview can re-render. */
export function onEmbedsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function embedsChanged(): void {
  listeners.forEach((fn) => fn());
}

/** Registers background work that `embedsIdle` should wait for. */
export function track<T>(work: Promise<T>): Promise<T> {
  pending.add(work);
  const done = () => pending.delete(work);
  work.then(done, done);
  return work;
}

/** Resolves once nothing is loading or rendering (export renders, waits, renders again). */
export async function embedsIdle(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
