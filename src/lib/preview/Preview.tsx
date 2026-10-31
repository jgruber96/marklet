import { forwardRef, useEffect, useImperativeHandle, useRef, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "./render";

/** Longest a keystroke waits before the preview re-renders (brief: within 150 ms). */
const RENDER_INTERVAL_MS = 40;

export interface PreviewHandle {
  pane: HTMLDivElement;
  content: HTMLDivElement;
}

interface PreviewProps {
  source: string;
  baseDir: string | null;
  hidden: boolean;
  onRendered(): void;
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
  useEffect(() => {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const { source, baseDir, onRendered } = latest.current;
      if (content.current) content.current.innerHTML = renderMarkdown(source, baseDir);
      onRendered();
    }, RENDER_INTERVAL_MS);
  }, [props.source, props.baseDir]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
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
    } else if (/^(https?|mailto):/i.test(href)) {
      if (isTauri()) void openUrl(href);
      else window.open(href, "_blank", "noopener");
    }
    // Relative links to other files open in tabs once milestone 4 adds them.
  };

  return (
    <div ref={pane} className="pane pane-preview" style={{ display: props.hidden ? "none" : undefined }} onClick={onClick}>
      <div ref={content} className="markdown-body" />
    </div>
  );
});
