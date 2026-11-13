import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import themeCss from "../../styles/theme.css?raw";
import previewCss from "../../styles/preview.css?raw";
// Latin subsets of the app's fonts, embedded so an export looks the same anywhere (~90 KB).
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?inline";
import inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff2?inline";
import mono400 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?inline";
import mono700 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?inline";
import { renderMarkdown } from "../preview/render";
import { escapeHtml, highlightingIdle } from "../preview/highlight";
import { embedsIdle } from "../preview/embeds";
import { katexStandaloneCss } from "../preview/math";
import { findHeadings } from "../sidebar/headings";
import { dirOf, joinPath } from "../paths";
import type { AccentSetting, ThemeSetting } from "../stores/settings";
import { isDesktop, isMacOS } from "../platform";

export type ExportKind = "html" | "pdf";

/** Save dialog for an export, defaulting to the document's folder and name. */
export async function pickExportPath(kind: ExportKind, docPath: string | null, name: string): Promise<string | null> {
  const base = name.replace(/\.(md|markdown)$/i, "");
  const file = `${base}.${kind}`;
  const dir = dirOf(docPath);
  return save({
    defaultPath: dir ? joinPath(dir, file) : file,
    filters: [kind === "html" ? { name: "HTML", extensions: ["html", "htm"] } : { name: "PDF", extensions: ["pdf"] }],
  });
}

/** Local images in the preview are asset-protocol URLs; this recovers the file path. */
function assetUrlToPath(src: string): string | null {
  const m = /^(?:https?:\/\/asset\.localhost\/|asset:\/\/localhost\/)(.+)$/.exec(src);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Renders after loading every code grammar the document uses, so all blocks are colored. */
async function renderComplete(source: string, baseDir: string | null): Promise<string> {
  renderMarkdown(source, baseDir);
  // Math and diagrams load and draw in the background; the second pass has them all.
  await Promise.all([highlightingIdle(), embedsIdle()]);
  return renderMarkdown(source, baseDir);
}

const fontFace = (family: string, weight: number, url: string) =>
  `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal; font-display: swap; src: url(${url}) format("woff2"); }`;

// Fonts and page chrome for the exported file; everything else comes from theme.css and preview.css.
const EXPORT_CSS = `
${fontFace("Inter", 400, inter400)}
${fontFace("Inter", 600, inter600)}
${fontFace("JetBrains Mono", 400, mono400)}
${fontFace("JetBrains Mono", 700, mono700)}
body { margin: 0; background: var(--bg); color: var(--text); }
.markdown-body { padding: 40px 32px 64px; }
`;

/**
 * A standalone HTML file: theme and preview styles inlined, code already
 * highlighted, local images embedded as data URIs, no scripts.
 */
export async function buildHtml(
  source: string,
  baseDir: string | null,
  fallbackTitle: string,
  theme: ThemeSetting,
  accent: AccentSetting,
): Promise<string> {
  const tpl = document.createElement("template");
  tpl.innerHTML = await renderComplete(source, baseDir);
  const body = tpl.content;
  body.querySelectorAll(".code-copy").forEach((el) => el.remove());
  body.querySelectorAll("[data-line]").forEach((el) => el.removeAttribute("data-line"));
  await Promise.all(
    [...body.querySelectorAll("img")].map(async (img) => {
      const path = assetUrlToPath(img.getAttribute("src") ?? "");
      if (!path || !isTauri()) return;
      try {
        img.setAttribute("src", await invoke<string>("read_image_data_uri", { path }));
      } catch {
        // Too large or unreadable: link to the file instead.
        img.setAttribute("src", "file:///" + path.replace(/\\/g, "/").replace(/^\/+/, ""));
      }
    }),
  );
  // Math needs KaTeX's stylesheet and fonts; only documents that use it carry them.
  const mathCss = body.querySelector(".katex") ? await katexStandaloneCss() : "";
  const holder = document.createElement("div");
  holder.append(body);

  const title = findHeadings(source)[0]?.text || fallbackTitle;
  const attrs = [theme !== "system" && `data-theme="${theme}"`, accent !== "blue" && `data-accent="${accent}"`].filter(Boolean);
  return `<!doctype html>
<html lang="en"${attrs.length ? " " + attrs.join(" ") : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Marklet">
<title>${escapeHtml(title)}</title>
<style>
${themeCss}
${previewCss}
${EXPORT_CSS}
${mathCss}
</style>
</head>
<body>
<article class="markdown-body">
${holder.innerHTML}
</article>
</body>
</html>
`;
}

export async function writeHtml(path: string, html: string): Promise<void> {
  await invoke("write_file", { path, text: html, lineEnding: "\n", bom: false });
}

/** PDF needs no path on macOS (the print dialog's PDF button saves it) or iOS (the share sheet will). */
export const pdfNeedsPath = isDesktop && !isMacOS;

/**
 * Prints the preview (styles/print.css hides the rest of the window). Windows
 * writes `path` directly; macOS opens the print dialog.
 */
export async function printPdf(path: string | null, title: string): Promise<void> {
  await Promise.all([highlightingIdle(), embedsIdle()]);
  // Let the preview re-render with every grammar, formula and diagram ready (it throttles at 40 ms).
  await new Promise((r) => setTimeout(r, 150));
  const previous = document.title;
  document.title = title.replace(/\.(md|markdown)$/i, ""); // the print dialog's default file name
  try {
    await invoke("print_to_pdf", { path: path ?? "" });
  } finally {
    document.title = previous;
  }
}
