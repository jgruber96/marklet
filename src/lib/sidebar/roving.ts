import type { KeyboardEvent } from "react";

/**
 * Roving tab stop for a list of rows: only one row is in the Tab order (the
 * current one, else the first), and arrow keys move between rows.
 */
export function syncTabStop(container: HTMLElement | null, rowSelector: string, currentSelector: string): void {
  if (!container) return;
  const rows = [...container.querySelectorAll<HTMLElement>(rowSelector)];
  if (rows.some((r) => r === document.activeElement)) {
    rows.forEach((r) => (r.tabIndex = r === document.activeElement ? 0 : -1));
    return;
  }
  const stop = container.querySelector<HTMLElement>(currentSelector) ?? rows[0];
  rows.forEach((r) => (r.tabIndex = r === stop ? 0 : -1));
}

/** Moves focus for Up, Down, Home and End; returns true when it handled the key. */
export function moveFocus(e: KeyboardEvent, container: HTMLElement | null, rowSelector: string): boolean {
  if (!container) return false;
  const rows = [...container.querySelectorAll<HTMLElement>(rowSelector)];
  const i = rows.indexOf(e.currentTarget as HTMLElement);
  const target =
    e.key === "ArrowDown" ? rows[i + 1] : e.key === "ArrowUp" ? rows[i - 1] : e.key === "Home" ? rows[0] : e.key === "End" ? rows[rows.length - 1] : undefined;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return false;
  e.preventDefault();
  if (target) focusRow(rows, target);
  return true;
}

export function focusRow(rows: HTMLElement[], target: HTMLElement): void {
  rows.forEach((r) => (r.tabIndex = r === target ? 0 : -1));
  target.focus();
}
