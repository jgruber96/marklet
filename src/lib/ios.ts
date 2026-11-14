/*
 * iPad and iPhone adjustments that live outside React:
 *
 * - `html.ios` turns on the touch-sized styles in app.css (44 pt targets, safe areas).
 * - The app is sized to the visible part of the screen, so the on-screen
 *   keyboard shrinks the editor instead of covering it.
 * - Pressing and holding opens the same menu a right-click does (the file
 *   tree's New / Rename / Delete), since iOS sends no right-click for a touch.
 */

/** How long a press is held before it counts as a right-click (ms), and how far it may drift (px). */
const HOLD = 500;
const SLOP = 10;

/** Where a long press does nothing: text fields and the editor keep iOS's own text selection. */
const KEEP_NATIVE = "input, textarea, [contenteditable], .cm-editor";

export function installIOSLayout(): void {
  const root = document.documentElement;
  root.classList.add("ios");

  // The visible area: everything but the on-screen keyboard. iOS scrolls the page up
  // to show the cursor; with the app sized to fit, scroll it back.
  const view = window.visualViewport;
  if (view) {
    const fit = () => {
      root.style.setProperty("--app-height", `${Math.round(view.height)}px`);
      // The keyboard is up: the status bar steps aside, and when little is left (a phone on its
      // side) the tab strip does too, so the text keeps most of the space.
      const keyboard = window.innerHeight - view.height > 120;
      root.classList.toggle("keyboard-up", keyboard);
      root.classList.toggle("short", keyboard && view.height < 480);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    view.addEventListener("resize", fit);
    view.addEventListener("scroll", fit);
    fit();
  }

  installLongPress();
}

function installLongPress(): void {
  let timer = 0;
  let start: { x: number; y: number } | null = null;
  /** A hold opened the menu and the finger is still down. */
  let held = false;
  /**
   * Until this time, mouse events are swallowed: iOS can send a mousedown and
   * click for the finger that just held, which would close the menu or open the file.
   */
  let swallowUntil = 0;

  const cancel = () => {
    window.clearTimeout(timer);
    start = null;
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      cancel();
      if (e.pointerType !== "touch" || !(e.target instanceof Element) || e.target.closest(KEEP_NATIVE)) return;
      const target = e.target;
      start = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      timer = window.setTimeout(() => {
        start = null;
        held = true;
        swallowUntil = Infinity;
        target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
      }, HOLD);
    },
    true,
  );

  document.addEventListener(
    "pointermove",
    (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"]) {
    document.addEventListener(
      type,
      () => {
        cancel();
        // The finger that held is lifted: swallow only the mouse events that trail it.
        if (held) {
          held = false;
          swallowUntil = Date.now() + 350;
        }
      },
      true,
    );
  }

  const swallow = (e: Event) => {
    if (Date.now() < swallowUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  for (const type of ["mousedown", "mouseup", "click"]) document.addEventListener(type, swallow, true);
}
