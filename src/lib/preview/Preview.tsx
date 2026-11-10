import { forwardRef, useEffect, useImperativeHandle, useRef, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { renderMarkdown } from "./render";
import { onHighlighterChange } from "./highlight";
import { onEmbedsChange } from "./embeds";
import { followLink } from "../links";

/** Longest a keystroke waits before the preview re-renders (brief: within 150 ms). */
const RENDER_INTERVAL_MS = 40;

export interface PreviewHandle {
  pane: HTMLDivElement;
  content: HTMLDivElement;
}

interface PreviewProps {
  source: string;
  baseDir: string | null;
  /** Identifies the open document; changes when another tab is shown. */
  docId: number;
  hidden: boolean;
  onRendered(): void;
  /** A link to another Markdown file was clicked. */
  onOpenFile(path: string): void;
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(props, ref) {
  const pane = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const timer = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({ pane: pane.current!, content: content.current! }), []);

  // Throttle: the first change schedules a render, later changes inside the
  // interval ride along with it, so typing never waits on a pause.
  const scheduleRender = () => {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const { source, baseDir, docId, onRendered } = latest.current;
      if (content.current) content.current.innerHTML = renderMarkdown(source, baseDir, docId);
      onRendered();
    }, RENDER_INTERVAL_MS);
  };

  useEffect(scheduleRender, [props.source, props.baseDir, props.docId]);

  useEffect(() => {
    // A code block's grammar finished loading: re-render to color it.
    const unsubscribe = onHighlighterChange(scheduleRender);
    // Likewise when math or a diagram is ready.
    const unsubscribeEmbeds = onEmbedsChange(scheduleRender);
    return () => {
      unsubscribe();
      unsubscribeEmbeds();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const copyCode = (button: HTMLButtonElement) => {
    const code = button.closest(".code-block")?.querySelector("code")?.textContent ?? "";
    // The native clipboard works whether or not the web view has focus.
    const write = isTauri() ? writeText(code) : navigator.clipboard.writeText(code);
    void write.then(
      () => {
        button.textContent = "Copied";
        window.setTimeout(() => (button.textContent = "Copy"), 1200);
      },
      () => (button.textContent = "Copy failed"),
    );
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-copy");
    if (copy) return copyCode(copy);
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    // Never let the web view itself navigate away from the app.
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // Use as-is.
      }
      const target = id && content.current?.querySelector(`[id="${CSS.escape(id)}"]`);
      if (target) target.scrollIntoView({ block: "start" });
    } else {
      // Web links open in the browser; a link to another note opens it in a tab.
      const { baseDir, onOpenFile } = latest.current;
      followLink(href, baseDir, onOpenFile);
    }
  };

  return (
    <div ref={pane} className="pane pane-preview" style={{ display: props.hidden ? "none" : undefined }} onClick={onClick}>
      <div ref={content} className="markdown-body" />
    </div>
  );
});
