import type { PointerEvent as ReactPointerEvent } from "react";

/** Vertical drag handle; reports the pointer's clientX while dragging. */
export function Splitter({ onDrag, label }: { onDrag(clientX: number): void; label: string }) {
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => onDrag(ev.clientX);
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.classList.remove("dragging");
      document.body.classList.remove("resizing");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  return <div className="splitter" role="separator" aria-orientation="vertical" aria-label={label} onPointerDown={start} />;
}
