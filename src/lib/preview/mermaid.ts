import { embedsChanged, track } from "./embeds";
import { escapeHtml } from "./highlight";

/*
 * Mermaid diagrams for ```mermaid fences. Mermaid is large and renders
 * asynchronously, so it loads on first use and works through a queue off the
 * typing path; the Markdown pass shows the previous drawing (or a stand-in)
 * and the preview re-renders when a diagram is ready.
 *
 * Mermaid bakes its colors into the SVG, so every diagram is drawn twice,
 * for light and for dark; CSS shows the one that matches the theme, and print
 * and exports get the right one without re-rendering.
 */

interface Drawing {
  light: string;
  dark: string;
}
type Result = { ok: Drawing } | { error: string };

const results = new Map<string, Result>();
const RESULT_LIMIT = 60;
const queue = new Set<string>();
/** Diagram sources the latest Markdown pass asked for; anything else in the queue is stale. */
let wanted = new Set<string>();
let worker: Promise<void> | null = null;
let serial = 0;

/** The last good drawing at each position in the current document, shown while its edit renders. */
let lastGood: Drawing[] = [];
let lastGoodDoc: unknown = null;
let keepPrevious = false;

/**
 * Call at the start of each Markdown pass. `docKey` identifies the open
 * document so previous drawings never carry over to another file; pass null
 * (exports) to show only up-to-date drawings.
 */
export function beginDiagramPass(docKey: unknown): void {
  wanted = new Set();
  keepPrevious = docKey !== null;
  if (keepPrevious && docKey !== lastGoodDoc) {
    lastGood = [];
    lastGoodDoc = docKey;
  }
}

function request(code: string): void {
  queue.add(code);
  if (!worker) startWorker();
}

function startWorker(): void {
  worker = track(
    work()
      .catch((err) => console.error("Could not render diagrams", err))
      .then(() => {
        worker = null;
        if (queue.size) startWorker();
      }),
  );
}

async function work(): Promise<void> {
  const { default: mermaid } = await import("mermaid");
  await document.fonts.ready; // labels are measured in the interface font
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim() || "sans-serif";

  while (queue.size) {
    const code: string = queue.values().next().value!;
    queue.delete(code);
    if (!wanted.has(code)) continue;

    let result: Result;
    try {
      const drawing = {} as Drawing;
      for (const scheme of ["light", "dark"] as const) {
        const id = `mermaid-${++serial}`;
        try {
          // "strict" makes Mermaid sanitize labels and ignore click handlers.
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: scheme === "dark" ? "dark" : "default",
            fontFamily,
          });
          drawing[scheme] = (await mermaid.render(id, code)).svg;
        } finally {
          document.getElementById(`d${id}`)?.remove(); // Mermaid's scratch element, if it was left behind
        }
      }
      result = { ok: drawing };
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }
    if (results.size >= RESULT_LIMIT) results.delete(results.keys().next().value!);
    results.set(code, result);
    embedsChanged();
  }
}

const figure = (d: Drawing) =>
  `<div class="mermaid-diagram" data-scheme="light">${d.light}</div><div class="mermaid-diagram" data-scheme="dark">${d.dark}</div>`;

/**
 * HTML for the `index`-th diagram of the document. Contains Mermaid's own
 * (sanitized) SVG with its inline styles, so the caller must insert it after
 * sanitizing the surrounding Markdown.
 */
export function diagramHtml(source: string, index: number): string {
  const code = source.trim();
  if (!code) return `<div class="mermaid-note">Empty diagram</div>`;
  wanted.add(code);

  const hit = results.get(code);
  if (hit && "ok" in hit) {
    if (keepPrevious) lastGood[index] = hit.ok;
    return figure(hit.ok);
  }
  if (!hit) request(code);

  const previous = keepPrevious ? lastGood[index] : undefined;
  const error = hit ? `<div class="mermaid-error">${escapeHtml(hit.error)}</div>` : "";
  if (previous) return `<div class="mermaid-stale">${figure(previous)}</div>${error}`;
  if (hit) return `${error}<pre><code>${escapeHtml(code)}</code></pre>`;
  return `<div class="mermaid-note">Rendering diagram…</div>`;
}
